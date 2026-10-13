-- selections.manual_hold: set when an admin resets a graded bet to pending, so
-- the automatic grader leaves it for the admin instead of re-grading it from
-- the same score on the next refresh. Cleared when it is settled again.
ALTER TABLE "selections" ADD COLUMN "manual_hold" boolean DEFAULT false NOT NULL;
