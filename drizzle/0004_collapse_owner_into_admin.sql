-- Collapses the three-role model (user / admin / owner) into two.
--
-- `owner` sat above `admin` and was the only role that could manage other
-- roles, which made whoever held it a single point of failure for the whole
-- panel. Every owner becomes an admin, and admin gains what owner had: role
-- management, /admin/users and /admin/announce. There can now be any number
-- of them.
--
-- The UPDATE in the middle is why this file is hand-edited rather than left
-- as drizzle-kit generated it. Its version casts the column straight back to
-- the new two-value enum, which throws on the first `owner` row — so it fails
-- on precisely the databases that have one. Renaming the value while the
-- column is still `text` is what lets this run against real data.
--
-- Dropping the default around the type change is deliberate too: a default
-- still typed by the enum being dropped is the other way this sequence bites.
ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET DATA TYPE text;--> statement-breakpoint
UPDATE "users" SET "role" = 'admin' WHERE "role" = 'owner';--> statement-breakpoint
DROP TYPE "public"."role";--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('user', 'admin');--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET DATA TYPE "public"."role" USING "role"::"public"."role";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'user'::"public"."role";
