-- The board is fifteen picks a day, not thirty. Keeps picks_rank_range in step
-- with PICKS_PER_SLATE in lib/board.ts, which is the constant the composer,
-- the publish bar and the admin Overview all size themselves from.
--
-- This will refuse to apply if any existing pick is ranked above 15, and that
-- is deliberate: the alternative is silently deleting or renumbering rows that
-- are part of a published record. If it fails, decide what should happen to
-- those picks first —
--
--   select slate_date, count(*) from picks where rank > 15 group by slate_date;
--
-- — and either re-rank them within the new bound or drop the slates they
-- belong to, then run the migration again.
ALTER TABLE "picks" DROP CONSTRAINT "picks_rank_range";--> statement-breakpoint
ALTER TABLE "picks" ADD CONSTRAINT "picks_rank_range" CHECK ("picks"."rank" >= 1 and "picks"."rank" <= 15);
