import Link from "next/link";
import type { PostAuthor } from "@/lib/social";
import type { ParlayView } from "@/lib/parlay-store";
import { relativeTime } from "@/lib/social-rules";
import { Avatar, NameLine, displayNameOf } from "@/components/social/identity";
import { ParlayCard } from "@/components/parlay-card";

/**
 * A shared Community parlay as a timeline row: laid out like a post — avatar,
 * name, when — with the ticket where the post body would be.
 */
export function ParlayRow({ parlay, owner }: { parlay: ParlayView; owner: PostAuthor }) {
  return (
    <article className="flex gap-3 border-b border-border px-4 py-3">
      <Link href={`/u/${owner.username}`} aria-label={displayNameOf(owner)} className="self-start">
        <Avatar name={displayNameOf(owner)} />
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 text-sm">
          <NameLine user={owner} />
          <span className="shrink-0 text-fg-subtle">
            <span aria-hidden="true">· </span>shared a parlay ·{" "}
            <time dateTime={parlay.createdAt.toISOString()} title={parlay.createdAt.toLocaleString()}>
              {relativeTime(parlay.createdAt)}
            </time>
          </span>
        </div>
        <ParlayCard parlay={parlay} className="mt-2" />
      </div>
    </article>
  );
}
