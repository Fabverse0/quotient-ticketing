CREATE EXTENSION IF NOT EXISTS citext;--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('PENDING', 'PAID', 'CANCELLED', 'EXPIRED', 'REFUND_REQUIRED');--> statement-breakpoint
CREATE TYPE "public"."ticket_kind" AS ENUM('REGULAR', 'VIP');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('buyer', 'organizer');--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizer_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"venue" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"buyer_id" uuid NOT NULL,
	"key" text NOT NULL,
	"request_hash" text NOT NULL,
	"order_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_keys_pk" PRIMARY KEY("buyer_id","key")
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"buyer_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"ticket_type_id" uuid NOT NULL,
	"quantity" smallint NOT NULL,
	"status" "order_status" DEFAULT 'PENDING' NOT NULL,
	"total_price" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"expired_at" timestamp with time zone,
	"refund_required_at" timestamp with time zone,
	CONSTRAINT "orders_quantity_range" CHECK ("orders"."quantity" BETWEEN 1 AND 4),
	CONSTRAINT "orders_total_price_nonneg" CHECK ("orders"."total_price" >= 0),
	CONSTRAINT "orders_paid_at_set" CHECK ("orders"."status" <> 'PAID' OR "orders"."paid_at" IS NOT NULL),
	CONSTRAINT "orders_cancelled_at_set" CHECK ("orders"."status" <> 'CANCELLED' OR "orders"."cancelled_at" IS NOT NULL),
	CONSTRAINT "orders_expired_at_set" CHECK ("orders"."status" <> 'EXPIRED' OR "orders"."expired_at" IS NOT NULL),
	CONSTRAINT "orders_refund_required_at_set" CHECK ("orders"."status" <> 'REFUND_REQUIRED' OR "orders"."refund_required_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "processed_events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"order_id" uuid,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"kind" "ticket_kind" NOT NULL,
	"price" integer NOT NULL,
	"quota" integer NOT NULL,
	"sold" integer DEFAULT 0 NOT NULL,
	"reserved" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "ticket_types_event_kind_unique" UNIQUE("event_id","kind"),
	CONSTRAINT "ticket_types_id_event_unique" UNIQUE("id","event_id"),
	CONSTRAINT "ticket_types_price_nonneg" CHECK ("ticket_types"."price" >= 0),
	CONSTRAINT "ticket_types_quota_nonneg" CHECK ("ticket_types"."quota" >= 0),
	CONSTRAINT "ticket_types_sold_nonneg" CHECK ("ticket_types"."sold" >= 0),
	CONSTRAINT "ticket_types_reserved_nonneg" CHECK ("ticket_types"."reserved" >= 0),
	CONSTRAINT "ticket_types_capacity" CHECK ("ticket_types"."sold" + "ticket_types"."reserved" <= "ticket_types"."quota")
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"seq" smallint NOT NULL,
	"code" text NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tickets_code_unique" UNIQUE("code"),
	CONSTRAINT "tickets_order_seq_unique" UNIQUE("order_id","seq"),
	CONSTRAINT "tickets_seq_range" CHECK ("tickets"."seq" BETWEEN 1 AND 4)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" "citext" NOT NULL,
	"password_hash" text NOT NULL,
	"name" text NOT NULL,
	"role" "user_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_organizer_id_users_id_fk" FOREIGN KEY ("organizer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_ticket_type_event_fk" FOREIGN KEY ("ticket_type_id","event_id") REFERENCES "public"."ticket_types"("id","event_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processed_events" ADD CONSTRAINT "processed_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_types" ADD CONSTRAINT "ticket_types_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orders_active_per_buyer_event_idx" ON "orders" USING btree ("buyer_id","event_id") WHERE "orders"."status" IN ('PENDING', 'PAID');--> statement-breakpoint
CREATE INDEX "orders_pending_expiry_idx" ON "orders" USING btree ("expires_at") WHERE "orders"."status" = 'PENDING';--> statement-breakpoint
CREATE INDEX "orders_buyer_history_idx" ON "orders" USING btree ("buyer_id","created_at" DESC NULLS LAST);