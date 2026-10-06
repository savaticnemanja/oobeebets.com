/* eslint-disable @next/next/no-img-element -- third-party OG images: unknown
   hosts and sizes, so next/image's optimizer (which would need every host
   allow-listed) is the wrong tool. */
import { Link2 } from "lucide-react";
import type { PostPreview } from "@/lib/social";
import { linkDomain } from "@/lib/social-rules";
import { cn } from "@/lib/utils";

/**
 * The card under a post that links somewhere, built from the page's Open Graph
 * and Twitter card tags the way X builds its own:
 *
 *   summary_large_image — full-width image, domain and title beneath it
 *   anything else       — thumbnail on the left, text on the right
 *
 * The image is hot-linked from the page's own host with no referrer, so the
 * site sees a request from the viewer's browser but not which post it was in.
 */
export function LinkCard({ preview, className }: { preview: PostPreview; className?: string }) {
  const domain = linkDomain(preview.url);
  const large = preview.cardType === "summary_large_image" && preview.imageUrl;

  return (
    <a
      href={preview.url}
      target="_blank"
      // ugc + nofollow: a user wrote this link, and it should not borrow the
      // site's standing with search engines.
      rel="noopener noreferrer nofollow ugc"
      className={cn(
        "group/card block overflow-hidden rounded-xl border border-border bg-surface transition-colors hover:bg-surface-2",
        className,
      )}
    >
      {large ? (
        <>
          <div className="relative aspect-[1.91/1] w-full overflow-hidden border-b border-border bg-surface-2">
            <img
              src={preview.imageUrl!}
              alt=""
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              className="absolute inset-0 size-full object-cover"
            />
          </div>
          <div className="px-3 py-2.5">
            <p className="text-xs text-fg-subtle">{preview.siteName ?? domain}</p>
            {preview.title && (
              <p className="mt-0.5 line-clamp-2 text-sm text-fg">{preview.title}</p>
            )}
          </div>
        </>
      ) : (
        <div className="flex">
          <div className="flex w-24 shrink-0 items-center justify-center border-r border-border bg-surface-2 sm:w-32">
            {preview.imageUrl ? (
              <img
                src={preview.imageUrl}
                alt=""
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                className="aspect-square size-full object-cover"
              />
            ) : (
              <Link2 className="size-6 text-fg-subtle" aria-hidden="true" />
            )}
          </div>
          <div className="min-w-0 flex-1 px-3 py-2.5">
            <p className="truncate text-xs text-fg-subtle">{domain}</p>
            {preview.title && (
              <p className="mt-0.5 line-clamp-2 text-sm text-fg">{preview.title}</p>
            )}
            {preview.description && (
              <p className="mt-0.5 line-clamp-2 text-xs text-fg-muted">{preview.description}</p>
            )}
          </div>
        </div>
      )}
    </a>
  );
}
