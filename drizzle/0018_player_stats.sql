CREATE TABLE "player_game_stats" (
	"player_id" text NOT NULL,
	"game_id" text NOT NULL,
	"season" integer NOT NULL,
	"season_type" text NOT NULL,
	"played_at" timestamp with time zone NOT NULL,
	"team_abbr" text,
	"opponent_abbr" text,
	"home" boolean,
	"team_score" integer,
	"opponent_score" integer,
	"stats" jsonb NOT NULL,
	CONSTRAINT "player_game_stats_player_id_game_id_pk" PRIMARY KEY("player_id","game_id")
);
--> statement-breakpoint
CREATE TABLE "player_season_stats" (
	"league" text NOT NULL,
	"season" integer NOT NULL,
	"season_type" text NOT NULL,
	"player_id" text NOT NULL,
	"team_abbr" text,
	"games_played" integer,
	"stats" jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_season_stats_league_season_season_type_player_id_pk" PRIMARY KEY("league","season","season_type","player_id")
);
--> statement-breakpoint
CREATE TABLE "stat_players" (
	"id" text PRIMARY KEY NOT NULL,
	"league" text NOT NULL,
	"provider_id" text NOT NULL,
	"name" text NOT NULL,
	"team_abbr" text,
	"position" text,
	"jersey" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stat_players_league_provider_unique" UNIQUE("league","provider_id")
);
--> statement-breakpoint
ALTER TABLE "player_game_stats" ADD CONSTRAINT "player_game_stats_player_id_stat_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."stat_players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_season_stats" ADD CONSTRAINT "player_season_stats_player_id_stat_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."stat_players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "player_game_stats_player_season_idx" ON "player_game_stats" USING btree ("player_id","season","played_at");--> statement-breakpoint
CREATE INDEX "player_season_stats_player_idx" ON "player_season_stats" USING btree ("player_id");