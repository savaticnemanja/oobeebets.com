import type { MediaView } from "@/lib/media";
import { cn } from "@/lib/utils";

/**
 * A post's photos or GIF, laid out as X does: one on its own at its own shape
 * (within limits), two side by side, three as one tall and two stacked, four
 * in a square. Each opens full size in a new tab.
 */
export function PostMedia({ media, className }: { media: MediaView[]; className?: string }) {
  if (media.length === 0) return null;

  if (media.length === 1) {
    const m = media[0];
    // Clamp the shape so a panorama or a phone screenshot can't take over the
    // timeline; the image covers the box it gets.
    const ratio = m.width && m.height ? Math.min(Math.max(m.width / m.height, 0.75), 2) : 16 / 9;
    return (
      <div className={cn("overflow-hidden rounded-2xl border border-border", className)}>
        <MediaTile m={m} style={{ aspectRatio: String(ratio) }} className="max-h-[32rem]" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "grid h-72 grid-cols-2 gap-0.5 overflow-hidden rounded-2xl border border-border sm:h-80",
        media.length > 2 && "grid-rows-2",
        className,
      )}
    >
      {media.map((m, i) => (
        <MediaTile key={m.id} m={m} className={cn(media.length === 3 && i === 0 && "row-span-2")} />
      ))}
    </div>
  );
}

function MediaTile({ m, className, style }: { m: MediaView; className?: string; style?: React.CSSProperties }) {
  return (
    <a
      href={m.src}
      target="_blank"
      rel="noopener noreferrer"
      className={cn("relative block h-full w-full bg-surface-2", className)}
      style={style}
      aria-label={m.kind === "gif" ? "Open GIF" : "Open image"}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- user uploads and GIPHY URLs, served as-is */}
      <img src={m.src} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
      {m.kind === "gif" && (
        <span className="absolute bottom-2 left-2 rounded bg-black/70 px-1.5 py-0.5 text-[0.6875rem] font-bold text-white">
          GIF
        </span>
      )}
    </a>
  );
}
