ALTER TABLE "signup_surveys" ALTER COLUMN "decision_tools" SET DEFAULT '{}'::text[];--> statement-breakpoint
ALTER TABLE "signup_surveys" ADD COLUMN "sportsbooks" text[] DEFAULT '{}'::text[] NOT NULL;