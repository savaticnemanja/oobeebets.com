-- "I took this bet": one row per tester per pick they actually placed.
--
-- Left exactly as drizzle-kit generated it — unlike 0002 and 0006, nothing
-- here needs hand-editing, because nothing here is deferrable. Both the
-- composite primary key and the pick_id index are things the schema builder
-- can express, so `db:generate` and the live database agree and will keep
-- agreeing.
--
-- Three columns, no surrogate key, no stake/odds/book: the fact being recorded
-- is "this user took this pick", and everything else the analysis needs is on
-- the pick it points at. See the table comment in src/db/schema.ts for why,
-- and lib/follows.ts for the flat stake the beta record is measured at.
--
-- Both foreign keys cascade. Deleting a draft pick, or an account, must not
-- leave a follow pointing at nothing — and a follow is not history worth
-- keeping once the thing it refers to is gone.
CREATE TABLE "pick_follows" (
	"user_id" uuid NOT NULL,
	"pick_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pick_follows_user_id_pick_id_pk" PRIMARY KEY("user_id","pick_id")
);
--> statement-breakpoint
ALTER TABLE "pick_follows" ADD CONSTRAINT "pick_follows_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pick_follows" ADD CONSTRAINT "pick_follows_pick_id_picks_id_fk" FOREIGN KEY ("pick_id") REFERENCES "public"."picks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pick_follows_pick_idx" ON "pick_follows" USING btree ("pick_id");
