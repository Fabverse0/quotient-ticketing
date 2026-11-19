import { sql } from "drizzle-orm";
import {
  check,
  customType,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

const citext = customType<{ data: string }>({
  dataType: () => "citext",
});

const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

export const userRole = pgEnum("user_role", ["buyer", "organizer"]);
export const ticketKind = pgEnum("ticket_kind", ["REGULAR", "VIP"]);
export const orderStatus = pgEnum("order_status", [
  "PENDING",
  "PAID",
  "CANCELLED",
  "EXPIRED",
  "REFUND_REQUIRED",
]);

export const webhookOutcome = pgEnum("webhook_outcome", [
  "PAID",
  "ALREADY_PAID",
  "REFUND_REQUIRED",
  "ALREADY_REFUND_REQUIRED",
  "AMOUNT_MISMATCH",
  "ORDER_NOT_FOUND",
  "PAYMENT_FAILED",
]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: citext("email").notNull().unique("users_email_unique"),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  role: userRole("role").notNull(),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
});

export const events = pgTable("events", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizerId: uuid("organizer_id")
    .notNull()
    .references(() => users.id),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  venue: text("venue").notNull(),
  startsAt: timestamptz("starts_at").notNull(),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
});

export const ticketTypes = pgTable(
  "ticket_types",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id),
    kind: ticketKind("kind").notNull(),
    price: integer("price").notNull(),
    quota: integer("quota").notNull(),
    sold: integer("sold").notNull().default(0),
    reserved: integer("reserved").notNull().default(0),
  },
  (t) => [
    unique("ticket_types_event_kind_unique").on(t.eventId, t.kind),
    unique("ticket_types_id_event_unique").on(t.id, t.eventId),
    check("ticket_types_price_nonneg", sql`${t.price} >= 0`),
    check("ticket_types_quota_nonneg", sql`${t.quota} >= 0`),
    check("ticket_types_sold_nonneg", sql`${t.sold} >= 0`),
    check("ticket_types_reserved_nonneg", sql`${t.reserved} >= 0`),
    check("ticket_types_capacity", sql`${t.sold} + ${t.reserved} <= ${t.quota}`),
  ],
);

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    buyerId: uuid("buyer_id")
      .notNull()
      .references(() => users.id),
    eventId: uuid("event_id").notNull(),
    ticketTypeId: uuid("ticket_type_id").notNull(),
    quantity: smallint("quantity").notNull(),
    status: orderStatus("status").notNull().default("PENDING"),
    totalPrice: integer("total_price").notNull(),
    expiresAt: timestamptz("expires_at").notNull(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    paidAt: timestamptz("paid_at"),
    cancelledAt: timestamptz("cancelled_at"),
    expiredAt: timestamptz("expired_at"),
    refundRequiredAt: timestamptz("refund_required_at"),
  },
  (t) => [
    foreignKey({
      name: "orders_ticket_type_event_fk",
      columns: [t.ticketTypeId, t.eventId],
      foreignColumns: [ticketTypes.id, ticketTypes.eventId],
    }),
    foreignKey({
      name: "orders_event_id_fk",
      columns: [t.eventId],
      foreignColumns: [events.id],
    }),
    check("orders_quantity_range", sql`${t.quantity} BETWEEN 1 AND 4`),
    check("orders_total_price_nonneg", sql`${t.totalPrice} >= 0`),
    check("orders_paid_at_set", sql`${t.status} <> 'PAID' OR ${t.paidAt} IS NOT NULL`),
    check(
      "orders_cancelled_at_set",
      sql`${t.status} <> 'CANCELLED' OR ${t.cancelledAt} IS NOT NULL`,
    ),
    check(
      "orders_expired_at_set",
      sql`${t.status} <> 'EXPIRED' OR ${t.expiredAt} IS NOT NULL`,
    ),
    check(
      "orders_refund_required_at_set",
      sql`${t.status} <> 'REFUND_REQUIRED' OR ${t.refundRequiredAt} IS NOT NULL`,
    ),
    index("orders_active_per_buyer_event_idx")
      .on(t.buyerId, t.eventId)
      .where(sql`${t.status} IN ('PENDING', 'PAID')`),
    index("orders_pending_expiry_idx")
      .on(t.expiresAt)
      .where(sql`${t.status} = 'PENDING'`),
    index("orders_buyer_history_idx").on(t.buyerId, t.createdAt.desc()),
  ],
);

export const tickets = pgTable(
  "tickets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
    seq: smallint("seq").notNull(),
    code: text("code").notNull().unique("tickets_code_unique"),
    issuedAt: timestamptz("issued_at").notNull().defaultNow(),
  },
  (t) => [
    unique("tickets_order_seq_unique").on(t.orderId, t.seq),
    check("tickets_seq_range", sql`${t.seq} BETWEEN 1 AND 4`),
  ],
);

export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    buyerId: uuid("buyer_id")
      .notNull()
      .references(() => users.id),
    key: text("key").notNull(),
    requestHash: text("request_hash").notNull(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ name: "idempotency_keys_pk", columns: [t.buyerId, t.key] })],
);

export const processedEvents = pgTable("processed_events", {
  eventId: text("event_id").primaryKey(),
  eventType: text("event_type").notNull(),
  payload: jsonb("payload").notNull(),
  orderId: uuid("order_id").references(() => orders.id),
  // NULL only between the dedupe insert and the end of the same transaction.
  outcome: webhookOutcome("outcome"),
  receivedAt: timestamptz("received_at").notNull().defaultNow(),
});
