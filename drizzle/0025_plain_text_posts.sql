DROP TABLE "link_previews" CASCADE;--> statement-breakpoint
DROP TABLE "poll_options" CASCADE;--> statement-breakpoint
DROP TABLE "poll_votes" CASCADE;--> statement-breakpoint
DROP TABLE "post_media" CASCADE;--> statement-breakpoint
DROP TABLE "post_polls" CASCADE;--> statement-breakpoint
ALTER TABLE "posts" DROP COLUMN "link_url";