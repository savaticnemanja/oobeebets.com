ALTER TABLE "settings" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "subscriptions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "waitlist" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "settings" CASCADE;--> statement-breakpoint
DROP TABLE "subscriptions" CASCADE;--> statement-breakpoint
DROP TABLE "waitlist" CASCADE;--> statement-breakpoint
DROP INDEX "users_stripe_customer_idx";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "has_used_trial";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "stripe_customer_id";--> statement-breakpoint
DROP TYPE "public"."subscription_status";--> statement-breakpoint
DROP TYPE "public"."tier";