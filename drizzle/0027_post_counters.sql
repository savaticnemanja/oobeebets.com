ALTER TABLE "posts" ADD COLUMN "like_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "reply_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "repost_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- The counters are the database's job, so no path can skip them: every like,
-- unlike, repost, reply and delete — the app's, a cascade's or a script's —
-- moves them. A conflict-skipped insert inserts nothing and fires nothing.
CREATE FUNCTION "posts_count_like"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF TG_OP = 'INSERT' THEN
		UPDATE "posts" SET "like_count" = "like_count" + 1 WHERE "id" = NEW."post_id";
	ELSE
		UPDATE "posts" SET "like_count" = "like_count" - 1 WHERE "id" = OLD."post_id";
	END IF;
	RETURN NULL;
END $$;
--> statement-breakpoint
CREATE TRIGGER "post_likes_count" AFTER INSERT OR DELETE ON "post_likes" FOR EACH ROW EXECUTE FUNCTION "posts_count_like"();
--> statement-breakpoint
CREATE FUNCTION "posts_count_repost"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF TG_OP = 'INSERT' THEN
		UPDATE "posts" SET "repost_count" = "repost_count" + 1 WHERE "id" = NEW."post_id";
	ELSE
		UPDATE "posts" SET "repost_count" = "repost_count" - 1 WHERE "id" = OLD."post_id";
	END IF;
	RETURN NULL;
END $$;
--> statement-breakpoint
CREATE TRIGGER "post_reposts_count" AFTER INSERT OR DELETE ON "post_reposts" FOR EACH ROW EXECUTE FUNCTION "posts_count_repost"();
--> statement-breakpoint
CREATE FUNCTION "posts_count_reply"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF TG_OP = 'INSERT' THEN
		UPDATE "posts" SET "reply_count" = "reply_count" + 1 WHERE "id" = NEW."parent_id";
	ELSE
		UPDATE "posts" SET "reply_count" = "reply_count" - 1 WHERE "id" = OLD."parent_id";
	END IF;
	RETURN NULL;
END $$;
--> statement-breakpoint
CREATE TRIGGER "posts_reply_count_ins" AFTER INSERT ON "posts" FOR EACH ROW WHEN (NEW."parent_id" IS NOT NULL) EXECUTE FUNCTION "posts_count_reply"();
--> statement-breakpoint
CREATE TRIGGER "posts_reply_count_del" AFTER DELETE ON "posts" FOR EACH ROW WHEN (OLD."parent_id" IS NOT NULL) EXECUTE FUNCTION "posts_count_reply"();
--> statement-breakpoint
-- What's there already.
UPDATE "posts" p SET
	"like_count" = (SELECT count(*) FROM "post_likes" l WHERE l."post_id" = p."id"),
	"reply_count" = (SELECT count(*) FROM "posts" r WHERE r."parent_id" = p."id"),
	"repost_count" = (SELECT count(*) FROM "post_reposts" x WHERE x."post_id" = p."id");
