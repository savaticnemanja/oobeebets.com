import { cn } from "@/lib/utils";

/**
 * The feed column every social page shares, with hairlines either side. It
 * fills the whole middle of the app shell — everything between the sidebar
 * and the right rail (or the edge, below `lg`) — so there is no dead strip
 * beside it. Home, profiles, posts and follower lists all use it, so the
 * column never moves between them. The rail belongs to the app shell.
 */
export function SocialShell({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-h-dvh w-full min-w-0 border-border sm:border-x", className)}>
      {children}
    </div>
  );
}
