ALTER TYPE "public"."notification_kind" ADD VALUE 'quote';--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "quote_id" uuid;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_quote_id_posts_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."posts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "posts_quote_idx" ON "posts" USING btree ("quote_id");