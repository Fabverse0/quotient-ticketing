import type { Clock } from "../../shared/clock.js";
import type { Database } from "../../shared/db/client.js";
import { AppError } from "../../shared/errors.js";
import { withCapacityGuard } from "./capacity-guard.js";
import { activeTicketCount, findTicketTypeForOrder, insertPendingOrder, lockBuyerEvent } from "./queries.js";
import { MAX_TICKETS_PER_BUYER_PER_EVENT, ORDER_HOLD_MS, type CreateOrderInput } from "./schemas.js";
import { atomicStrategy, type QuotaStrategy } from "./strategy.js";
import { toOrderView, type OrderView } from "./views.js";

export function createOrdersService({
  db,
  clock,
  strategy = atomicStrategy,
}: {
  db: Database;
  clock: Clock;
  strategy?: QuotaStrategy;
}) {
  return {
    // Step order matters: cheap rejections first, then the per-buyer lock
    // before counting, and the contended ticket_types row as late as possible
    // because its row lock is held until commit.
    async create(buyerId: string, input: CreateOrderInput): Promise<OrderView> {
      return withCapacityGuard(() =>
        db.transaction(async (tx) => {
          const ticketType = await findTicketTypeForOrder(tx, input.ticketTypeId);
          if (!ticketType) {
            throw new AppError(404, "TICKET_TYPE_NOT_FOUND", "Tipe tiket tidak ditemukan");
          }
          const now = clock.now();
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
        }),
      );
    },
  };
}

export type OrdersService = ReturnType<typeof createOrdersService>;
