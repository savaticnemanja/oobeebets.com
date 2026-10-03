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

/**
 * Which of the two boards a pick belongs to. Distinct from `market`, which is
 * the bet type: a player prop is always market "prop", but a game bet can be a
 * team prop too, so the tab a pick appears on is its own fact rather than
 * something inferred from the market.
 */
export const pickCategoryEnum = pgEnum("pick_category", ["game", "prop"]);

export const pickStatusEnum = pgEnum("pick_status", [
  "pending",
  "won",
  "lost",
  "push",
  "void",
]);

/**
 * Two roles, not three. `owner` used to sit above `admin` and was the only
 * role that could manage other roles — which made whoever held it a single
 * point of failure for the whole panel. Collapsed in migration 0004: every
 * admin now has the full panel, and there can be as many as you like.
 */
export const roleEnum = pgEnum("role", ["user", "admin"]);

/** Self-reported monthly betting spend, collected during onboarding. */
export const spendBandEnum = pgEnum("spend_band", [
  "under_50",
  "50_200",
  "200_500",
  "500_1000",
  "over_1000",
]);

export const inviteStatusEnum = pgEnum("invite_status", [
  "pending",
  "accepted",
  "revoked",
  "expired",
]);

/* ------------------------------------------------------------------ users */

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    displayName: text("display_name"),
    phone: text("phone"),
    /** Nullable: legacy/seeded users predate onboarding; the app layer, not
     * the DB, enforces this for anyone who came through the invite flow. */
    monthlySpendBand: spendBandEnum("monthly_spend_band"),
    /**
     * `admin` holds the whole panel: publish, settle, invite, change roles and
     * announce. The only thing an admin cannot do is change their own role, so
     * nobody can lock themselves out (see canManageRole in lib/auth.ts).
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

/* -------------------------------------------------------------- invitations */

/**
 * The only way a new account gets created — closed beta, no open signup.
 * `tokenHash` follows the same "random token, store only its hash" pattern as
 * sessions (see lib/auth.ts hashToken). One live invite per email: sending a
 * second invite to the same address updates this row in place rather than
 * creating a new one, which is what makes "resend" and "invite again" the
 * same code path.
 */
export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    tokenHash: text("token_hash").notNull(),
    status: inviteStatusEnum("status").notNull().default("pending"),
    invitedBy: uuid("invited_by").references(() => users.id, { onDelete: "set null" }),
    acceptedUserId: uuid("accepted_user_id").references(() => users.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("invitations_email_unique").on(t.email),
    uniqueIndex("invitations_token_hash_unique").on(t.tokenHash),
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
    /**
     * Which board this pick is on. Defaults to "game" so every pick that
     * predates the split stays exactly where it was.
     */
    category: pickCategoryEnum("category").notNull().default("game"),
    /**
     * 1 = best pick of the day *within its category*, so a full slate holds
     * two rank-1s. Drives board visibility; see lib/board.ts.
     */
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
    // 0002 and re-keyed in 0006, this is actually a DEFERRABLE INITIALLY
    // DEFERRED unique constraint (same name), which is what lets
    // reorderPicksAction commit a whole new rank ordering in one transaction.
    // Don't `db:generate` a "fix" for this line — it would silently drop back
    // to a non-deferrable index and break drag-and-drop reordering.
    //
    // `category` is part of the key, not just along for the ride: it is what
    // allows a game bet and a player prop to both be rank 1 on the same day.
    // It also leaves (slate_date, category) as a usable index prefix, which is
    // what each board tab queries on — so no separate index for that.
    uniqueIndex("picks_slate_rank_unique").on(t.slateDate, t.category, t.rank),
    index("picks_slate_idx").on(t.slateDate),
    index("picks_status_idx").on(t.status),
    index("picks_starts_at_idx").on(t.startsAt),
    // Keep in step with PICKS_PER_SLATE in lib/board.ts — changing a list's
    // size needs a migration to move this bound, not just the constant. One
    // bound covers both categories while they are both 15; the day they
    // diverge this becomes a CASE on category.
    check("picks_rank_range", sql`${t.rank} >= 1 and ${t.rank} <= 15`),
    check("picks_confidence_range", sql`${t.confidence} is null or (${t.confidence} >= 0 and ${t.confidence} <= 100)`),
    // American odds are never between -100 and +100 exclusive, and never 0.
    check("picks_price_valid", sql`${t.price} >= 100 or ${t.price} <= -100`),
  ],
);

/* ------------------------------------------------------- "I took this bet" */

/**
 * One row per tester per pick they say they actually placed. The whole fact is
 * the primary key: this user, this pick. Nothing else is collected.
 *
 * That is the point rather than a shortcut. Asking a beta tester for stake,
 * book and price before the row would be written is how a tracking feature
 * gets an 8% completion rate and answers nothing; "did you take this one?" is
 * a single tap, and everything the analysis needs is already on the pick —
 * `price` for the odds, `status` for the result, `category`/`market`/`league`
 * for what kind of bet it was. A column here would only be able to disagree
 * with the pick it points at.
 *
 * Stake is the one figure that genuinely is not on the pick, and it stays
 * uncollected: the beta record is flat-staked at FOLLOW_STAKE_UNITS (see
 * lib/follows.ts), which is a deliberately different number from the pick's
 * own recommended `units`. Oobee's record is what its own staking plan
 * returned; a tester's is one unit a bet, because one unit a bet is the only
 * stake we can honestly claim to know.
 *
 * Absence is the "no" — an unchecked pick is an untaken pick, so there is no
 * status column and no row for a decline. Unchecking deletes the row.
 *
 * Shape notes, since both are load-bearing:
 *
 *   * No surrogate `id`. A uuid primary key here would be a second, wider way
 *     to identify a row that (user_id, pick_id) already identifies uniquely,
 *     and it would need its own unique index on top to stop duplicates — two
 *     indexes to say what one says.
 *   * The key is (user_id, pick_id) in that order, not the reverse. The hot
 *     query by a wide margin is a board render — "which of today's thirty
 *     picks has this viewer taken" — which is an index-only scan on the
 *     leading column. pick_follows_pick_idx covers the other direction, which
 *     the admin analytics and the ON DELETE CASCADE both read.
 */
export const pickFollows = pgTable(
  "pick_follows",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    pickId: uuid("pick_id")
      .notNull()
      .references(() => picks.id, { onDelete: "cascade" }),
    /**
     * When the tap happened, which is not the same as when the game did. The
     * app only accepts a follow before kick-off (see followWindowOpen in
     * lib/follows.ts), so this timestamp is evidence the choice was made with
     * the result still unknown — without it, "they followed it" and "they
     * said afterwards that they had" are the same row.
     */
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.pickId] }),
    index("pick_follows_pick_idx").on(t.pickId),
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
  follows: many(pickFollows),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const slatesRelations = relations(slates, ({ many }) => ({
  picks: many(picks),
}));

export const picksRelations = relations(picks, ({ one, many }) => ({
  slate: one(slates, { fields: [picks.slateDate], references: [slates.date] }),
  follows: many(pickFollows),
}));

export const pickFollowsRelations = relations(pickFollows, ({ one }) => ({
  user: one(users, { fields: [pickFollows.userId], references: [users.id] }),
  pick: one(picks, { fields: [pickFollows.pickId], references: [picks.id] }),
}));

/* ------------------------------------------------------------------ types */

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type Pick = typeof picks.$inferSelect;
export type NewPick = typeof picks.$inferInsert;
export type Slate = typeof slates.$inferSelect;
export type PickFollow = typeof pickFollows.$inferSelect;
export type NewPickFollow = typeof pickFollows.$inferInsert;
export type Invitation = typeof invitations.$inferSelect;
export type NewInvitation = typeof invitations.$inferInsert;
export type Role = (typeof roleEnum.enumValues)[number];
export type PickStatus = (typeof pickStatusEnum.enumValues)[number];
export type Sport = (typeof sportEnum.enumValues)[number];
export type Market = (typeof marketEnum.enumValues)[number];
export type PickCategory = (typeof pickCategoryEnum.enumValues)[number];
export type SpendBand = (typeof spendBandEnum.enumValues)[number];
export type InviteStatus = (typeof inviteStatusEnum.enumValues)[number];
