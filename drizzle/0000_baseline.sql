CREATE TYPE "public"."invite_status" AS ENUM('pending', 'accepted', 'revoked', 'expired');--> statement-breakpoint
CREATE TYPE "public"."market" AS ENUM('moneyline', 'spread', 'total', 'prop');--> statement-breakpoint
CREATE TYPE "public"."pick_category" AS ENUM('game', 'prop');--> statement-breakpoint
CREATE TYPE "public"."pick_status" AS ENUM('pending', 'won', 'lost', 'push', 'void');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TYPE "public"."spend_band" AS ENUM('under_50', '50_200', '200_500', '500_1000', 'over_1000');--> statement-breakpoint
CREATE TYPE "public"."sport" AS ENUM('soccer', 'basketball', 'baseball', 'tennis', 'hockey', 'football');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"actor_email" text,
	"action" text NOT NULL,
	"entity" text,
	"entity_id" text,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"status" "invite_status" DEFAULT 'pending' NOT NULL,
	"invited_by" uuid,
	"accepted_user_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "picks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slate_date" date NOT NULL,
	"category" "pick_category" DEFAULT 'game' NOT NULL,
	"rank" integer NOT NULL,
	"sport" "sport" NOT NULL,
	"league" text NOT NULL,
	"event" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"market" "market" NOT NULL,
	"selection" text NOT NULL,
	"price" integer NOT NULL,
	"book" text,
	"units" numeric(5, 2) DEFAULT '1.00' NOT NULL,
	"confidence" integer,
	"ev_pct" numeric(5, 2),
	"reasoning" text,
	"status" "pick_status" DEFAULT 'pending' NOT NULL,
	"final_score" text,
	"settled_at" timestamp with time zone,
	"settled_by" uuid,
	"void_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "picks_rank_range" CHECK ("picks"."rank" >= 1 and "picks"."rank" <= 15),
	CONSTRAINT "picks_confidence_range" CHECK ("picks"."confidence" is null or ("picks"."confidence" >= 0 and "picks"."confidence" <= 100)),
	CONSTRAINT "picks_price_valid" CHECK ("picks"."price" >= 100 or "picks"."price" <= -100)
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"bucket" text NOT NULL,
	"identifier" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"window_start" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rate_limits_bucket_identifier_pk" PRIMARY KEY("bucket","identifier")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"user_agent" text,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "slates" (
	"date" date PRIMARY KEY NOT NULL,
	"published_at" timestamp with time zone,
	"published_by" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"display_name" text,
	"phone" text,
	"monthly_spend_band" "spend_band",
	"role" "role" DEFAULT 'user' NOT NULL,
	"email_verified_at" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"failed_login_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_accepted_user_id_users_id_fk" FOREIGN KEY ("accepted_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "picks" ADD CONSTRAINT "picks_slate_date_slates_date_fk" FOREIGN KEY ("slate_date") REFERENCES "public"."slates"("date") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "picks" ADD CONSTRAINT "picks_settled_by_users_id_fk" FOREIGN KEY ("settled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slates" ADD CONSTRAINT "slates_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_created_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_log_actor_idx" ON "audit_log" USING btree ("actor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_email_unique" ON "invitations" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_token_hash_unique" ON "invitations" USING btree ("token_hash");--> statement-breakpoint
-- HAND-EDITED, and it must stay that way. drizzle-kit emitted a plain
-- CREATE UNIQUE INDEX here; a plain unique index is checked after every single
-- row update, so any multi-row reorder collides with a rank another row has not
-- vacated yet. reorderPicksAction assigns a whole new rank ordering in one
-- transaction, so that breaks drag-and-drop reordering outright.
--
-- A DEFERRABLE INITIALLY DEFERRED constraint checks uniqueness once at COMMIT
-- instead, which lets the whole batch land in one pass. schema.ts still
-- declares this as a plain `uniqueIndex` because drizzle-kit's schema builder
-- has no way to express "deferrable" — this file is the source of truth for
-- picks_slate_rank_unique. Do not let a future `db:generate` replace it.
--
-- This carries forward the decisions made in the pre-squash migrations
-- 0002_deferrable_rank_constraint and 0006_player_props_category: the key is
-- (slate_date, category, rank), so a game bet and a player prop can both be
-- rank 1 on the same day.
ALTER TABLE "picks" ADD CONSTRAINT "picks_slate_rank_unique" UNIQUE ("slate_date","category","rank") DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
CREATE INDEX "picks_slate_idx" ON "picks" USING btree ("slate_date");--> statement-breakpoint
CREATE INDEX "picks_status_idx" ON "picks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "picks_starts_at_idx" ON "picks" USING btree ("starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_unique" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role");