/**
 * Keeps a `next` value from turning the login into an open
 * redirect. Checking the string's prefix is not enough: before parsing, a
 * browser drops tabs and newlines and reads `\` as `/`, so `/\t/evil.com` and
 * `/\evil.com` both become the protocol-relative `//evil.com`. So the value is
 * resolved the way a browser will resolve it, and kept only if it is still on
 * this site — as a path, never a full URL.
 *
 * Resolving is not the end of it either. Dot segments are removed after the
 * origin is settled, so `/.//evil.com` resolves on this site to the path
 * `//evil.com` — which, handed to a redirect, is protocol-relative again. A
 * path that comes out starting with two slashes (or a slash and a backslash)
 * is refused.
 */
export function safeNextPath(value: string | null | undefined): string | null {
  if (!value || !value.startsWith("/")) return null;
  const base = "http://next.invalid";
  let url: URL;
  try {
    url = new URL(value, base);
  } catch {
    return null;
  }
  if (url.origin !== base) return null;
  const path = url.pathname + url.search + url.hash;
  if (path.startsWith("//") || path.startsWith("/\\")) return null;
  return path;
}
