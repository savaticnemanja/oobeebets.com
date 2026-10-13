import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  timestamp,
  date,
  boolean,
  unique,
  numeric,
  jsonb,
  index,
  uniqueIndex,
  check,
  primaryKey,
  customType,
  type AnyPgColumn,
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
    /**
     * The public handle — /u/<username>, and what @mentions resolve against.
     * Stored lowercased; users_username_format enforces it, so the unique
     * index is also case-insensitive without needing citext. Accounts that
     * predate profiles were backfilled from their email in migration 0009,
     * and new ones get one minted at creation (see mintUsername).
     */
    username: text("username").notNull(),
    /** Shown on the public profile. Plain text, rendered with links. */
    bio: text("bio"),
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
    uniqueIndex("users_username_unique").on(t.username),
    index("users_role_idx").on(t.role),
    check("users_username_format", sql`${t.username} ~ '^[a-z0-9_]{3,20}$'`),
    check("users_bio_length", sql`${t.bio} is null or char_length(${t.bio}) <= 160`),
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
    /**
     * Shown first on its day, under a "Featured" label, on the board. Any
     * number per day and tab, set by an admin at any time — it changes how the
     * day is presented, not the record, so it is not frozen by publishing.
     */
    featured: boolean("featured").notNull().default(false),

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

    /**
     * The odds-feed line this pick was made from. Since migration 0010 a pick
     * can only be created from one: the game, kick-off, selection, price and
     * book above are all copied off the selection at that moment rather than
     * typed, and the result comes from settling the selection (see
     * lib/odds/settle.ts), which writes this row's status too.
     *
     * NULL only on the handful of picks typed in by hand before the feed
     * existed. They keep working exactly as they did, settled by hand.
     */
    selectionId: uuid("selection_id").references((): AnyPgColumn => selections.id),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("picks_selection_idx").on(t.selectionId),
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

/* ---------------------------------------------------------------- parlays */

/**
 * A parlay: several of the board's picks riding as one bet, where every leg
 * has to land or the whole thing is gone.
 *
 * Two kinds live here, told apart by `ownerId`:
 *
 *   NULL      — Oobee's own, published on the board beside game bets and
 *               player props, ranked and staked like any other recommendation.
 *   a user id — a tester's custom parlay, built from picks Oobee published.
 *
 * They share a table because they are the same object: a set of legs graded
 * together. Splitting them would mean two settlement derivations, two odds
 * calculations and two inspection surfaces for one idea.
 *
 * ---------------------------------------------------------------------------
 * There is deliberately no `status` column, and no settled_at/settled_by.
 *
 * A parlay's result is not a fact anyone enters — it is a function of its
 * legs, which the existing settle flow already grades one by one. Storing it
 * would create a second place for the truth to live and therefore a way for
 * the board and the record to disagree, which is the one thing this schema
 * works hardest to prevent (see the note on pickProfit in lib/settlement.ts).
 * Deriving it means an admin settling a single on /admin/settle silently and
 * correctly updates every parlay that leg appears in, Oobee's and every
 * tester's alike, with no second workflow to forget.
 *
 * `price` is the exception, and it is nullable for a real reason: a book
 * rarely prices a parlay at the naive product of its legs — correlated legs
 * price worse — so Oobee can record the price actually available. NULL means
 * "derive it from the legs", which is what every user parlay does.
 */
export const parlays = pgTable(
  "parlays",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** NULL is Oobee's own. A tester's parlay dies with their account. */
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "cascade" }),
    slateDate: date("slate_date")
      .notNull()
      .references(() => slates.date, { onDelete: "cascade" }),
    /** Oobee's parlays are ranked on their board; a tester's are not. */
    rank: integer("rank"),
    /** Oobee's only: listed first on its day, as picks.featured is. */
    featured: boolean("featured").notNull().default(false),
    /** Oobee may name a parlay ("Sunday three-leg"); testers do not. */
    title: text("title"),
    /** The book's actual parlay price. NULL derives it from the legs. */
    price: integer("price"),
    /** Oobee's stake. A tester's parlay is flat — see PARLAY_STAKE_UNITS. */
    units: numeric("units", { precision: 5, scale: 2 }),
    confidence: integer("confidence"),
    evPct: numeric("ev_pct", { precision: 5, scale: 2 }),
    reasoning: text("reasoning"),
    book: text("book"),
    /**
     * A tester's parlay on the Community parlays tab, for everyone to see.
     * False for every parlay built before that tab existed — those were built
     * as private, and stay private. Always false on Oobee's own.
     */
    shared: boolean("shared").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The Community tab: shared parlays for one day.
    index("parlays_shared_slate_idx").on(t.slateDate).where(sql`${t.shared}`),
    // A tester's list of their own parlays, newest first — the dashboard's
    // only query. Oobee's rows have a null owner and sort out of it for free.
    index("parlays_owner_idx").on(t.ownerId, t.slateDate),
    index("parlays_slate_idx").on(t.slateDate),
    // Ranks are unique among Oobee's parlays only. A partial index is what
    // allows thirty testers to each have an unranked parlay on the same day
    // without colliding with the board's rank 1.
    uniqueIndex("parlays_oobee_rank_unique")
      .on(t.slateDate, t.rank)
      .where(sql`${t.ownerId} is null`),
    // Ranked if and only if it is Oobee's. This is the invariant that keeps
    // "whose parlay is this" answerable from one column instead of two.
    check(
      "parlays_rank_matches_owner",
      sql`(${t.ownerId} is null) = (${t.rank} is not null)`,
    ),
    check(
      "parlays_rank_range",
      sql`${t.rank} is null or (${t.rank} >= 1 and ${t.rank} <= 15)`,
    ),
    check(
      "parlays_price_valid",
      sql`${t.price} is null or ${t.price} >= 100 or ${t.price} <= -100`,
    ),
    check(
      "parlays_confidence_range",
      sql`${t.confidence} is null or (${t.confidence} >= 0 and ${t.confidence} <= 100)`,
    ),
  ],
);

/**
 * One leg. The pair is the whole fact, so it is the primary key — the same
 * shape, and the same reasoning, as pick_follows.
 *
 * The key also enforces that a pick cannot appear twice in one parlay, which
 * is not a style point: the same leg counted twice would square its odds and
 * quietly invent money that no book would have paid.
 *
 * "At least two legs" is not expressible as a row constraint and lives in the
 * action that writes them, inside the transaction that creates the parlay —
 * see createParlay. scripts/verify.mjs asserts it, because a one-leg parlay
 * is a single wearing a hat and would land in both records at once.
 */
export const parlayLegs = pgTable(
  "parlay_legs",
  {
    parlayId: uuid("parlay_id")
      .notNull()
      .references(() => parlays.id, { onDelete: "cascade" }),
    pickId: uuid("pick_id")
      .notNull()
      .references(() => picks.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.parlayId, t.pickId] }),
    // "Which parlays is this pick in" — read when a leg settles and by the
    // admin inspector, and what makes the ON DELETE CASCADE cheap.
    index("parlay_legs_pick_idx").on(t.pickId),
  ],
);

/* ----------------------------------------------------------------- social */

/**
 * A post on someone's public profile — and, with `parentId` set, a reply to
 * another post. Replies are posts, the same as on X: they have their own
 * likes, their own replies and their own page, and one table means one card,
 * one query shape and one delete path for both.
 *
 * Deleting a post deletes the thread under it (cascade). That is blunter than
 * X's "this post was deleted" tombstone, and deliberate for a small beta:
 * a tombstone row is a second kind of post every query has to remember.
 *
 * `linkUrl` is the link the card is built from — the last URL in the body,
 * picked once when the post is written so the feed never re-parses text.
 * Its preview lives in link_previews, keyed by the URL, so a link shared by
 * ten people is fetched once.
 */
export const posts = pgTable(
  "posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id").references((): AnyPgColumn => posts.id, {
      onDelete: "cascade",
    }),
    body: text("body").notNull(),
    linkUrl: text("link_url"),
    /**
     * A shared Community parlay, as a post — so it is liked, replied to and
     * reposted like any other. Created when the builder shares the parlay,
     * deleted when they unshare it (see actions/parlays.ts). Such a post may
     * have an empty body: the ticket is the content.
     */
    parlayId: uuid("parlay_id").references(() => parlays.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One post per shared parlay.
    uniqueIndex("posts_parlay_unique").on(t.parlayId),
    // A profile's timeline, and the Following feed (author in (...)).
    index("posts_author_created_idx").on(t.authorId, t.createdAt),
    // A post's replies, oldest first.
    index("posts_parent_created_idx").on(t.parentId, t.createdAt),
    // The For you feed scans recent top-level posts.
    index("posts_created_idx").on(t.createdAt),
    // Keep in step with POST_MAX_LENGTH in lib/social.ts.
    // Empty only when something else is the content — a parlay, media or a
    // poll — which the app checks (lib/social-rules.ts); the database can't
    // see the other tables from here, so it holds the upper bound.
    check("posts_body_length", sql`char_length(${t.body}) <= 280`),
  ],
);

/** One row per like. The pair is the whole fact — same shape as pick_follows. */
export const postLikes = pgTable(
  "post_likes",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.postId] }),
    // Counting a post's likes, and the cascade when it is deleted.
    index("post_likes_post_idx").on(t.postId),
  ],
);

/**
 * "I played this parlay" — the parlay twin of pick_follows: a tester tailing
 * someone's shared ticket, or one of Oobee's. Just the pair and when; the
 * stake is the flat one every logged bet uses (lib/follows.ts), and the
 * window closes when the ticket's first leg starts.
 */
export const parlayFollows = pgTable(
  "parlay_follows",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    parlayId: uuid("parlay_id")
      .notNull()
      .references(() => parlays.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.parlayId] }), index("parlay_follows_parlay_idx").on(t.parlayId)],
);

/** Raw bytes. postgres-js reads and writes bytea as a Buffer. */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

/**
 * Images and GIFs on posts, up to four per post. An upload is written before
 * the post exists (post_id null) and attached when the post is created; one
 * left unattached is swept after a day (see lib/media.ts). Uploaded files live
 * in `data` — in the database, so the nightly dump backs them up and there is
 * no volume to lose — already shrunk in the browser. A GIF picked from GIPHY
 * is stored as its URL instead.
 */
export const postMedia = pgTable(
  "post_media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id").references(() => posts.id, { onDelete: "cascade" }),
    uploaderId: uuid("uploader_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** "image" or "gif" — a GIF is shown alone, as on X. */
    kind: text("kind").notNull(),
    mime: text("mime").notNull(),
    data: bytea("data"),
    url: text("url"),
    width: integer("width"),
    height: integer("height"),
    /** Order within the post. */
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("post_media_post_idx").on(t.postId, t.position),
    index("post_media_uploader_idx").on(t.uploaderId, t.createdAt),
    check("post_media_kind", sql`${t.kind} in ('image', 'gif')`),
    check("post_media_source", sql`${t.data} is not null or ${t.url} is not null`),
  ],
);

/** A poll on a post: two to four options, open until ends_at. */
export const postPolls = pgTable("post_polls", {
  postId: uuid("post_id")
    .primaryKey()
    .references(() => posts.id, { onDelete: "cascade" }),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
});

export const pollOptions = pgTable(
  "poll_options",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id")
      .notNull()
      .references(() => postPolls.postId, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    label: text("label").notNull(),
  },
  (t) => [
    unique("poll_options_position_unique").on(t.postId, t.position),
    // Keep in step with POLL_OPTION_MAX in lib/social-rules.ts.
    check("poll_options_label_length", sql`char_length(${t.label}) between 1 and 25`),
  ],
);

/** One vote per person per poll, final once cast — as on X. */
export const pollVotes = pgTable(
  "poll_votes",
  {
    postId: uuid("post_id")
      .notNull()
      .references(() => postPolls.postId, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    optionId: uuid("option_id")
      .notNull()
      .references(() => pollOptions.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.postId, t.userId] }), index("poll_votes_option_idx").on(t.optionId)],
);

/**
 * Who has seen a post: one row per person per post, written when the post
 * has been on their screen for a moment (see components/social/view-tracker).
 * The count is unique viewers — X counts every impression; one per person is
 * the honest number at this size, and can't be pumped by scrolling.
 */
export const postViews = pgTable(
  "post_views",
  {
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.postId, t.userId] })],
);

/**
 * One row per repost ("retweet"): the pair, and when — reposts appear in the
 * reposter's followers' Following feed at that moment, not the post's.
 */
export const postReposts = pgTable(
  "post_reposts",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.postId] }),
    index("post_reposts_post_idx").on(t.postId),
    // The Following feed reads reposts by time.
    index("post_reposts_created_idx").on(t.createdAt),
  ],
);

/**
 * Who follows whom. Named user_follows, not follows, because "follow" already
 * means "I took this bet" in this codebase (pick_follows, lib/follows.ts).
 */
export const userFollows = pgTable(
  "user_follows",
  {
    followerId: uuid("follower_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    followeeId: uuid("followee_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Leading column answers "who do I follow" — the Following feed.
    primaryKey({ columns: [t.followerId, t.followeeId] }),
    // "Who follows me" — follower counts and lists.
    index("user_follows_followee_idx").on(t.followeeId),
    check("user_follows_not_self", sql`${t.followerId} <> ${t.followeeId}`),
  ],
);

/**
 * Open Graph / Twitter card metadata for a URL, fetched server-side once and
 * shared by every post that links it. A failed fetch is stored too (status
 * "failed"), so a dead link is not re-fetched on every post that shares it;
 * fetchedAt lets lib/link-preview.ts retry those after a while.
 */
export const linkPreviews = pgTable("link_previews", {
  url: text("url").primaryKey(),
  status: text("status", { enum: ["ok", "failed"] }).notNull(),
  title: text("title"),
  description: text("description"),
  imageUrl: text("image_url"),
  siteName: text("site_name"),
  /** twitter:card — "summary_large_image" draws the big image layout. */
  cardType: text("card_type"),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
});

/* -------------------------------------------------------------- odds feed */

/**
 * A game, as the odds provider (The Odds API) describes it. The id is the
 * provider's own event id, so a re-sync updates the same row rather than
 * creating a second copy of the same fixture.
 *
 * Scores arrive from the provider's scores endpoint once the game is under
 * way; `completed` is the provider saying they are final, and is what lets
 * lib/odds/settle.ts grade every selection on this game.
 */
export const games = pgTable(
  "games",
  {
    id: text("id").primaryKey(),
    /** "NFL" | "MLB" — the leagues in lib/odds/config.ts. */
    league: text("league").notNull(),
    sportKey: text("sport_key").notNull(),
    homeTeam: text("home_team").notNull(),
    awayTeam: text("away_team").notNull(),
    commenceTime: timestamp("commence_time", { withTimezone: true }).notNull(),
    completed: boolean("completed").notNull().default(false),
    homeScore: integer("home_score"),
    awayScore: integer("away_score"),
    scoresUpdatedAt: timestamp("scores_updated_at", { withTimezone: true }),
    /** Player props are fetched per game, on demand; this is when last. */
    propsSyncedAt: timestamp("props_synced_at", { withTimezone: true }),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("games_league_commence_idx").on(t.league, t.commenceTime)],
);

/**
 * One price at one book for one outcome of one market — the raw feed.
 *
 * Rows are updated in place on every sync (the natural key below), so a line
 * id stays valid while its price moves. A line that drops out of the feed is
 * marked unavailable rather than deleted: the books pulled it, and nothing
 * new may be built on it, but its history is not ours to erase.
 *
 * Nobody bets on a line directly. Picking one copies it into `selections`,
 * which is frozen; this table is allowed to keep moving underneath.
 */
export const lines = pgTable(
  "lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: text("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    /** Provider market key: h2h, spreads, totals, player_pass_yds, ... */
    marketKey: text("market_key").notNull(),
    /** Team name, "Over" / "Under", or "Yes" for a scorer prop. */
    outcome: text("outcome").notNull(),
    /** Player props only. */
    player: text("player"),
    /** The handicap or total. NULL on moneylines and yes/no props. */
    point: numeric("point", { precision: 6, scale: 1 }),
    /** American odds. */
    price: integer("price").notNull(),
    book: text("book").notNull(),
    bookTitle: text("book_title").notNull(),
    available: boolean("available").notNull().default(true),
    providerUpdatedAt: timestamp("provider_updated_at", { withTimezone: true }),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // NULLS NOT DISTINCT: a moneyline has no point and a game line no player,
    // and without it two syncs of the same moneyline would be two rows.
    unique("lines_natural_key")
      .on(t.gameId, t.marketKey, t.outcome, t.player, t.point, t.book)
      .nullsNotDistinct(),
    index("lines_game_market_idx").on(t.gameId, t.marketKey),
    check("lines_price_valid", sql`${t.price} >= 100 or ${t.price} <= -100`),
  ],
);

/**
 * A line frozen at the moment somebody picked it — the thing that is actually
 * bet on and graded. Oobee's picks point here (picks.selection_id), and so do
 * the legs of community parlays (parlay_selection_legs).
 *
 * Deduplicated on everything that defines the bet, price included: ten
 * testers taking the same over at the same price share one row and are graded
 * once. The same over at a moved price is a different bet and a different row.
 *
 * The result lives here and only here for feed-backed bets. Game markets are
 * graded automatically from the final score; player props by an admin on
 * /admin/settle, since the feed has no player stats.
 */
export const selections = pgTable(
  "selections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: text("game_id")
      .notNull()
      .references(() => games.id),
    marketKey: text("market_key").notNull(),
    outcome: text("outcome").notNull(),
    player: text("player"),
    point: numeric("point", { precision: 6, scale: 1 }),
    price: integer("price").notNull(),
    book: text("book").notNull(),
    bookTitle: text("book_title").notNull(),
    status: pickStatusEnum("status").notNull().default("pending"),
    finalScore: text("final_score"),
    voidReason: text("void_reason"),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    /** NULL with a settledAt means the grader did it from the final score. */
    settledBy: uuid("settled_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("selections_natural_key")
      .on(t.gameId, t.marketKey, t.outcome, t.player, t.point, t.price, t.book)
      .nullsNotDistinct(),
    index("selections_game_idx").on(t.gameId),
    index("selections_status_idx").on(t.status),
    check("selections_price_valid", sql`${t.price} >= 100 or ${t.price} <= -100`),
  ],
);

/**
 * The legs of a community parlay: selections rather than Oobee's picks.
 * A separate table from parlay_legs rather than a second nullable column on
 * it, so neither table needs an "exactly one of these" constraint and every
 * existing parlay keeps its exact shape.
 */
export const parlaySelectionLegs = pgTable(
  "parlay_selection_legs",
  {
    parlayId: uuid("parlay_id")
      .notNull()
      .references(() => parlays.id, { onDelete: "cascade" }),
    selectionId: uuid("selection_id")
      .notNull()
      .references(() => selections.id),
  },
  (t) => [
    primaryKey({ columns: [t.parlayId, t.selectionId] }),
    index("parlay_selection_legs_selection_idx").on(t.selectionId),
  ],
);

/**
 * When each slice of the feed was last fetched, so pages can trigger a sync
 * without a stampede: whoever moves `syncedAt` forward first does the fetch,
 * everyone else reads what is already there. Also keeps the provider's
 * remaining-credit count, which /admin/slate shows.
 */
export const oddsSync = pgTable("odds_sync", {
  /** e.g. "odds:MLB:2026-10-07", "props:<gameId>", "scores:NFL", "quota". */
  key: text("key").primaryKey(),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull(),
  creditsRemaining: integer("credits_remaining"),
  creditsUsed: integer("credits_used"),
  lastError: text("last_error"),
});

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

export const parlaysRelations = relations(parlays, ({ one, many }) => ({
  owner: one(users, { fields: [parlays.ownerId], references: [users.id] }),
  slate: one(slates, { fields: [parlays.slateDate], references: [slates.date] }),
  legs: many(parlayLegs),
}));

export const parlayLegsRelations = relations(parlayLegs, ({ one }) => ({
  parlay: one(parlays, { fields: [parlayLegs.parlayId], references: [parlays.id] }),
  pick: one(picks, { fields: [parlayLegs.pickId], references: [picks.id] }),
}));

/* ------------------------------------------------------------------ types */

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type Pick = typeof picks.$inferSelect;
export type NewPick = typeof picks.$inferInsert;
export type Slate = typeof slates.$inferSelect;
export type PickFollow = typeof pickFollows.$inferSelect;
export type Parlay = typeof parlays.$inferSelect;
export type NewParlay = typeof parlays.$inferInsert;
export type ParlayLeg = typeof parlayLegs.$inferSelect;
export type NewPickFollow = typeof pickFollows.$inferInsert;
export type Post = typeof posts.$inferSelect;
export type Game = typeof games.$inferSelect;
export type Line = typeof lines.$inferSelect;
export type Selection = typeof selections.$inferSelect;
export type LinkPreview = typeof linkPreviews.$inferSelect;
export type Invitation = typeof invitations.$inferSelect;
export type NewInvitation = typeof invitations.$inferInsert;
export type Role = (typeof roleEnum.enumValues)[number];
export type PickStatus = (typeof pickStatusEnum.enumValues)[number];
export type Sport = (typeof sportEnum.enumValues)[number];
export type Market = (typeof marketEnum.enumValues)[number];
export type PickCategory = (typeof pickCategoryEnum.enumValues)[number];
export type SpendBand = (typeof spendBandEnum.enumValues)[number];
export type InviteStatus = (typeof inviteStatusEnum.enumValues)[number];
