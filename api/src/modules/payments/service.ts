import type { Clock } from "../../shared/clock.js";
import type { Database, Transaction } from "../../shared/db/client.js";
import { AppError } from "../../shared/errors.js";
import { findOrderForBuyer, releaseReservation } from "../orders/queries.js";
import { toOrderDetailView, type OrderDetailView } from "../orders/views.js";
import { generateTicketCode } from "../tickets/code.js";
import { findTicketsForOrder, insertTickets, type TicketRow } from "../tickets/queries.js";
import {
  findOrderStatus,
  findOrderTotal,
  findWebhookOutcome,
  markClosedOrderRefundRequired,
  markExpiredPendingRefundRequired,
  markPendingOrderPaid,
  moveReservationToSold,
  recordWebhookEvent,
  setWebhookOutcome,
  type WebhookOutcome,
} from "./queries.js";
import type { PaymentWebhook } from "./schemas.js";

export type PaymentResult =
  | { kind: "PAID"; tickets: TicketRow[] }
  | { kind: "ALREADY_PAID"; tickets: TicketRow[] }
  | { kind: "NOT_FOUND" }
  // PENDING here means the row is past expires_at but not yet swept.
  | { kind: "NOT_PAYABLE"; status: "PENDING" | "CANCELLED" | "EXPIRED" | "REFUND_REQUIRED" };

// Lock order: the orders row (status transition) first, then ticket_types.
// Only the transaction that won the transition touches the counters or
// issues tickets; everyone else only reads why it lost.
export async function markOrderPaid(
  tx: Transaction,
  orderId: string,
  now: Date,
  buyerId?: string,
): Promise<PaymentResult> {
  const won = await markPendingOrderPaid(tx, orderId, now, buyerId);
  if (won) {
    await moveReservationToSold(tx, won.ticketTypeId, won.quantity);
    const codes = Array.from({ length: won.quantity }, generateTicketCode);
    return { kind: "PAID", tickets: await insertTickets(tx, orderId, codes, now) };
  }

  const status = await findOrderStatus(tx, orderId, buyerId);
  if (status === undefined) return { kind: "NOT_FOUND" };
  if (status === "PAID") return { kind: "ALREADY_PAID", tickets: await findTicketsForOrder(tx, orderId) };
  return { kind: "NOT_PAYABLE", status };
}

// Each guard is its own status-conditioned UPDATE, so a sweeper expiring the
// same order at the same moment cannot make the hold come back twice.
async function flagRefundRequired(tx: Transaction, orderId: string, now: Date): Promise<WebhookOutcome> {
  const pending = await markExpiredPendingRefundRequired(tx, orderId, now);
  if (pending) {
    await releaseReservation(tx, pending.ticketTypeId, pending.quantity);
    return "REFUND_REQUIRED";
  }
  if (await markClosedOrderRefundRequired(tx, orderId, now)) {
    return "REFUND_REQUIRED";
  }
  const status = await findOrderStatus(tx, orderId);
  if (status === "REFUND_REQUIRED") return "ALREADY_REFUND_REQUIRED";
  if (status === "PAID") return "ALREADY_PAID";
  throw new Error(`order ${orderId} in unexpected state ${status} for a late payment`);
}

async function processWebhook(tx: Transaction, event: PaymentWebhook, now: Date): Promise<WebhookOutcome> {
  const totalPrice = await findOrderTotal(tx, event.order_id);
  if (totalPrice === undefined) return "ORDER_NOT_FOUND";
  // A failed attempt changes nothing: the hold runs out on its own.
  if (event.event_type === "payment.failed") return "PAYMENT_FAILED";
  if (event.amount !== totalPrice) return "AMOUNT_MISMATCH";

  const result = await markOrderPaid(tx, event.order_id, now);
  switch (result.kind) {
    case "PAID":
    case "ALREADY_PAID":
      return result.kind;
    case "NOT_FOUND":
      return "ORDER_NOT_FOUND";
    case "NOT_PAYABLE":
      return result.status === "REFUND_REQUIRED"
        ? "ALREADY_REFUND_REQUIRED"
        : flagRefundRequired(tx, event.order_id, now);
  }
}

export interface WebhookReceipt {
  received: true;
  duplicate: boolean;
  outcome: WebhookOutcome | null;
}

export function createPaymentsService({ db, clock }: { db: Database; clock: Clock }) {
  return {
    // Paying twice returns the same order and tickets: the usual cause is a
    // retry after the first response was lost, and nothing is issued again.
    async payAsBuyer(buyerId: string, orderId: string): Promise<OrderDetailView> {
      return db.transaction(async (tx) => {
        const result = await markOrderPaid(tx, orderId, clock.now(), buyerId);
        switch (result.kind) {
          case "NOT_FOUND":
            throw new AppError(404, "ORDER_NOT_FOUND", "Pesanan tidak ditemukan");
          case "NOT_PAYABLE":
            if (result.status === "PENDING" || result.status === "EXPIRED") {
              throw new AppError(409, "ORDER_EXPIRED", "Waktu tahan pesanan sudah habis");
            }
            throw new AppError(409, "ORDER_NOT_PENDING", "Pesanan sudah tidak berstatus PENDING");
          default: {
            const order = await findOrderForBuyer(tx, orderId, buyerId);
            return toOrderDetailView(order!, result.tickets);
          }
        }
      });
    },

    // Every recorded event is answered with 2xx, whatever its outcome, so the
    // provider stops retrying. Recording and processing share one transaction:
    // if processing fails, the event is not recorded and a retry runs again.
    async handleWebhook(event: PaymentWebhook, payload: unknown): Promise<WebhookReceipt> {
      return db.transaction(async (tx) => {
        const now = clock.now();
        const isNew = await recordWebhookEvent(tx, {
          eventId: event.event_id,
          eventType: event.event_type,
          payload,
          orderId: event.order_id,
          receivedAt: now,
        });
        if (!isNew) {
          return { received: true, duplicate: true, outcome: await findWebhookOutcome(tx, event.event_id) };
        }

        const outcome = await processWebhook(tx, event, now);
        await setWebhookOutcome(tx, event.event_id, outcome);
        if (outcome === "AMOUNT_MISMATCH") {
          console.error("payment webhook amount mismatch", { eventId: event.event_id, orderId: event.order_id });
        }
        return { received: true, duplicate: false, outcome };
      });
    },
  };
}

export type PaymentsService = ReturnType<typeof createPaymentsService>;
