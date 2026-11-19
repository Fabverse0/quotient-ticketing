import type { Clock } from "../../shared/clock.js";
import type { Database, Transaction } from "../../shared/db/client.js";
import { AppError } from "../../shared/errors.js";
import { findOrderForBuyer } from "../orders/queries.js";
import { toOrderDetailView, type OrderDetailView } from "../orders/views.js";
import { generateTicketCode } from "../tickets/code.js";
import { findTicketsForOrder, insertTickets, type TicketRow } from "../tickets/queries.js";
import { findOrderStatus, markPendingOrderPaid, moveReservationToSold } from "./queries.js";

export type PaymentResult =
  | { kind: "PAID"; tickets: TicketRow[] }
  | { kind: "ALREADY_PAID"; tickets: TicketRow[] }
  | { kind: "NOT_FOUND" }
  | { kind: "PENDING_PAST_EXPIRY" }
  | { kind: "NOT_PAYABLE"; status: "CANCELLED" | "EXPIRED" | "REFUND_REQUIRED" };

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
  switch (status) {
    case undefined:
      return { kind: "NOT_FOUND" };
    case "PAID":
      return { kind: "ALREADY_PAID", tickets: await findTicketsForOrder(tx, orderId) };
    // Still PENDING after a lost transition means the expires_at guard failed.
    case "PENDING":
      return { kind: "PENDING_PAST_EXPIRY" };
    default:
      return { kind: "NOT_PAYABLE", status };
  }
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
          case "PENDING_PAST_EXPIRY":
            throw new AppError(409, "ORDER_EXPIRED", "Waktu tahan pesanan sudah habis");
          case "NOT_PAYABLE":
            if (result.status === "EXPIRED") {
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
  };
}

export type PaymentsService = ReturnType<typeof createPaymentsService>;
