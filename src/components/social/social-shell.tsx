import { cn } from "@/lib/utils";

/**
 * The feed column every social page shares, sized as on X: 600px against the
 * sidebar, with hairlines either side. Home, profiles, posts and follower
 * lists all use it, so the column never moves between them. The side rail
 * beside it belongs to the app shell, on every page.
 */
export function SocialShell({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-h-dvh w-full min-w-0 border-border sm:max-w-[37.5rem] sm:border-x", className)}>
      {children}
    </div>
  );
}
