import "server-only";

/**
 * GIF search for the composer, through GIPHY. Needs GIPHY_API_KEY (free from
 * developers.giphy.com); without it search is off and the GIF button offers
 * an upload from the device instead. GIPHY_API_BASE exists for tests.
 */

export interface GifResult {
  id: string;
  /** What the post shows — GIPHY's "downsized" rendition, under ~2 MB. */
  url: string;
  /** A small one for the picker grid. */
  preview: string;
  width: number;
  height: number;
  title: string;
}

export const gifSearchConfigured = () => Boolean(process.env.GIPHY_API_KEY);

const base = () => process.env.GIPHY_API_BASE ?? "https://api.giphy.com/v1";

interface ApiGif {
  id: string;
  title?: string;
  images: Record<string, { url?: string; width?: string; height?: string } | undefined>;
}

export async function searchGifs(query: string): Promise<GifResult[]> {
  const key = process.env.GIPHY_API_KEY;
  if (!key) return [];
  const q = query.trim();
  const url = new URL(q ? `${base()}/gifs/search` : `${base()}/gifs/trending`);
  url.searchParams.set("api_key", key);
  if (q) url.searchParams.set("q", q);
  url.searchParams.set("limit", "24");
  url.searchParams.set("rating", "pg-13");
  const res = await fetch(url, { signal: AbortSignal.timeout(5000), cache: "no-store" });
  if (!res.ok) throw new Error(`GIPHY ${res.status}`);
  const body = (await res.json()) as { data?: ApiGif[] };
  return (body.data ?? []).flatMap((g) => {
    const main = g.images.downsized ?? g.images.original;
    const small = g.images.fixed_width_small ?? g.images.fixed_width ?? main;
    if (!main?.url || !small?.url) return [];
    return [
      {
        id: g.id,
        url: main.url,
        preview: small.url,
        width: Number(main.width) || 480,
        height: Number(main.height) || 270,
        title: g.title ?? "GIF",
      },
    ];
  });
}

/** Only GIPHY's own media hosts may be posted as a GIF URL. */
export function isGiphyUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && /(^|\.)giphy\.com$/.test(u.hostname);
  } catch {
    return false;
  }
}
