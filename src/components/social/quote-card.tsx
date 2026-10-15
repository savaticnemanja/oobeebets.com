import Link from "next/link";
import { Image as ImageIcon, Layers } from "lucide-react";
import type { QuotedPost } from "@/lib/social";
import { LocalTime } from "@/components/local-time";
import { Avatar, NameLine, displayNameOf } from "@/components/social/identity";
import { PostBody } from "@/components/social/post-body";
import { cn } from "@/lib/utils";

/**
 * The post a quote post embeds, as X draws it: a bordered card under the
 * quote's own text — small avatar, name and time, then its words (cut at a
 * few lines), and a line for a shared ticket or photos. Opens the quoted
 * post. `link` off in the composer, where the card is a preview.
 */
export function QuoteCard({ quote, link = true, className }: { quote: QuotedPost; link?: boolean; className?: string }) {
  const inner = (
    <>
      <div className="flex min-w-0 items-center gap-1.5">
        <Avatar name={displayNameOf(quote.author)} size="sm" className="size-5 text-[0.625rem]" />
        <NameLine user={quote.author} link={false} />
        <span className="text-sm text-fg-subtle" aria-hidden="true">·</span>
        <LocalTime at={quote.createdAt} format="ago" className="shrink-0 text-sm text-fg-subtle" />
      </div>
      {quote.body && <PostBody body={quote.body} className="mt-1 line-clamp-4 text-[0.9375rem] leading-normal" />}
      {(quote.parlayTitle || quote.hasMedia) && (
        <p className="mt-1.5 flex items-center gap-1.5 text-sm text-fg-subtle">
          {quote.parlayTitle ? (
            <>
              <Layers className="size-4 text-brand" aria-hidden="true" />
              {quote.parlayTitle}
            </>
          ) : (
            <>
              <ImageIcon className="size-4" aria-hidden="true" />
              Photo
            </>
          )}
        </p>
      )}
    </>
  );
  const box = cn("block rounded-2xl border border-border px-3 py-2.5", className);
  return link ? (
    <Link href={`/p/${quote.id}`} className={cn(box, "relative z-10 transition-colors hover:bg-white/[0.03]")} aria-label={`Quoted post by ${displayNameOf(quote.author)}`}>
      {inner}
    </Link>
  ) : (
    <div className={box}>{inner}</div>
  );
}

/** A post as the card a quote of it would show — for quoting from a timeline. */
export function asQuoted(post: {
  id: string;
  body: string;
  createdAt: Date;
  author: QuotedPost["author"];
  parlay?: { title: string | null; legs: unknown[] } | null;
  media?: unknown[];
}): QuotedPost {
  return {
    id: post.id,
    body: post.body,
    createdAt: post.createdAt,
    author: post.author,
    parlayTitle: post.parlay ? (post.parlay.title ?? `${post.parlay.legs.length}-leg parlay`) : null,
    hasMedia: (post.media?.length ?? 0) > 0,
  };
}
