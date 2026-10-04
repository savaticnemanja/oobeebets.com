-- Parlays: several of the board's picks riding as one bet.
--
-- Two kinds share the table, told apart by owner_id -- NULL is Oobee's own,
-- published and ranked on its board; a user id is a tester's custom parlay
-- built from picks Oobee published. parlays_rank_matches_owner is what keeps
-- that readable from one column: ranked if and only if it is ours.
--
-- parlays_oobee_rank_unique is PARTIAL, and has to be. Ranks are unique among
-- Oobee's parlays only; thirty testers each building an unranked parlay on the
-- same day must not collide with each other or with the board's rank 1, and a
-- plain unique index on (slate_date, rank) would let exactly one of them exist.
--
-- Note what is NOT here: no status, no settled_at, no settled_by. A parlay's
-- result is a function of its legs, which /admin/settle already grades one at
-- a time. Storing it would be a second home for the truth and therefore a way
-- for a parlay to disagree with the picks it is made of. See the table comment
-- in src/db/schema.ts, and lib/parlays.ts for the grading itself.
--
-- `price` is nullable on purpose: a book rarely prices a parlay at the naive
-- product of its legs, so Oobee can record what was actually on offer. NULL
-- means "derive from the legs", which is every tester's parlay.
--
-- Every foreign key cascades. A tester's parlays die with their account, and
-- a deleted draft pick takes the legs that point at it -- a leg referring to
-- nothing would silently reprice every parlay containing it.
CREATE TABLE "parlay_legs" (
	"parlay_id" uuid NOT NULL,
	"pick_id" uuid NOT NULL,
	CONSTRAINT "parlay_legs_parlay_id_pick_id_pk" PRIMARY KEY("parlay_id","pick_id")
);
--> statement-breakpoint
CREATE TABLE "parlays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid,
	"slate_date" date NOT NULL,
	"rank" integer,
	"title" text,
	"price" integer,
	"units" numeric(5, 2),
	"confidence" integer,
	"ev_pct" numeric(5, 2),
	"reasoning" text,
	"book" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "parlays_rank_matches_owner" CHECK (("parlays"."owner_id" is null) = ("parlays"."rank" is not null)),
	CONSTRAINT "parlays_rank_range" CHECK ("parlays"."rank" is null or ("parlays"."rank" >= 1 and "parlays"."rank" <= 15)),
	CONSTRAINT "parlays_price_valid" CHECK ("parlays"."price" is null or "parlays"."price" >= 100 or "parlays"."price" <= -100),
	CONSTRAINT "parlays_confidence_range" CHECK ("parlays"."confidence" is null or ("parlays"."confidence" >= 0 and "parlays"."confidence" <= 100))
);
--> statement-breakpoint
ALTER TABLE "parlay_legs" ADD CONSTRAINT "parlay_legs_parlay_id_parlays_id_fk" FOREIGN KEY ("parlay_id") REFERENCES "public"."parlays"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parlay_legs" ADD CONSTRAINT "parlay_legs_pick_id_picks_id_fk" FOREIGN KEY ("pick_id") REFERENCES "public"."picks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parlays" ADD CONSTRAINT "parlays_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parlays" ADD CONSTRAINT "parlays_slate_date_slates_date_fk" FOREIGN KEY ("slate_date") REFERENCES "public"."slates"("date") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "parlay_legs_pick_idx" ON "parlay_legs" USING btree ("pick_id");--> statement-breakpoint
CREATE INDEX "parlays_owner_idx" ON "parlays" USING btree ("owner_id","slate_date");--> statement-breakpoint
CREATE INDEX "parlays_slate_idx" ON "parlays" USING btree ("slate_date");--> statement-breakpoint
CREATE UNIQUE INDEX "parlays_oobee_rank_unique" ON "parlays" USING btree ("slate_date","rank") WHERE "parlays"."owner_id" is null;
