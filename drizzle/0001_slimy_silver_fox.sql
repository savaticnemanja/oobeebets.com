ALTER TABLE "waitlist" ADD COLUMN "unsubscribe_token" text DEFAULT gen_random_uuid()::text NOT NULL;--> statement-breakpoint
ALTER TABLE "waitlist" ADD COLUMN "unsubscribed_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "waitlist_unsubscribe_token_unique" ON "waitlist" USING btree ("unsubscribe_token");