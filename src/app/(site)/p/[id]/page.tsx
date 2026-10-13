import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getAuth } from "@/lib/auth";
import { getAncestors, getPost, getReplies, withAttachments, type FeedPost } from "@/lib/social";
import { ParlayCard } from "@/components/parlay-card";
import { appUrl } from "@/lib/site";
import { Composer } from "@/components/social/composer";
import { EmptyFeed } from "@/components/social/feed";
import { displayNameOf } from "@/components/social/identity";
import { PostCard } from "@/components/social/post-card";
import { Button } from "@/components/ui/button";
import { SocialShell } from "@/components/social/social-shell";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A post's own tags, so a link to it shared anywhere else unfurls the way
 * links inside posts do here: who said it, and what.
 */
export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  if (!UUID.test(id)) return { title: "Post not found" };
  const post = await getPost(id, null);
  if (!post) return { title: "Post not found" };
  const who = `${displayNameOf(post.author)} (@${post.author.username})`;
  // A shared parlay's post has no text of its own — the ticket is the content.
  const text = post.body || (post.parlayId ? "Shared a parlay" : "");
  const snippet = text.length > 120 ? `${text.slice(0, 119)}…` : text;
  const title = post.body ? `${who} on oobee: "${snippet}"` : `${who} on oobee: ${snippet}`;
  const url = appUrl(`/p/${post.id}`);
  const image = post.preview?.imageUrl ?? undefined;
  return {
    title,
    description: text,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      title: who,
      description: text,
      url,
      ...(image ? { images: [{ url: image }] } : {}),
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title: who,
      description: text,
      ...(image ? { images: [image] } : {}),
    },
  };
}

export default async function PostPage({ params }: { params: Params }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const auth = await getAuth();
  // Signed out, only the landing page, About and the legal pages are open.
  if (!auth) redirect(`/login?next=/p/${id}`);
  const viewerId = auth.user.id;
  const isAdmin = auth.isAdmin;

  const found = await getPost(id, viewerId);
  if (!found) notFound();
  const [chain, replyList] = await Promise.all([getAncestors(found, viewerId), getReplies(found.id, viewerId)]);
  // A shared parlay's post (or one above it) shows its ticket.
  const [post, ...ancestors] = await withAttachments([found, ...chain], viewerId);
  const replies = await withAttachments(replyList, viewerId);
  const ticket = (p: FeedPost) =>
    p.parlay ? <ParlayCard parlay={p.parlay} /> : undefined;

  return (
    <SocialShell>
      <div className="flex items-center gap-4 px-4 py-2.5">
        <Link
          href="/home"
          aria-label="Back to Home"
          className="grid size-9 place-items-center rounded-full transition-colors hover:bg-surface-2"
        >
          <ArrowLeft className="size-5" aria-hidden="true" />
        </Link>
        <h1 className="text-lg font-semibold">Post</h1>
      </div>

      {/* One unbroken thread line from the first post down to this one, as
          on X — and no "Replying to" when what it replies to is right there. */}
      {ancestors.map((a, i) => (
        <PostCard
          key={a.id}
          post={a}
          viewerId={viewerId}
          isAdmin={isAdmin}
          variant="ancestor"
          threadAbove={i > 0}
          showReplyTo={i === 0}
          attachment={ticket(a)}
        />
      ))}

      <PostCard
        post={post}
        viewerId={viewerId}
        isAdmin={isAdmin}
        variant="detail"
        threadAbove={ancestors.length > 0}
        showReplyTo={ancestors.length === 0}
        attachment={ticket(post)}
      />

      {auth ? (
        <Composer
          id="reply"
          viewerName={displayNameOf(auth.user)}
          parentId={post.id}
          placeholder="Post your reply"
          submitLabel="Reply"
        />
      ) : (
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-4">
          <p className="text-sm text-fg-muted">Sign in to join the conversation.</p>
          <Button size="sm" className="rounded-full" asChild>
            <Link href={`/login?next=/p/${post.id}`}>Sign in</Link>
          </Button>
        </div>
      )}

      {replies.length === 0 ? (
        <EmptyFeed title="No replies yet">Be the first to weigh in.</EmptyFeed>
      ) : (
        replies.map((r) => <PostCard key={r.id} post={r} viewerId={viewerId} isAdmin={isAdmin} />)
      )}
    </SocialShell>
  );
}
