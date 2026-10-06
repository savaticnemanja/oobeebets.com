import "server-only";
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import http from "node:http";
import https from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { linkPreviews, type LinkPreview } from "@/db/schema";

/**
 * Open Graph / Twitter card previews for links in posts.
 *
 * The server fetches a URL a user typed, which makes this an SSRF surface:
 * left alone, "http://oobeebets-beta-db:5432" or "http://169.254.169.254/" in
 * a post would have this container probe its own network on the poster's
 * behalf. So every hop is resolved first, refused if any address is private,
 * loopback, link-local or otherwise not the public internet, and then
 * connected to *that exact address* (the custom `lookup` below) — checking a
 * name and letting the socket resolve it again would let a DNS-rebinding
 * host answer differently the second time.
 *
 * Bounded everywhere: 5s per request, 3 redirects, 512 KB of body, and only
 * the <head> is parsed. A preview that fails any of that is cached as failed
 * and the post simply renders without a card.
 */

const TIMEOUT_MS = 5000;
const MAX_REDIRECTS = 3;
const MAX_BYTES = 512 * 1024;
/** A failed fetch is retried after this long, a good one refreshed after a week. */
const FAILED_TTL_MS = 6 * 60 * 60 * 1000;
const OK_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const USER_AGENT =
  // Several sites (X itself among them) only serve OG tags to agents they
  // recognise as link unfurlers; this names us and borrows the convention.
  "Mozilla/5.0 (compatible; oobeebot/1.0; +https://oobeebets.com) facebookexternalhit/1.1";

/* ------------------------------------------------------------ addresses */

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, oct) => (acc << 8) + Number(oct), 0) >>> 0;
}

const BLOCKED_V4: Array<[string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

function isPublicV4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  return !BLOCKED_V4.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (n & mask) === (ipv4ToInt(base) & mask);
  });
}

function isPublicV6(ip: string): boolean {
  const lower = ip.toLowerCase();
  // IPv4-mapped (::ffff:10.0.0.1) is judged as the IPv4 address it is.
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPublicV4(mapped[1]);
  if (lower === "::" || lower === "::1") return false;
  // fc00::/7 unique-local, fe80::/10 link-local, ff00::/8 multicast,
  // 2001:db8::/32 documentation, 64:ff9b::/96 NAT64 (can reach v4 privates).
  if (/^f[cd]/.test(lower)) return false;
  if (/^fe[89ab]/.test(lower)) return false;
  if (lower.startsWith("ff")) return false;
  if (lower.startsWith("2001:db8:")) return false;
  if (lower.startsWith("64:ff9b:")) return false;
  return true;
}

export function isPublicAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return isPublicV4(ip);
  if (family === 6) return isPublicV6(ip);
  return false;
}

/**
 * Resolves like dns.lookup, but fails the connection if any answer is not a
 * public address. Passed to http.request, so the address checked is the
 * address connected to.
 */
const guardedLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, "", 0);
    const list = addresses as unknown as LookupAddress[];
    if (list.length === 0 || !list.every((a) => isPublicAddress(a.address))) {
      return callback(new Error(`Refusing non-public address for ${hostname}`), "", 0);
    }
    if (options.all) return (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, list);
    callback(null, list[0].address, list[0].family);
  });
};

/* -------------------------------------------------------------- urls */

/**
 * The canonical form a link is stored and cached under, or null when it is
 * not something we will fetch: http(s) only, default ports only, no
 * credentials, and no bare IP literals pointing anywhere private.
 */
export function normalizeLinkUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (url.port && url.port !== "80" && url.port !== "443") return null;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) && !isPublicAddress(host)) return null;
  if (host === "localhost" || host.endsWith(".localhost") || !host.includes(".")) return null;
  url.hash = "";
  return url.toString();
}

/* ------------------------------------------------------------ fetching */

interface Fetched {
  finalUrl: string;
  html: string;
}

function fetchOnce(url: URL): Promise<{ status: number; location?: string; html?: string; contentType?: string }> {
  return new Promise((resolve, reject) => {
    const mod = url.protocol === "https:" ? https : http;
    const req = mod.request(
      url,
      {
        method: "GET",
        lookup: guardedLookup,
        timeout: TIMEOUT_MS,
        headers: {
          "user-agent": USER_AGENT,
          accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
          "accept-encoding": "identity",
          "accept-language": "en",
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          return resolve({ status, location: res.headers.location });
        }
        const contentType = String(res.headers["content-type"] ?? "");
        if (status !== 200 || !/html/i.test(contentType)) {
          res.resume();
          return resolve({ status, contentType });
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          chunks.push(chunk);
          // Everything we read lives in <head>; stop as soon as it has closed
          // or the cap is reached rather than downloading a whole page.
          if (size >= MAX_BYTES || chunk.includes("</head>")) res.destroy();
        });
        const finish = () => {
          const buf = Buffer.concat(chunks).subarray(0, MAX_BYTES);
          resolve({ status, contentType, html: decode(buf, contentType) });
        };
        res.on("end", finish);
        res.on("close", finish);
        res.on("error", finish);
      },
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end();
  });
}

function decode(buf: Buffer, contentType: string): string {
  const charset =
    contentType.match(/charset=([\w-]+)/i)?.[1] ??
    buf.subarray(0, 2048).toString("latin1").match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1] ??
    "utf-8";
  try {
    return new TextDecoder(charset.toLowerCase()).decode(buf);
  } catch {
    return new TextDecoder("utf-8").decode(buf);
  }
}

async function fetchHtml(start: string): Promise<Fetched | null> {
  let current = new URL(start);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await fetchOnce(current);
    if (res.location) {
      const next = normalizeLinkUrl(new URL(res.location, current).toString());
      if (!next) return null;
      current = new URL(next);
      continue;
    }
    return res.html ? { finalUrl: current.toString(), html: res.html } : null;
  }
  return null;
}

/* ------------------------------------------------------------- parsing */

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'", nbsp: " ",
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });
}

function clean(s: string | undefined, max: number): string | null {
  if (!s) return null;
  const out = decodeEntities(s).replace(/\s+/g, " ").trim();
  if (!out) return null;
  return out.length > max ? `${out.slice(0, max - 1)}…` : out;
}

function attr(tag: string, name: string): string | undefined {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return m ? (m[2] ?? m[3] ?? m[4]) : undefined;
}

export interface ParsedPreview {
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  siteName: string | null;
  cardType: string | null;
}

export function parsePreview(html: string, pageUrl: string): ParsedPreview {
  const head = html.split(/<\/head>/i)[0];
  const meta = new Map<string, string>();
  for (const tag of head.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = (attr(tag, "property") ?? attr(tag, "name"))?.toLowerCase();
    const content = attr(tag, "content");
    // First one wins, as unfurlers do — later duplicates are usually
    // fallbacks injected by a CMS plugin.
    if (key && content !== undefined && !meta.has(key)) meta.set(key, content);
  }
  const titleTag = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];

  const rawImage =
    meta.get("og:image:secure_url") ?? meta.get("og:image") ?? meta.get("og:image:url") ??
    meta.get("twitter:image") ?? meta.get("twitter:image:src");
  let imageUrl: string | null = null;
  if (rawImage) {
    try {
      const abs = new URL(decodeEntities(rawImage.trim()), pageUrl);
      if (abs.protocol === "https:" || abs.protocol === "http:") imageUrl = abs.toString();
    } catch {
      /* unusable image URL — the card renders without one */
    }
  }

  return {
    title: clean(meta.get("og:title") ?? meta.get("twitter:title") ?? titleTag, 200),
    description: clean(
      meta.get("og:description") ?? meta.get("twitter:description") ?? meta.get("description"),
      300,
    ),
    imageUrl: imageUrl && imageUrl.length <= 2000 ? imageUrl : null,
    siteName: clean(meta.get("og:site_name"), 80),
    cardType: clean(meta.get("twitter:card"), 40),
  };
}

/* --------------------------------------------------------------- cache */

function isFresh(row: LinkPreview): boolean {
  const ttl = row.status === "ok" ? OK_TTL_MS : FAILED_TTL_MS;
  return Date.now() - row.fetchedAt.getTime() < ttl;
}

/**
 * The preview for a link, from cache when fresh, otherwise fetched and stored.
 * Never throws: an unreachable or tag-less page is cached as "failed" and
 * returned as null, and the post goes out without a card.
 */
export async function getLinkPreview(rawUrl: string): Promise<LinkPreview | null> {
  const url = normalizeLinkUrl(rawUrl);
  if (!url) return null;

  const [cached] = await db.select().from(linkPreviews).where(eq(linkPreviews.url, url)).limit(1);
  if (cached && isFresh(cached)) return cached.status === "ok" ? cached : null;

  let parsed: ParsedPreview | null = null;
  try {
    const page = await fetchHtml(url);
    if (page) parsed = parsePreview(page.html, page.finalUrl);
  } catch {
    parsed = null;
  }

  // A page with neither a title nor an image would draw an empty box.
  const ok = Boolean(parsed && (parsed.title || parsed.imageUrl));
  const values = {
    url,
    status: ok ? ("ok" as const) : ("failed" as const),
    title: ok ? parsed!.title : null,
    description: ok ? parsed!.description : null,
    imageUrl: ok ? parsed!.imageUrl : null,
    siteName: ok ? parsed!.siteName : null,
    cardType: ok ? parsed!.cardType : null,
    fetchedAt: new Date(),
  };
  const [row] = await db
    .insert(linkPreviews)
    .values(values)
    .onConflictDoUpdate({ target: linkPreviews.url, set: values })
    .returning();
  return row.status === "ok" ? row : null;
}
