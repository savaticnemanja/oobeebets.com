-- parlay_follows: "I played this parlay" — tailing a shared Community ticket
-- or one of Oobee's, the way pick_follows logs taking a pick. Flat stake, and
-- the window closes at the ticket's first kick-off (enforced in the action).
CREATE TABLE "parlay_follows" (
	"user_id" uuid NOT NULL,
	"parlay_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "parlay_follows_user_id_parlay_id_pk" PRIMARY KEY("user_id","parlay_id")
);
--> statement-breakpoint
ALTER TABLE "parlay_follows" ADD CONSTRAINT "parlay_follows_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parlay_follows" ADD CONSTRAINT "parlay_follows_parlay_id_parlays_id_fk" FOREIGN KEY ("parlay_id") REFERENCES "public"."parlays"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "parlay_follows_parlay_idx" ON "parlay_follows" USING btree ("parlay_id");