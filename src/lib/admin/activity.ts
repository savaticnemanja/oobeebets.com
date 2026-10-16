import "server-only";
import { and, desc, eq, inArray, lt, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, games, picks, selections, users } from "@/db/schema";
import { lineLabel, eventLabel } from "@/lib/odds/markets";
import { CATEGORY_NOUN, type PickCategory } from "@/lib/board";
import { formatOdds, formatSlateDate } from "@/lib/i18n/format";

/**
 * The audit log, read back as sentences. Every admin action and a few
 * account events (joining, password changes) are written to audit_log where
 * they happen; this turns each row into "who did what to which thing", with a
 * link to where that thing lives in the console.
 */

export const ACTIVITY_TYPES = ["board", "results", "people", "access", "inbox", "messages"] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const ACTIVITY_TYPE_LABEL: Record<ActivityType, string> = {
  board: "Board",
  results: "Results",
  people: "People",
  access: "Access",
  inbox: "Inbox",
  messages: "Announcements",
};

/** LIKE patterns per type — the filter, and how a row finds its type. */
const PATTERNS: Record<ActivityType, string[]> = {
  board: ["slate.%", "pick.created", "pick.deleted", "picks.reordered", "pick.featured", "pick.unfeatured", "parlay.%"],
  results: ["pick.settled.%", "pick.unsettled", "selection.%"],
  people: ["user.%", "billing.%"],
  access: ["invite.%", "waitlist.%"],
  inbox: ["report.%", "post.removed", "feedback.%"],
  messages: ["announcement.%"],
};

function likeToRegex(p: string): RegExp {
  return new RegExp(`^${p.replace(/\./g, "\\.").replace(/%/g, ".*")}$`);
}
const TYPE_RULES = ACTIVITY_TYPES.flatMap((t) => PATTERNS[t].map((p) => [t, likeToRegex(p)] as const));

export function typeOf(action: string): ActivityType {
  return TYPE_RULES.find(([, re]) => re.test(action))?.[0] ?? "people";
}

export type Tone = "neutral" | "brand" | "hit" | "miss" | "pending";

export interface ActivityItem {
  id: string;
  at: Date;
  action: string;
  type: ActivityType;
  /** Null for the automatic grader and for rows whose account is gone. */
  actor: { id: string; name: string; username: string; avatarId: string | null } | null;
  /** "Auto-grader", or the email a deleted account had. */
  actorFallback: string;
  text: string;
  detail: string | null;
  href: string | null;
  tone: Tone;
}

type Meta = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
const num = (v: unknown) => (typeof v === "number" ? v : null);

const RESULT_WORD: Record<string, string> = { won: "Won", lost: "Lost", push: "Push", void: "Void" };
const RESULT_TONE: Record<string, Tone> = { won: "hit", lost: "miss", push: "neutral", void: "neutral" };

export const PAGE_SIZE = 50;

/**
 * One page of the log, newest first. `before` is the last row's timestamp from
 * the previous page; `type` narrows to one kind; `subject` keeps the rows done
 * by one account or done to it.
 */
export async function getActivity({
  type,
  subject,
  before,
  limit = PAGE_SIZE,
}: {
  type?: ActivityType | null;
  subject?: string | null;
  before?: Date | null;
  limit?: number;
} = {}): Promise<{ items: ActivityItem[]; next: Date | null }> {
  const where: SQL[] = [];
  if (type) where.push(or(...PATTERNS[type].map((p) => sql`${auditLog.action} like ${p}`))!);
  if (subject) {
    where.push(
      or(eq(auditLog.actorId, subject), and(eq(auditLog.entity, "user"), eq(auditLog.entityId, subject)))!,
    );
  }
  if (before) where.push(lt(auditLog.createdAt, before));

  const rows = await db
    .select({
      row: auditLog,
      actorName: users.displayName,
      actorUsername: users.username,
      actorAvatar: users.avatarId,
    })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.actorId))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
    .limit(limit + 1);

  const page = rows.slice(0, limit);
  const items = await describe(page);
  return { items, next: rows.length > limit ? page.at(-1)!.row.createdAt : null };
}

interface Row {
  row: typeof auditLog.$inferSelect;
  actorName: string | null;
  actorUsername: string | null;
  actorAvatar: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function describe(rows: Row[]): Promise<ActivityItem[]> {
  // What the rows point at, fetched once for the page.
  const pickIds = rows.filter((r) => r.row.entity === "pick" && UUID.test(r.row.entityId ?? "")).map((r) => r.row.entityId!);
  const selectionIds = rows
    .filter((r) => r.row.entity === "selection" && UUID.test(r.row.entityId ?? ""))
    .map((r) => r.row.entityId!);
  const userIds = rows.filter((r) => r.row.entity === "user" && UUID.test(r.row.entityId ?? "")).map((r) => r.row.entityId!);

  const [pickRows, selRows, userRows] = await Promise.all([
    pickIds.length
      ? db
          .select({ id: picks.id, selection: picks.selection, slateDate: picks.slateDate, category: picks.category, price: picks.price })
          .from(picks)
          .where(inArray(picks.id, [...new Set(pickIds)]))
      : [],
    selectionIds.length
      ? db
          .select({ sel: selections, game: games })
          .from(selections)
          .innerJoin(games, eq(games.id, selections.gameId))
          .where(inArray(selections.id, [...new Set(selectionIds)]))
      : [],
    userIds.length
      ? db
          .select({ id: users.id, username: users.username, email: users.email })
          .from(users)
          .where(inArray(users.id, [...new Set(userIds)]))
      : [],
  ]);
  const pickBy = new Map(pickRows.map((p) => [p.id, p]));
  const selBy = new Map(selRows.map((s) => [s.sel.id, s]));
  const userBy = new Map(userRows.map((u) => [u.id, u]));

  return rows.map(({ row, actorName, actorUsername, actorAvatar }) => {
    const meta = (row.meta ?? {}) as Meta;
    const a = row.action;
    const pick = row.entityId ? pickBy.get(row.entityId) : undefined;
    const sel = row.entityId ? selBy.get(row.entityId) : undefined;
    const target = row.entityId ? userBy.get(row.entityId) : undefined;
    const slateLink = (date: string | null | undefined, category?: string | null) =>
      date ? `/admin/slate?date=${date}${category ? `&category=${category}` : ""}` : "/admin/slate";
    const day = (d: unknown) => (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) ? formatSlateDate(d) : null);

    let text = a;
    let detail: string | null = null;
    let href: string | null = null;
    let tone: Tone = "neutral";

    if (a === "slate.published") {
      text = `Published the ${day(row.entityId) ?? row.entityId} slate`;
      const parts = [
        num(meta.gameCount) !== null ? `${meta.gameCount} game bet${meta.gameCount === 1 ? "" : "s"}` : null,
        num(meta.propCount) !== null ? `${meta.propCount} player prop${meta.propCount === 1 ? "" : "s"}` : null,
      ].filter(Boolean);
      detail = parts.length ? parts.join(" · ") : num(meta.pickCount) !== null ? `${meta.pickCount} picks` : null;
      href = slateLink(row.entityId);
      tone = "brand";
    } else if (a === "slate.unpublished") {
      text = `Took the ${day(row.entityId) ?? row.entityId} slate back to draft`;
      href = slateLink(row.entityId);
      tone = "pending";
    } else if (a === "pick.created") {
      const cat = str(meta.category) as PickCategory | null;
      text = `Added a ${cat ? CATEGORY_NOUN[cat] : "pick"}: ${str(meta.line) ?? "a line"}`;
      detail = [num(meta.price) !== null ? formatOdds(meta.price as number) : null, str(meta.book), day(meta.slateDate)]
        .filter(Boolean)
        .join(" · ");
      href = slateLink(str(meta.slateDate), cat);
    } else if (a === "pick.deleted") {
      text = pick ? `Removed ${pick.selection}` : "Removed a pick from a draft";
      detail = num(meta.rank) !== null ? `was #${meta.rank}` : null;
    } else if (a === "picks.reordered") {
      const cat = str(meta.category) as PickCategory | null;
      text = `Reordered the ${cat ? `${CATEGORY_NOUN[cat]}s` : "picks"} for ${day(row.entityId) ?? row.entityId}`;
      href = slateLink(row.entityId, cat);
    } else if (a === "pick.featured" || a === "pick.unfeatured") {
      text = `${a === "pick.featured" ? "Featured" : "Unfeatured"} ${pick?.selection ?? "a pick"}`;
      href = pick ? slateLink(pick.slateDate, pick.category) : null;
    } else if (a.startsWith("pick.settled.")) {
      const r = a.split(".")[2];
      text = r === "void" ? `Voided ${pick?.selection ?? "a pick"}` : `Settled ${pick?.selection ?? "a pick"} as ${RESULT_WORD[r] ?? r}`;
      detail = str(meta.voidReason) ?? (str(meta.finalScore) ? `Final ${meta.finalScore}` : null);
      href = "/admin/settle?tab=settled";
      tone = RESULT_TONE[r] ?? "neutral";
    } else if (a === "pick.unsettled") {
      text = `Reopened ${pick?.selection ?? "a pick"}`;
      detail = str(meta.was) ? `was ${RESULT_WORD[meta.was as string] ?? meta.was}` : null;
      href = "/admin/settle";
      tone = "pending";
    } else if (a.startsWith("selection.settled.")) {
      const [, , r, auto] = a.split(".");
      const label = sel ? lineLabel(sel.sel) : "a line";
      text = auto ? `Graded ${label} as ${RESULT_WORD[r] ?? r}` : `Settled ${label} as ${RESULT_WORD[r] ?? r}`;
      detail = [sel ? eventLabel(sel.game) : null, str(meta.voidReason) ?? (str(meta.finalScore) ? `Final ${meta.finalScore}` : null)]
        .filter(Boolean)
        .join(" · ") || null;
      href = "/admin/settle?tab=settled";
      tone = RESULT_TONE[r] ?? "neutral";
    } else if (a === "selection.unsettled") {
      text = `Reopened ${sel ? lineLabel(sel.sel) : "a line"}`;
      detail = sel ? eventLabel(sel.game) : null;
      href = "/admin/settle";
      tone = "pending";
    } else if (a === "parlay.created") {
      text = `Built an Oobee parlay${num(meta.legs) !== null ? ` (${meta.legs} legs)` : ""}`;
      detail = day(meta.slateDate);
      href = slateLink(str(meta.slateDate), "parlay");
    } else if (a === "parlay.deleted") {
      text = "Removed an Oobee parlay";
      detail = num(meta.rank) !== null ? `was #${meta.rank}` : null;
    } else if (a === "parlay.featured" || a === "parlay.unfeatured") {
      text = `${a === "parlay.featured" ? "Featured" : "Unfeatured"} an Oobee parlay`;
    } else if (a === "user.role_changed") {
      const who = target ? `@${target.username}` : (str(meta.email) ?? "an account");
      text = meta.to === "admin" ? `Made ${who} an admin` : `Removed admin access from ${who}`;
      href = row.entityId ? `/admin/users/${row.entityId}` : null;
      tone = "brand";
    } else if (a === "user.onboarded") {
      text = "Joined";
      detail = meta.selfServe ? "signed up themselves" : "from an invite";
      href = row.entityId ? `/admin/users/${row.entityId}` : null;
      tone = "hit";
    } else if (a === "user.password_reset") {
      text = "Reset their password with an emailed link";
      href = row.entityId ? `/admin/users/${row.entityId}` : null;
    } else if (a === "user.password_changed") {
      text = "Changed their password";
      href = row.entityId ? `/admin/users/${row.entityId}` : null;
    } else if (a === "billing.subscription") {
      text = `Plan is now ${str(meta.tier) ?? "?"} · ${str(meta.status)?.replace("_", " ") ?? "?"}`;
    } else if (a === "invite.sent") {
      text = `Invited ${str(meta.email) ?? "someone"}`;
      href = "/admin/users?tab=invites";
      tone = "brand";
    } else if (a === "invite.resent") {
      text = `Resent the invite to ${str(meta.email) ?? "someone"}`;
      href = "/admin/users?tab=invites";
    } else if (a === "invite.revoked") {
      text = `Revoked the invite to ${str(meta.email) ?? "someone"}`;
      href = "/admin/users?tab=invites";
      tone = "miss";
    } else if (a === "waitlist.invited") {
      text = `Invited ${str(meta.email) ?? "someone"} off the waitlist`;
      href = "/admin/waitlist";
      tone = "brand";
    } else if (a === "waitlist.notified") {
      text = `Told ${num(meta.sent) ?? 0} ${meta.sent === 1 ? "person" : "people"} on the waitlist that sign-ups are open`;
      detail = num(meta.failed) ? `${meta.failed} failed` : null;
      href = "/admin/waitlist";
    } else if (a === "report.post_removed") {
      text = "Removed a reported post";
      detail = str(meta.reason)?.replace(/_/g, " ") ?? null;
      href = "/admin/reports?show=resolved";
      tone = "miss";
    } else if (a === "report.dismissed") {
      text = "Dismissed a report";
      detail = str(meta.reason)?.replace(/_/g, " ") ?? null;
      href = "/admin/reports?show=resolved";
    } else if (a === "post.removed") {
      text = `Removed ${str(meta.author) ? `@${meta.author}'s` : "a"} post`;
      const body = str(meta.body);
      detail = body ? `“${body.length > 90 ? `${body.slice(0, 90)}…` : body}”` : null;
      tone = "miss";
    } else if (a === "feedback.resolved" || a === "feedback.reopened") {
      text = a === "feedback.resolved" ? "Resolved a piece of feedback" : "Reopened a piece of feedback";
      href = a === "feedback.resolved" ? "/admin/feedback?show=resolved" : "/admin/feedback";
    } else if (a === "announcement.sent") {
      text = `Sent “${str(meta.heading) ?? "an announcement"}”`;
      detail = [str(meta.audienceLabel), num(meta.sent) !== null ? `${meta.sent} delivered` : null].filter(Boolean).join(" · ") || null;
      href = "/admin/announce";
      tone = "brand";
    } else if (a === "announcement.tested") {
      text = `Sent themselves a test of “${str(meta.heading) ?? "an announcement"}”`;
      href = "/admin/announce";
    } else if (a === "announcement.failed") {
      text = `Couldn't send “${str(meta.heading) ?? "an announcement"}”`;
      detail = str(meta.error);
      href = "/admin/announce";
      tone = "miss";
    }

    return {
      id: row.id,
      at: row.createdAt,
      action: a,
      type: typeOf(a),
      actor:
        row.actorId && actorUsername
          ? { id: row.actorId, name: actorName?.trim() || actorUsername, username: actorUsername, avatarId: actorAvatar }
          : null,
      actorFallback: row.actorEmail === "grader" || (!row.actorId && a.endsWith(".auto")) ? "Auto-grader" : (row.actorEmail ?? "System"),
      text,
      detail: detail || null,
      href,
      tone,
    };
  });
}
