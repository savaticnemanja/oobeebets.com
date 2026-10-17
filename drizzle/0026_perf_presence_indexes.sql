CREATE TABLE "user_active_days" (
	"day" date NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "user_active_days_day_user_id_pk" PRIMARY KEY("day","user_id")
);
--> statement-breakpoint
ALTER TABLE "user_active_days" ADD CONSTRAINT "user_active_days_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_active_days_user_idx" ON "user_active_days" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_log_action_created_idx" ON "audit_log" USING btree ("action" text_pattern_ops,"created_at");--> statement-breakpoint
CREATE INDEX "audit_log_user_subject_idx" ON "audit_log" USING btree ("entity_id") WHERE "audit_log"."entity" = 'user';--> statement-breakpoint
CREATE INDEX "parlay_follows_created_idx" ON "parlay_follows" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "pick_follows_created_idx" ON "pick_follows" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "post_likes_created_idx" ON "post_likes" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "user_follows_created_idx" ON "user_follows" USING btree ("created_at");--> statement-breakpoint
-- History for the overview from day one: every day an account did something
-- on record. Slate days run 04:00 to 04:00 America/New_York (SLATE_TIMEZONE's
-- default), the same rule as slateDateString().
INSERT INTO "user_active_days" ("day", "user_id")
SELECT DISTINCT ((e.at AT TIME ZONE 'America/New_York') - interval '4 hours')::date, e.user_id
FROM (
	SELECT "author_id" AS user_id, "created_at" AS at FROM "posts"
	UNION ALL SELECT "user_id", "created_at" FROM "post_likes"
	UNION ALL SELECT "user_id", "created_at" FROM "post_reposts"
	UNION ALL SELECT "user_id", "created_at" FROM "post_views"
	UNION ALL SELECT "user_id", "created_at" FROM "pick_follows"
	UNION ALL SELECT "user_id", "created_at" FROM "parlay_follows"
	UNION ALL SELECT "follower_id", "created_at" FROM "user_follows"
	UNION ALL SELECT "user_id", "created_at" FROM "sessions"
	UNION ALL SELECT "user_id", "last_seen_at" FROM "sessions"
	UNION ALL SELECT "id", "last_login_at" FROM "users" WHERE "last_login_at" IS NOT NULL
) e
ON CONFLICT DO NOTHING;
