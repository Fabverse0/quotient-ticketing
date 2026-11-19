import type { Clock } from "../../shared/clock.js";
import { createHash } from "node:crypto";
import type { Database, Transaction } from "../../shared/db/client.js";
import { AppError } from "../../shared/errors.js";
import { findTicketsForOrder } from "../tickets/queries.js";
import { withCapacityGuard } from "./capacity-guard.js";
import {
  activeTicketCount,
  cancelPendingOrder,
  findIdempotencyKey,
  findOrderForBuyer,
  findTicketTypeForOrder,
  insertIdempotencyKey,
  insertPendingOrder,
  listOrdersForBuyer,
  lockBuyerEvent,
  lockIdempotencyKey,
  releaseReservation,
} from "./queries.js";
import { MAX_TICKETS_PER_BUYER_PER_EVENT, ORDER_HOLD_MS, type CreateOrderInput } from "./schemas.js";
import { atomicStrategy, type QuotaStrategy } from "./strategy.js";
import { toOrderDetailView, toOrderView, type OrderDetailView, type OrderView } from "./views.js";

// Hashes the parsed input with a fixed field order, so the same values sent
// with different key order or whitespace count as the same request.
function hashOrderRequest(input: CreateOrderInput): string {
  const canonical = JSON.stringify({ ticketTypeId: input.ticketTypeId, quantity: input.quantity });
  return createHash("sha256").update(canonical).digest("hex");
}

export function createOrdersService({
  db,
  clock,
  strategy = atomicStrategy,
}: {
  db: Database;
  clock: Clock;
  strategy?: QuotaStrategy;
}) {
  // Cheap rejections first, the buyer lock before counting, and the contended
  // ticket_types row last, since its row lock is held until commit.
  async function placeOrder(tx: Transaction, buyerId: string, input: CreateOrderInput, now: Date): Promise<OrderView> {
    const ticketType = await findTicketTypeForOrder(tx, input.ticketTypeId);
    if (!ticketType) {
      throw new AppError(404, "TICKET_TYPE_NOT_FOUND", "Tipe tiket tidak ditemukan");
    }
    if (ticketType.eventStartsAt <= now) {
      throw new AppError(409, "EVENT_ALREADY_STARTED", "Event sudah dimulai, tiket tidak bisa dipesan");
    }

    await lockBuyerEvent(tx, buyerId, ticketType.eventId);
    const active = await activeTicketCount(tx, buyerId, ticketType.eventId);
    if (active + input.quantity > MAX_TICKETS_PER_BUYER_PER_EVENT) {
      throw new AppError(
        409,
        "BUYER_LIMIT_EXCEEDED",
        `Maksimal ${MAX_TICKETS_PER_BUYER_PER_EVENT} tiket per pembeli per event`,
      );
    }

    if (!(await strategy.reserve(tx, ticketType.id, input.quantity))) {
      throw new AppError(409, "QUOTA_EXHAUSTED", "Kuota tiket tidak mencukupi");
    }

    const order = await insertPendingOrder(tx, {
      buyerId,
      eventId: ticketType.eventId,
      ticketTypeId: ticketType.id,
      quantity: input.quantity,
      totalPrice: ticketType.price * input.quantity,
      createdAt: now,
      expiresAt: new Date(now.getTime() + ORDER_HOLD_MS),
    });
    return toOrderView({
      order,
      eventTitle: ticketType.eventTitle,
      eventStartsAt: ticketType.eventStartsAt,
      ticketKind: ticketType.kind,
    });
  }

  return {
    // The key is checked first so a replay returns the original order even after
    // the event starts. A failed request rolls the key back with the order.
    async create(
      buyerId: string,
      input: CreateOrderInput,
      idempotencyKey?: string,
    ): Promise<{ order: OrderView; replayed: boolean }> {
      return withCapacityGuard(() =>
        db.transaction(async (tx) => {
          const now = clock.now();
          if (!idempotencyKey) {
            return { order: await placeOrder(tx, buyerId, input, now), replayed: false };
          }

          const requestHash = hashOrderRequest(input);
          await lockIdempotencyKey(tx, buyerId, idempotencyKey);
          const existing = await findIdempotencyKey(tx, buyerId, idempotencyKey);
          if (existing) {
            if (existing.requestHash !== requestHash) {
              throw new AppError(
                422,
                "IDEMPOTENCY_KEY_REUSED",
                "Idempotency-Key ini sudah dipakai untuk request dengan isi berbeda",
              );
            }
            const previous = await findOrderForBuyer(tx, existing.orderId, buyerId);
            return { order: toOrderView(previous!), replayed: true };
          }

          const order = await placeOrder(tx, buyerId, input, now);
          await insertIdempotencyKey(tx, {
            buyerId,
            key: idempotencyKey,
            requestHash,
            orderId: order.id,
            createdAt: now,
          });
          return { order, replayed: false };
        }),
      );
    },

    // Lock order: the orders row first, then ticket_types. Only the
    // transaction that won the status transition gives the quota back.
    async cancel(buyerId: string, orderId: string): Promise<OrderView> {
      return db.transaction(async (tx) => {
        const now = clock.now();
        const cancelled = await cancelPendingOrder(tx, orderId, buyerId, now);
        if (cancelled) {
          await releaseReservation(tx, cancelled.ticketTypeId, cancelled.quantity);
        }

        const current = await findOrderForBuyer(tx, orderId, buyerId);
        if (!current) {
          throw new AppError(404, "ORDER_NOT_FOUND", "Pesanan tidak ditemukan");
        }
        if (!cancelled) {
          // Still PENDING here means the guard failed on expires_at.
          if (current.order.status === "PENDING") {
            throw new AppError(409, "ORDER_EXPIRED", "Waktu tahan pesanan sudah habis");
          }
          throw new AppError(409, "ORDER_NOT_PENDING", "Pesanan sudah tidak berstatus PENDING");
        }
        return toOrderView(current);
      });
    },

    async list(buyerId: string): Promise<OrderView[]> {
      const rows = await listOrdersForBuyer(db, buyerId);
      return rows.map(toOrderView);
    },

    // Another buyer's order gets the same 404 as a missing one: unlike an
    // event, the existence of an order is private.
    async get(buyerId: string, orderId: string): Promise<OrderDetailView> {
      const found = await findOrderForBuyer(db, orderId, buyerId);
      if (!found) {
        throw new AppError(404, "ORDER_NOT_FOUND", "Pesanan tidak ditemukan");
      }
      return toOrderDetailView(found, await findTicketsForOrder(db, orderId));
    },
  };
}

export type OrdersService = ReturnType<typeof createOrdersService>;
