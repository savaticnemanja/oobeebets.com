-- The social layer: public profiles, posts (replies are posts with a parent),
-- likes, follows between users, and cached link previews.
--
-- user_follows, not follows: "follow" already means "I took this bet" here
-- (pick_follows). users.username is added nullable, backfilled, and only then
-- made NOT NULL, so this runs against a table that already holds real testers.
CREATE TABLE "link_previews" (
	"url" text PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"title" text,
	"description" text,
	"image_url" text,
	"site_name" text,
	"card_type" text,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_likes" (
	"user_id" uuid NOT NULL,
	"post_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_likes_user_id_post_id_pk" PRIMARY KEY("user_id","post_id")
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_id" uuid NOT NULL,
	"parent_id" uuid,
	"body" text NOT NULL,
	"link_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "posts_body_length" CHECK (char_length("posts"."body") between 1 and 280)
);
--> statement-breakpoint
CREATE TABLE "user_follows" (
	"follower_id" uuid NOT NULL,
	"followee_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_follows_follower_id_followee_id_pk" PRIMARY KEY("follower_id","followee_id"),
	CONSTRAINT "user_follows_not_self" CHECK ("user_follows"."follower_id" <> "user_follows"."followee_id")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "username" text;--> statement-breakpoint
-- Backfill a handle for every account that predates profiles, from the local
-- part of its email: lowercased, stripped to [a-z0-9_], cut to 15 characters,
-- padded to the 3-character minimum, and numbered (bob, bob2, ...) when two
-- emails reduce to the same thing. Testers can change theirs on /account.
--
-- The padding is a CASE, not a bare rpad(): rpad also TRUNCATES anything
-- longer than its target length, so rpad(x, 3, '_') would cut every handle
-- down to three characters.
WITH stripped AS (
	SELECT "id", "created_at",
		left(coalesce(nullif(regexp_replace(lower(split_part("email", '@', 1)), '[^a-z0-9_]', '', 'g'), ''), 'user'), 15) AS "s"
	FROM "users"
), base AS (
	SELECT "id", "created_at",
		CASE WHEN length("s") < 3 THEN rpad("s", 3, '_') ELSE "s" END AS "b"
	FROM stripped
), ranked AS (
	SELECT "id", "b", row_number() OVER (PARTITION BY "b" ORDER BY "created_at", "id") AS "rn"
	FROM base
)
UPDATE "users" u
SET "username" = r."b" || CASE WHEN r."rn" = 1 THEN '' ELSE r."rn"::text END
FROM ranked r
WHERE r."id" = u."id";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "username" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "bio" text;--> statement-breakpoint
ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_parent_id_posts_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_follows" ADD CONSTRAINT "user_follows_follower_id_users_id_fk" FOREIGN KEY ("follower_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_follows" ADD CONSTRAINT "user_follows_followee_id_users_id_fk" FOREIGN KEY ("followee_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "post_likes_post_idx" ON "post_likes" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "posts_author_created_idx" ON "posts" USING btree ("author_id","created_at");--> statement-breakpoint
CREATE INDEX "posts_parent_created_idx" ON "posts" USING btree ("parent_id","created_at");--> statement-breakpoint
CREATE INDEX "posts_created_idx" ON "posts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "user_follows_followee_idx" ON "user_follows" USING btree ("followee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_unique" ON "users" USING btree ("username");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_username_format" CHECK ("users"."username" ~ '^[a-z0-9_]{3,20}$');--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_bio_length" CHECK ("users"."bio" is null or char_length("users"."bio") <= 160);