import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  timestamp,
  date,
  numeric,
  jsonb,
  index,
  uniqueIndex,
  check,
  primaryKey,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

/* ------------------------------------------------------------------ enums */

export const sportEnum = pgEnum("sport", [
  "soccer",
  "basketball",
  "baseball",
  "tennis",
  "hockey",
  "football",
]);

export const marketEnum = pgEnum("market", ["moneyline", "spread", "total", "prop"]);

export const pickStatusEnum = pgEnum("pick_status", [
  "pending",
  "won",
  "lost",
  "push",
  "void",
]);

export const roleEnum = pgEnum("role", ["user", "admin", "owner"]);

/* ------------------------------------------------------------------ users */

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    displayName: text("display_name"),
    /**
     * Three roles rather than a boolean: `owner` can promote/demote admins,
     * `admin` can publish and settle. Keeps multi-admin safe — an admin cannot
     * remove the owner or escalate a peer.
     */
    role: roleEnum("role").notNull().default("user"),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    failedLoginCount: integer("failed_login_count").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Emails are stored lowercased by the app; the unique index enforces it.
    uniqueIndex("users_email_unique").on(t.email),
    index("users_role_idx").on(t.role),
  ],
);

/* --------------------------------------------------------------- sessions */

/**
 * Database-backed sessions rather than stateless JWTs, so logout and admin
 * revocation take effect immediately. The cookie holds only a random token;
 * the row holds everything else.
 */
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** SHA-256 of the cookie token. A DB leak does not yield usable sessions. */
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    userAgent: text("user_agent"),
    ip: text("ip"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("sessions_token_hash_unique").on(t.tokenHash),
    index("sessions_user_idx").on(t.userId),
    index("sessions_expires_idx").on(t.expiresAt),
  ],
);

/* ----------------------------------------------------------------- slates */

export const slates = pgTable("slates", {
  /** The betting day, per SLATE_TIMEZONE. One slate per date. */
  date: date("date").primaryKey(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  publishedBy: uuid("published_by").references(() => users.id, { onDelete: "set null" }),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------ picks */

export const picks = pgTable(
  "picks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slateDate: date("slate_date")
      .notNull()
      .references(() => slates.date, { onDelete: "cascade" }),
    /** 1 = best pick of the day. Drives board visibility; see lib/board.ts. */
    rank: integer("rank").notNull(),

    sport: sportEnum("sport").notNull(),
    league: text("league").notNull(),
    event: text("event").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),

    market: marketEnum("market").notNull(),
    selection: text("selection").notNull(),
    /** American odds, e.g. -118, +235. */
    price: integer("price").notNull(),
    book: text("book"),
    units: numeric("units", { precision: 5, scale: 2 }).notNull().default("1.00"),

    confidence: integer("confidence"),
    evPct: numeric("ev_pct", { precision: 5, scale: 2 }),
    reasoning: text("reasoning"),

    status: pickStatusEnum("status").notNull().default("pending"),
    finalScore: text("final_score"),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    settledBy: uuid("settled_by").references(() => users.id, { onDelete: "set null" }),
    voidReason: text("void_reason"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // NOTE: declared here as a plain index because drizzle-kit's schema
    // builder can't express DEFERRABLE — but in the live DB, as of migration
    // 0002, this is actually a DEFERRABLE INITIALLY DEFERRED unique
    // constraint (same name), which is what lets reorderPicksAction commit a
    // whole new rank ordering in one transaction. Don't `db:generate` a
    // "fix" for this line — it would silently drop back to a non-deferrable
    // index and break drag-and-drop reordering.
    uniqueIndex("picks_slate_rank_unique").on(t.slateDate, t.rank),
    index("picks_slate_idx").on(t.slateDate),
    index("picks_status_idx").on(t.status),
    index("picks_starts_at_idx").on(t.startsAt),
    check("picks_rank_range", sql`${t.rank} >= 1 and ${t.rank} <= 30`),
    check("picks_confidence_range", sql`${t.confidence} is null or (${t.confidence} >= 0 and ${t.confidence} <= 100)`),
    // American odds are never between -100 and +100 exclusive, and never 0.
    check("picks_price_valid", sql`${t.price} >= 100 or ${t.price} <= -100`),
  ],
);

/* -------------------------------------------------------------- audit log */

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    actorEmail: text("actor_email"),
    action: text("action").notNull(),
    entity: text("entity"),
    entityId: text("entity_id"),
    meta: jsonb("meta"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_log_created_idx").on(t.createdAt),
    index("audit_log_actor_idx").on(t.actorId),
  ],
);

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

/* -------------------------------------------------------------- relations */

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const slatesRelations = relations(slates, ({ many }) => ({
  picks: many(picks),
}));

export const picksRelations = relations(picks, ({ one }) => ({
  slate: one(slates, { fields: [picks.slateDate], references: [slates.date] }),
}));

/* ------------------------------------------------------------------ types */

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type Pick = typeof picks.$inferSelect;
export type NewPick = typeof picks.$inferInsert;
export type Slate = typeof slates.$inferSelect;
export type Role = (typeof roleEnum.enumValues)[number];
export type PickStatus = (typeof pickStatusEnum.enumValues)[number];
export type Sport = (typeof sportEnum.enumValues)[number];
export type Market = (typeof marketEnum.enumValues)[number];
