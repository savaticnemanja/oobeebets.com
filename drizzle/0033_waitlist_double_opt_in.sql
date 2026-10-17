ALTER TABLE "waitlist" ADD COLUMN "confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "waitlist" ADD COLUMN "confirm_token_hash" text;--> statement-breakpoint
ALTER TABLE "waitlist" ADD COLUMN "confirm_sent_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "waitlist_confirm_token_unique" ON "waitlist" USING btree ("confirm_token_hash");--> statement-breakpoint
-- Everyone already waiting signed up before confirmation existed; they count.
UPDATE "waitlist" SET "confirmed_at" = "created_at" WHERE "confirmed_at" IS NULL;
