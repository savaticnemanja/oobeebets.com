-- Media (images, GIFs) and polls on posts.
--
-- post_media holds uploads as bytea — already shrunk in the browser to well
-- under nginx's 1 MB body limit — so the nightly dump backs them up and there
-- is no volume to lose; a GIF picked from GIPHY is a URL instead.
-- post_polls / poll_options / poll_votes: two to four options, one final vote
-- per person. posts_body_length drops its lower bound: a post may be only a
-- photo, a GIF or a parlay, which the app checks (the database can't see the
-- other tables from a CHECK).
CREATE TABLE "poll_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"label" text NOT NULL,
	CONSTRAINT "poll_options_position_unique" UNIQUE("post_id","position"),
	CONSTRAINT "poll_options_label_length" CHECK (char_length("poll_options"."label") between 1 and 25)
);
--> statement-breakpoint
CREATE TABLE "poll_votes" (
	"post_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"option_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "poll_votes_post_id_user_id_pk" PRIMARY KEY("post_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "post_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid,
	"uploader_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"mime" text NOT NULL,
	"data" "bytea",
	"url" text,
	"width" integer,
	"height" integer,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_media_kind" CHECK ("post_media"."kind" in ('image', 'gif')),
	CONSTRAINT "post_media_source" CHECK ("post_media"."data" is not null or "post_media"."url" is not null)
);
--> statement-breakpoint
CREATE TABLE "post_polls" (
	"post_id" uuid PRIMARY KEY NOT NULL,
	"ends_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "posts" DROP CONSTRAINT "posts_body_length";--> statement-breakpoint
ALTER TABLE "poll_options" ADD CONSTRAINT "poll_options_post_id_post_polls_post_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."post_polls"("post_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_post_id_post_polls_post_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."post_polls"("post_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_option_id_poll_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."poll_options"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_media" ADD CONSTRAINT "post_media_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_media" ADD CONSTRAINT "post_media_uploader_id_users_id_fk" FOREIGN KEY ("uploader_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_polls" ADD CONSTRAINT "post_polls_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "poll_votes_option_idx" ON "poll_votes" USING btree ("option_id");--> statement-breakpoint
CREATE INDEX "post_media_post_idx" ON "post_media" USING btree ("post_id","position");--> statement-breakpoint
CREATE INDEX "post_media_uploader_idx" ON "post_media" USING btree ("uploader_id","created_at");--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_body_length" CHECK (char_length("posts"."body") <= 280);