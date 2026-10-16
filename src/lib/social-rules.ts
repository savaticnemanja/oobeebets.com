/**
 * The rules of the social layer that both sides need: the composer counts
 * characters in the browser, and the action re-checks the same things on the
 * server. Nothing here touches the database,
 * so the two run one copy of the rules rather than agreeing by coincidence —
 * the same arrangement as lib/follows.ts.
 */
import { z } from "zod";

/** Keep in step with posts_body_length in db/schema.ts. */
export const POST_MAX_LENGTH = 280;
/** Keep in step with users_bio_length. */
export const BIO_MAX_LENGTH = 160;

/** Keep in step with users_username_format. */
export const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

/**
 * Handles nobody may take: the brand, and words that read as staff. A tester
 * called @oobee or @admin would be impersonating the house on its own site.
 */
const RESERVED_USERNAMES = new Set([
  "oobee", "oobeebets", "oobee_bets", "admin", "admins", "administrator", "staff",
  "support", "help", "official", "team", "moderator", "mod", "root", "system",
  "settings", "home", "about", "null", "undefined",
]);

export function isReservedUsername(username: string): boolean {
  return RESERVED_USERNAMES.has(username) || username.startsWith("oobee");
}

export const usernameSchema = z
  .string()
  .trim()
  .transform((s) => s.replace(/^@/, "").toLowerCase())
  .pipe(
    z
      .string()
      .min(3, "At least 3 characters")
      .max(20, "At most 20 characters")
      .regex(USERNAME_PATTERN, "Letters, numbers and underscores only")
      .refine((u) => !isReservedUsername(u), "That handle is reserved"),
  );

export const postBodySchema = z
  .string()
  // Normalised before counting, so the limit means the same thing in the
  // composer's counter and in the database's char_length.
  .transform((s) => s.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim())
  .pipe(
    z
      .string()
      .min(1, "Write something first")
      .max(POST_MAX_LENGTH, `Posts are at most ${POST_MAX_LENGTH} characters`),
  );

export const profileSchema = z.object({
  displayName: z.string().trim().min(1, "Enter a name").max(50, "At most 50 characters"),
  username: usernameSchema,
  bio: z
    .string()
    .trim()
    .max(BIO_MAX_LENGTH, `At most ${BIO_MAX_LENGTH} characters`)
    .optional()
    .or(z.literal("")),
});

/* ----------------------------------------------------------- tokenizing */

/**
 * URLs as people type them: with a scheme, or a bare `www.`. Bare domains
 * ("espn.com") are left as text, as on X — too many sentences end in one by
 * accident ("...version 2.0.").
 */
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi;
const MENTION_RE = /(^|[^\w@])@([a-zA-Z0-9_]{3,20})\b/g;

/** Strips the punctuation a sentence leaves on the end of a link. */
function trimUrl(raw: string): string {
  let url = raw.replace(/[.,;:!?'"]+$/, "");
  // A closing paren belongs to the URL only if it opened one (wikipedia links).
  while (url.endsWith(")") && (url.match(/\(/g)?.length ?? 0) < (url.match(/\)/g)?.length ?? 0)) {
    url = url.slice(0, -1);
  }
  return url;
}

function withScheme(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

/** At most this many people notified by one post's @mentions. */
export const MAX_MENTIONS = 10;

/** The handles a post @mentions, lowercased, once each — not ones inside a link. */
export function extractMentions(body: string): string[] {
  const names = tokenizeBody(body).flatMap((t) => (t.kind === "mention" ? [t.username] : []));
  return [...new Set(names)].slice(0, MAX_MENTIONS);
}

export type BodyToken =
  | { kind: "text"; text: string }
  | { kind: "url"; text: string; href: string }
  | { kind: "mention"; text: string; username: string };

/** Splits a post body into text, links and @mentions for rendering. */
export function tokenizeBody(body: string): BodyToken[] {
  const marks: Array<{ start: number; end: number; token: BodyToken }> = [];

  for (const m of body.matchAll(URL_RE)) {
    const text = trimUrl(m[0]);
    marks.push({
      start: m.index,
      end: m.index + text.length,
      token: { kind: "url", text: displayUrl(text), href: withScheme(text) },
    });
  }
  for (const m of body.matchAll(MENTION_RE)) {
    const start = m.index + m[1].length;
    const end = start + 1 + m[2].length;
    if (marks.some((u) => start < u.end && end > u.start)) continue; // inside a URL
    marks.push({
      start,
      end,
      token: { kind: "mention", text: `@${m[2]}`, username: m[2].toLowerCase() },
    });
  }
  marks.sort((a, b) => a.start - b.start);

  const out: BodyToken[] = [];
  let cursor = 0;
  for (const mark of marks) {
    if (mark.start > cursor) out.push({ kind: "text", text: body.slice(cursor, mark.start) });
    out.push(mark.token);
    cursor = mark.end;
  }
  if (cursor < body.length) out.push({ kind: "text", text: body.slice(cursor) });
  return out;
}

/** "https://www.espn.com/nfl/story/_/id/123456/long-slug" → "espn.com/nfl/story/_/id/1234…" */
export function displayUrl(url: string): string {
  const stripped = url.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
  return stripped.length > 32 ? `${stripped.slice(0, 31)}…` : stripped;
}

/** "1.2K", "34K" — counts on the action row. */
export function compactCount(n: number): string {
  if (n < 1000) return String(n);
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}
