CREATE TYPE "public"."subscription_status" AS ENUM('incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused');--> statement-breakpoint
CREATE TYPE "public"."tier" AS ENUM('base', 'pro', 'elite');--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"stripe_subscription_id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"stripe_customer_id" text NOT NULL,
	"tier" "tier" NOT NULL,
	"status" "subscription_status" NOT NULL,
	"stripe_price_id" text NOT NULL,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "stripe_customer_id" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "subscriptions_user_idx" ON "subscriptions" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "users_stripe_customer_unique" ON "users" USING btree ("stripe_customer_id");