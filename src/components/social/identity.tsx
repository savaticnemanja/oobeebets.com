import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import type { Role } from "@/db/schema";
import { cn } from "@/lib/utils";

/**
 * Who someone is, in the three sizes the social pages need. No uploaded
 * avatars yet — an initial on the brand surface, the same mark the header's
 * account menu already uses, so a person looks the same everywhere.
 *
 * Admins carry a check, as X's verified badge does, because on this site an
 * admin *is* the house: a tester should be able to tell Oobee's own posts
 * from someone quoting them.
 */

const SIZES = {
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-20 text-3xl border-2",
} as const;

export function Avatar({
  name,
  size = "md",
  className,
}: {
  name: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 select-none items-center justify-center rounded-full border border-border bg-surface-2 font-semibold uppercase text-brand",
        SIZES[size],
        className,
      )}
    >
      {name.trim().charAt(0) || "?"}
    </span>
  );
}

export function displayNameOf(user: { displayName: string | null; username: string }): string {
  return user.displayName?.trim() || user.username;
}

export function TeamBadge({ role, className }: { role: Role; className?: string }) {
  if (role !== "admin") return null;
  return (
    <BadgeCheck
      className={cn("size-4 shrink-0 fill-brand/20 text-brand", className)}
      aria-label="Oobee team"
      role="img"
    />
  );
}

/**
 * "Ben Dutton ✓ @benddutton" — one line, truncating the name first. `stacked`
 * puts the handle under the name (profile rows, a post's own page); the badge
 * stays on the name's line either way.
 */
export function NameLine({
  user,
  className,
  link = true,
  stacked = false,
}: {
  user: { displayName: string | null; username: string; role: Role };
  className?: string;
  link?: boolean;
  stacked?: boolean;
}) {
  const inner = (
    <>
      <span className="flex min-w-0 items-center gap-1">
        <span className="truncate font-semibold text-fg group-hover/name:underline">
          {displayNameOf(user)}
        </span>
        <TeamBadge role={user.role} />
      </span>
      <span className="truncate text-fg-subtle">@{user.username}</span>
    </>
  );
  const cls = cn(
    "group/name flex min-w-0 text-sm",
    stacked ? "flex-col items-start" : "items-center gap-1",
    className,
  );
  return link ? (
    <Link href={`/u/${user.username}`} className={cls}>
      {inner}
    </Link>
  ) : (
    <span className={cls}>{inner}</span>
  );
}
