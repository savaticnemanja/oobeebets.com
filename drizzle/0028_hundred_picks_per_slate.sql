ALTER TABLE "parlays" DROP CONSTRAINT "parlays_rank_range";--> statement-breakpoint
ALTER TABLE "picks" DROP CONSTRAINT "picks_rank_range";--> statement-breakpoint
ALTER TABLE "parlays" ADD CONSTRAINT "parlays_rank_range" CHECK ("parlays"."rank" is null or ("parlays"."rank" >= 1 and "parlays"."rank" <= 100));--> statement-breakpoint
ALTER TABLE "picks" ADD CONSTRAINT "picks_rank_range" CHECK ("picks"."rank" >= 1 and "picks"."rank" <= 100);