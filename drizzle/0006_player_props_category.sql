-- The board splits in two: game bets and player props, each ranked from 1 and
-- capped on its own, so a full day is fifteen of each. See lib/board.ts.
--
-- Hand-written, not left as drizzle-kit generated it. `db:generate` emitted
-- `DROP INDEX "picks_slate_rank_unique"` followed by a plain CREATE UNIQUE
-- INDEX, and both halves are wrong against the live database:
--
--   * since migration 0002 that name is a CONSTRAINT, not an index, so the
--     DROP INDEX fails outright and takes the whole migration with it;
--   * a plain unique index is checked after every row update, which is exactly
--     what 0002 replaced — reorderPicksAction assigns a whole new ordering in
--     one transaction and collides with a rank no row has vacated yet.
--
-- So the constraint is dropped and rebuilt as a constraint, still DEFERRABLE
-- INITIALLY DEFERRED, now keyed on category as well. 0002's warning still
-- stands: do not let a future `db:generate` "fix" this back into an index.
CREATE TYPE "public"."pick_category" AS ENUM('game', 'prop');--> statement-breakpoint

-- Defaulted, so every pick written before today stays a game bet and lands on
-- the tab it was published to. NOT NULL is safe for the same reason: there is
-- no row the default cannot answer for.
ALTER TABLE "picks" ADD COLUMN "category" "pick_category" DEFAULT 'game' NOT NULL;--> statement-breakpoint

-- The column has to exist before the key that includes it, and the old key has
-- to go before a new one can take its name.
ALTER TABLE "picks" DROP CONSTRAINT "picks_slate_rank_unique";--> statement-breakpoint
ALTER TABLE "picks" ADD CONSTRAINT "picks_slate_rank_unique" UNIQUE ("slate_date", "category", "rank") DEFERRABLE INITIALLY DEFERRED;
