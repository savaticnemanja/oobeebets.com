import { pgTable, text, integer, timestamp, primaryKey } from "drizzle-orm/pg-core";

/**
 * One table.
 *
 * The pre-launch site sells nothing and signs nobody in, so users, sessions,
 * subscriptions, slates, picks, settings and the audit log all went with the
 * product they belonged to. The mailing list is not here either — Resend's
 * contact book is the only copy of it (see lib/newsletter.ts).
 *
 * What is left is abuse control, and it is the only thing keeping Postgres in
 * the stack at all. If that ever moves to Redis, the database dependency can
 * go with it.
 */

/* ------------------------------------------------------- rate limit table */

export const rateLimits = pgTable(
  "rate_limits",
  {
    bucket: text("bucket").notNull(),
    identifier: text("identifier").notNull(),
    count: integer("count").notNull().default(0),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.bucket, t.identifier] })],
);
