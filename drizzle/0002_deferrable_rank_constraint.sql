-- Drag-and-drop reordering assigns a whole new rank ordering in one
-- transaction. A plain unique index checks (slate_date, rank) after every
-- single row update, so any multi-row reorder collides with a rank another
-- row hasn't vacated yet — verified empirically before writing this.
--
-- A DEFERRABLE INITIALLY DEFERRED constraint checks uniqueness once at COMMIT
-- instead, so the whole batch can land in one pass. schema.ts still declares
-- this as a plain `uniqueIndex` because drizzle-kit's schema builder has no
-- way to express "deferrable" — this migration is the source of truth for
-- picks_slate_rank_unique going forward; do not let a future `db:generate`
-- run replace it with a non-deferrable index.
DROP INDEX "picks_slate_rank_unique";--> statement-breakpoint
ALTER TABLE "picks" ADD CONSTRAINT "picks_slate_rank_unique" UNIQUE ("slate_date", "rank") DEFERRABLE INITIALLY DEFERRED;
