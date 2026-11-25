/**
 * The external tracker (tracker.cirko.dev). Feedback from "Send feedback" and
 * server errors become tickets: POST /api/v1/tickets, multipart, Bearer key.
 *
 * - Without TRACKER_API_KEY nothing is sent (local dev, CI). The key only
 *   ever travels in the Authorization header, never in a URL or a log line.
 * - Sending happens in the background and never throws: feedback is already
 *   saved in Postgres (/admin/feedback) before a ticket is attempted, and an
 *   error report must not raise an error of its own. A network failure, 429
 *   or 5xx is retried twice (after 5 s and 1 min), then dropped with one line
 *   in the server log — never back through the error reporter, so a tracker
 *   outage can't loop into more tickets.
 * - external_id ties a ticket back to our row: oobeebets-feedback-<uuid>, and
 *   oobeebets-error-<fingerprint>-<unix time> for errors.
 */

export interface Ticket {
  title: string;
  description: string;
  reporterEmail?: string;
  externalId: string;
  meta?: Record<string, unknown>;
}

export type TrackerConfig = { url: string; apiKey: string };

export type TrackerFetch = (
  url: string,
  init: RequestInit,
) => Promise<Pick<Response, "ok" | "status" | "text">>;

const DEFAULT_URL = "https://tracker.cirko.dev/api/v1/tickets";
const TITLE_MAX = 120;
const RETRY_MS = [5_000, 60_000];

export function trackerConfig(env: NodeJS.ProcessEnv = process.env): TrackerConfig | null {
  const apiKey = env.TRACKER_API_KEY?.trim();
  return apiKey ? { url: env.TRACKER_URL?.trim() || DEFAULT_URL, apiKey } : null;
}

export function oneLine(s: string, max: number): string {
  const line = s.replace(/\s+/g, " ").trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

/** Field names as in the tracker's own example: meta goes as a JSON string. */
export function ticketForm(t: Ticket): FormData {
  const form = new FormData();
  form.append("title", t.title);
  form.append("description", t.description);
  if (t.reporterEmail) form.append("reporter_email", t.reporterEmail);
  form.append("external_id", t.externalId);
  if (t.meta) form.append("meta", JSON.stringify(t.meta));
  return form;
}

/**
 * A sender bound to one config; null when the tracker isn't configured.
 * fetchImpl, sleep and log are there for tests. done() waits for every send
 * started so far (tests, and nothing else).
 */
export function createTracker(
  cfg: TrackerConfig | null,
  {
    fetchImpl = fetch,
    sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms).unref?.()),
    log = (msg: string) => console.error(msg),
  }: {
    fetchImpl?: TrackerFetch;
    sleep?: (ms: number) => Promise<void>;
    log?: (msg: string) => void;
  } = {},
): ((ticket: Ticket) => void) & { done: () => Promise<void> } | null {
  if (!cfg) return null;
  const pending = new Set<Promise<void>>();

  const attempt = async (t: Ticket): Promise<"ok" | "retry" | "fail"> => {
    try {
      const res = await fetchImpl(cfg.url, {
        method: "POST",
        headers: { Authorization: `Bearer ${cfg.apiKey}`, Accept: "application/json" },
        body: ticketForm(t),
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) return "ok";
      const body = (await res.text().catch(() => "")).slice(0, 300).replace(/\s+/g, " ");
      log(`[tracker] ${t.externalId} rejected (${res.status}) ${body}`);
      return res.status === 429 || res.status >= 500 ? "retry" : "fail";
    } catch (e) {
      log(`[tracker] ${t.externalId} not sent (${e instanceof Error ? e.message : String(e)})`);
      return "retry";
    }
  };

  const deliver = async (t: Ticket) => {
    for (let i = 0; ; i++) {
      const r = await attempt(t);
      if (r !== "retry" || i >= RETRY_MS.length) return;
      await sleep(RETRY_MS[i]);
    }
  };

  const send = (t: Ticket) => {
    const p: Promise<void> = deliver(t)
      .catch(() => {})
      .finally(() => pending.delete(p));
    pending.add(p);
  };
  return Object.assign(send, {
    done: async () => {
      await Promise.all([...pending]);
    },
  });
}

/** The process-wide sender, built on first use from the environment. */
let shared: ReturnType<typeof createTracker> | undefined;
export function sendTicket(ticket: Ticket): void {
  if (shared === undefined) shared = createTracker(trackerConfig());
  shared?.(ticket);
}

/* -------------------------------------------------------------- feedback */

const FEEDBACK_LABEL = { bug: "Bug", idea: "Idea", other: "Feedback" } as const;

export function feedbackTicket(f: {
  id: string;
  kind: keyof typeof FEEDBACK_LABEL;
  body: string;
  pagePath: string | null;
  userAgent: string | null;
  user: { id: string; email: string; username: string; displayName: string | null };
  siteUrl: string;
}): Ticket {
  const label = FEEDBACK_LABEL[f.kind];
  const who = f.user.displayName ? `${f.user.displayName} (@${f.user.username})` : `@${f.user.username}`;
  const details = [
    `From: ${who} <${f.user.email}>`,
    f.pagePath && `Page: ${f.pagePath}`,
    f.userAgent && `Browser: ${f.userAgent}`,
    `All feedback: ${f.siteUrl.replace(/\/+$/, "")}/admin/feedback`,
  ].filter(Boolean);
  return {
    title: `${label}: ${oneLine(f.body, TITLE_MAX - label.length - 2)}`,
    description: `${f.body}\n\n---\n${details.join("\n")}`,
    reporterEmail: f.user.email,
    externalId: `oobeebets-feedback-${f.id}`,
    meta: {
      app: "oobeebets",
      type: "feedback",
      kind: f.kind,
      feedbackId: f.id,
      userId: f.user.id,
      username: f.user.username,
      path: f.pagePath,
      userAgent: f.userAgent,
      site: f.siteUrl,
    },
  };
}

/* ---------------------------------------------------------------- errors */

const ERRORS_PER_HOUR = 30;
/** The same error is reported at most once a day per server process. */
const SAME_ERROR_MS = 24 * 3600e3;

/** Path only: a query string can carry tokens (password reset, invites). */
export function pathOnly(u: string): string {
  try {
    return new URL(u, "http://x").pathname.slice(0, 300);
  } catch {
    return "";
  }
}

/** Message without numbers + the first stack frame: one bug, one fingerprint. */
export function errorFingerprint(message: string, stack = ""): string {
  const frame =
    stack
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.startsWith("at ")) ?? "";
  const key = `${message.replace(/\d+/g, "N")}|${frame.replace(/:\d+:\d+\)?$/, "")}`;
  let h = 0x811c9dc5; // FNV-1a, 32 bit: enough to group, not a security boundary
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, "0");
}

export type ServerError = {
  message: string;
  stack?: string;
  digest?: string;
  method?: string;
  path: string;
  /** Next's routerKind / routePath / routeType, when it knows them. */
  route?: string;
  routeType?: string;
};

export function errorTicket(e: ServerError, siteUrl: string, now = Date.now()): Ticket {
  const fp = errorFingerprint(e.message, e.stack);
  return {
    title: oneLine(`Server error: ${e.message || "Unknown error"}`, TITLE_MAX),
    description: [
      e.message,
      e.stack && `\n${e.stack.slice(0, 4000)}`,
      "\n---",
      `${e.method ?? "GET"} ${e.path}`,
      e.route && `Route: ${e.route}${e.routeType ? ` (${e.routeType})` : ""}`,
      e.digest && `Digest: ${e.digest} (shown to the user as "ref")`,
      `Site: ${siteUrl}`,
    ]
      .filter(Boolean)
      .join("\n"),
    externalId: `oobeebets-error-${fp}-${Math.floor(now / 1000)}`,
    meta: {
      app: "oobeebets",
      type: "error",
      fingerprint: fp,
      digest: e.digest ?? null,
      path: e.path,
      route: e.route ?? null,
      routeType: e.routeType ?? null,
      site: siteUrl,
    },
  };
}

/**
 * Decides which server errors become tickets: a new fingerprint, or one not
 * seen for a day, and no more than ERRORS_PER_HOUR in any clock hour. Memory
 * only, so each replica decides for itself — a second replica can file the
 * same error once more, which is fine for a tracker.
 */
export function errorGate(now: () => number = Date.now) {
  const seen = new Map<string, number>();
  let hour = 0;
  let count = 0;
  return (e: Pick<ServerError, "message" | "stack">): boolean => {
    const t = now();
    const h = Math.floor(t / 3600e3);
    if (h !== hour) {
      hour = h;
      count = 0;
    }
    const fp = errorFingerprint(e.message, e.stack);
    const last = seen.get(fp);
    if (last !== undefined && t - last < SAME_ERROR_MS) return false;
    if (count >= ERRORS_PER_HOUR) return false;
    count += 1;
    seen.set(fp, t);
    if (seen.size > 5000) seen.delete(seen.keys().next().value!);
    return true;
  };
}
