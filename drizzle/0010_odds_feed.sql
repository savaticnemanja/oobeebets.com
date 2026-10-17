-- The odds feed: every pick and every community-parlay leg now comes from a
-- line served by The Odds API instead of being typed in.
--
-- games / lines are the feed itself, refreshed in place. selections are lines
-- frozen at the moment someone picked them -- the actual bet, and where its
-- result lives. picks.selection_id is NULL only on picks typed in by hand
-- before this migration; they keep working unchanged and are settled by hand.
--
-- parlays.shared defaults to false, so every parlay built before the
-- Community tab existed stays private, as its builder was told it would be.
CREATE TABLE "games" (
	"id" text PRIMARY KEY NOT NULL,
	"league" text NOT NULL,
	"sport_key" text NOT NULL,
	"home_team" text NOT NULL,
	"away_team" text NOT NULL,
	"commence_time" timestamp with time zone NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"home_score" integer,
	"away_score" integer,
	"scores_updated_at" timestamp with time zone,
	"props_synced_at" timestamp with time zone,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" text NOT NULL,
	"market_key" text NOT NULL,
	"outcome" text NOT NULL,
	"player" text,
	"point" numeric(6, 1),
	"price" integer NOT NULL,
	"book" text NOT NULL,
	"book_title" text NOT NULL,
	"available" boolean DEFAULT true NOT NULL,
	"provider_updated_at" timestamp with time zone,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lines_natural_key" UNIQUE NULLS NOT DISTINCT("game_id","market_key","outcome","player","point","book"),
	CONSTRAINT "lines_price_valid" CHECK ("lines"."price" >= 100 or "lines"."price" <= -100)
);
--> statement-breakpoint
CREATE TABLE "odds_sync" (
	"key" text PRIMARY KEY NOT NULL,
	"synced_at" timestamp with time zone NOT NULL,
	"credits_remaining" integer,
	"credits_used" integer,
	"last_error" text
);
--> statement-breakpoint
CREATE TABLE "parlay_selection_legs" (
	"parlay_id" uuid NOT NULL,
	"selection_id" uuid NOT NULL,
	CONSTRAINT "parlay_selection_legs_parlay_id_selection_id_pk" PRIMARY KEY("parlay_id","selection_id")
);
--> statement-breakpoint
CREATE TABLE "selections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" text NOT NULL,
	"market_key" text NOT NULL,
	"outcome" text NOT NULL,
	"player" text,
	"point" numeric(6, 1),
	"price" integer NOT NULL,
	"book" text NOT NULL,
	"book_title" text NOT NULL,
	"status" "pick_status" DEFAULT 'pending' NOT NULL,
	"final_score" text,
	"void_reason" text,
	"settled_at" timestamp with time zone,
	"settled_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "selections_natural_key" UNIQUE NULLS NOT DISTINCT("game_id","market_key","outcome","player","point","price","book"),
	CONSTRAINT "selections_price_valid" CHECK ("selections"."price" >= 100 or "selections"."price" <= -100)
);
--> statement-breakpoint
ALTER TABLE "parlays" ADD COLUMN "shared" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "picks" ADD COLUMN "selection_id" uuid;--> statement-breakpoint
ALTER TABLE "lines" ADD CONSTRAINT "lines_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parlay_selection_legs" ADD CONSTRAINT "parlay_selection_legs_parlay_id_parlays_id_fk" FOREIGN KEY ("parlay_id") REFERENCES "public"."parlays"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parlay_selection_legs" ADD CONSTRAINT "parlay_selection_legs_selection_id_selections_id_fk" FOREIGN KEY ("selection_id") REFERENCES "public"."selections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "selections" ADD CONSTRAINT "selections_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "selections" ADD CONSTRAINT "selections_settled_by_users_id_fk" FOREIGN KEY ("settled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "games_league_commence_idx" ON "games" USING btree ("league","commence_time");--> statement-breakpoint
CREATE INDEX "lines_game_market_idx" ON "lines" USING btree ("game_id","market_key");--> statement-breakpoint
CREATE INDEX "parlay_selection_legs_selection_idx" ON "parlay_selection_legs" USING btree ("selection_id");--> statement-breakpoint
CREATE INDEX "selections_game_idx" ON "selections" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "selections_status_idx" ON "selections" USING btree ("status");--> statement-breakpoint
ALTER TABLE "picks" ADD CONSTRAINT "picks_selection_id_selections_id_fk" FOREIGN KEY ("selection_id") REFERENCES "public"."selections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "parlays_shared_slate_idx" ON "parlays" USING btree ("slate_date") WHERE "parlays"."shared";--> statement-breakpoint
CREATE INDEX "picks_selection_idx" ON "picks" USING btree ("selection_id");