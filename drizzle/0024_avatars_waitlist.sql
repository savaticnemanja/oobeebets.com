CREATE TABLE "avatars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"small" "bytea" NOT NULL,
	"large" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "waitlist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"leave_token" text NOT NULL,
	"source" text NOT NULL,
	"invited_at" timestamp with time zone,
	"notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "avatar_id" uuid;--> statement-breakpoint
ALTER TABLE "avatars" ADD CONSTRAINT "avatars_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "avatars_user_unique" ON "avatars" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "waitlist_email_unique" ON "waitlist" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "waitlist_leave_token_unique" ON "waitlist" USING btree ("leave_token");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_avatar_id_avatars_id_fk" FOREIGN KEY ("avatar_id") REFERENCES "public"."avatars"("id") ON DELETE set null ON UPDATE no action;