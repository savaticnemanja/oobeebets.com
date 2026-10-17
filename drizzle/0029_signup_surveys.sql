CREATE TABLE "signup_surveys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"full_name" text NOT NULL,
	"is_21" boolean NOT NULL,
	"bet_frequency" text NOT NULL,
	"experience" text NOT NULL,
	"sports" text[] NOT NULL,
	"sports_other" text,
	"sportsbook" text NOT NULL,
	"sportsbook_other" text,
	"bet_size" text NOT NULL,
	"decision_tools" text[] NOT NULL,
	"decision_tools_other" text,
	"wants" text NOT NULL,
	"will_give_feedback" boolean NOT NULL,
	"will_do_survey" boolean NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "signup_surveys_email_unique" ON "signup_surveys" USING btree ("email");