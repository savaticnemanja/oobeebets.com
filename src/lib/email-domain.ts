/**
 * Whether an address's domain can receive mail — the sign-up forms' typo and
 * invented-domain check (lib/spam-guard.ts). Its own module, with nothing but
 * DNS, so it can be exercised without the app around it.
 */
import { resolve4, resolve6, resolveMx } from "node:dns/promises";

const domainCache = new Map<string, { ok: boolean; at: number }>();
const DOMAIN_TTL_MS = 6 * 60 * 60 * 1000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);
}

/**
 * Can this address's domain receive mail at all? A null MX ("0 .", RFC 7505)
 * or no MX and no A/AAAA means no. A lookup that fails for any other reason
 * (timeout, resolver trouble) says yes: this check is for typos and invented
 * domains, and must never shut out a real person because DNS hiccupped.
 * SIGNUP_EMAIL_DNS_CHECK=0 turns it off (CI, whose test addresses use the
 * mail-less example.com).
 */
export async function emailDomainAccepts(email: string): Promise<boolean> {
  if (process.env.SIGNUP_EMAIL_DNS_CHECK === "0") return true;
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return false;
  const cached = domainCache.get(domain);
  if (cached && Date.now() - cached.at < DOMAIN_TTL_MS) return cached.ok;

  let ok = true;
  try {
    const mx = await withTimeout(resolveMx(domain), 2500);
    ok = mx.some((r) => r.exchange && r.exchange !== ".");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOTFOUND" || code === "ENODATA") {
      // No MX: mail falls back to the domain's own address, if it has one.
      const a = await Promise.allSettled([withTimeout(resolve4(domain), 2000), withTimeout(resolve6(domain), 2000)]);
      const anyAddress = a.some((r) => r.status === "fulfilled" && r.value.length > 0);
      const notFound = a.every((r) => r.status === "rejected" && ["ENOTFOUND", "ENODATA"].includes((r.reason as NodeJS.ErrnoException).code ?? ""));
      ok = anyAddress || !notFound;
    }
  }
  domainCache.set(domain, { ok, at: Date.now() });
  return ok;
}
