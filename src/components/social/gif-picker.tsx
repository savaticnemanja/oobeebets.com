"use client";

import * as React from "react";
import { Loader2, Search, Upload } from "lucide-react";
import { searchGifsAction } from "@/app/actions/social";
import type { GifResult } from "@/lib/giphy";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

/**
 * The composer's GIF picker: GIPHY search (trending until you type), or a
 * .gif from your device. Without a GIPHY key on the server, search is off and
 * the upload is what's left — see lib/giphy.ts.
 */
export function GifPicker({
  open,
  onOpenChange,
  onPick,
  onUpload,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (gif: GifResult) => void;
  onUpload: (file: File) => void;
}) {
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<GifResult[]>([]);
  const [configured, setConfigured] = React.useState<boolean | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      const res = await searchGifsAction(query).catch(() => ({ configured: true, results: [], error: "GIF search failed." }));
      if (cancelled) return;
      setConfigured(res.configured);
      setResults(res.results);
      setError(res.error ?? null);
      setLoading(false);
    }, query ? 350 : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, query]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(36rem,calc(100dvh-2rem))] flex-col p-4 pt-12">
        <DialogTitle className="sr-only">Choose a GIF</DialogTitle>
        <input
          ref={fileRef}
          type="file"
          accept="image/gif"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) {
              onUpload(f);
              onOpenChange(false);
            }
          }}
        />
        {configured !== false && (
          <label className="flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-2 focus-within:border-brand">
            <Search className="size-4 text-fg-subtle" aria-hidden="true" />
            <span className="sr-only">Search GIFs</span>
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search GIFs"
              className="w-full bg-transparent text-sm text-fg placeholder:text-fg-subtle focus:outline-none"
            />
          </label>
        )}

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
          {configured === false ? (
            <p className="px-2 py-6 text-center text-sm text-fg-muted">
              GIF search isn&apos;t switched on yet. You can still post a GIF from your device.
            </p>
          ) : loading && results.length === 0 ? (
            <p className="flex justify-center py-10 text-fg-subtle">
              <Loader2 className="size-5 animate-spin" aria-label="Loading" />
            </p>
          ) : error ? (
            <p className="px-2 py-6 text-center text-sm text-miss">{error}</p>
          ) : results.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-fg-muted">No GIFs for that.</p>
          ) : (
            <div className="columns-2 gap-2 [&>*]:mb-2">
              {results.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => {
                    onPick(g);
                    onOpenChange(false);
                  }}
                  className="block w-full overflow-hidden rounded-lg bg-surface-2 outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  // Its shape before it loads, so the grid doesn't jump.
                  style={{ aspectRatio: `${g.width} / ${g.height}` }}
                  aria-label={g.title}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- GIPHY's own CDN */}
                  <img src={g.preview} alt="" loading="lazy" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-2 text-sm font-medium text-brand hover:underline"
          >
            <Upload className="size-4" aria-hidden="true" /> Upload a GIF
          </button>
          {configured && <span className="text-[0.6875rem] text-fg-subtle">Powered by GIPHY</span>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
