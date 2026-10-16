"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/social/identity";
import { LocalTime } from "@/components/local-time";
import type { DirectoryRow } from "@/lib/admin/users";
import { cn } from "@/lib/utils";

const FILTERS = [
  { key: "all", label: "Everyone" },
  { key: "user", label: "Testers" },
  { key: "admin", label: "Admins" },
  { key: "quiet", label: "Never active" },
] as const;
type Filter = (typeof FILTERS)[number]["key"];

const SORTS = [
  { key: "newest", label: "Newest" },
  { key: "active", label: "Last active" },
  { key: "bets", label: "Most bets" },
  { key: "posts", label: "Most posts" },
] as const;
type Sort = (typeof SORTS)[number]["key"];

/**
 * Every account, searchable by name, handle or email, with what each has
 * done. A row opens that person's page — their bets, parlays, sessions and
 * activity — which is where roles change too.
 */
export function UserDirectory({ rows, currentUserId }: { rows: DirectoryRow[]; currentUserId: string }) {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [filter, setFilter] = React.useState<Filter>("all");
  const [sort, setSort] = React.useState<Sort>("newest");

  const needle = q.trim().toLowerCase().replace(/^@/, "");
  const shown = rows
    .filter((r) =>
      filter === "all"
        ? true
        : filter === "quiet"
          ? r.takes + r.plays + r.posts + r.parlays === 0
          : r.role === filter,
    )
    .filter(
      (r) =>
        !needle ||
        r.email.toLowerCase().includes(needle) ||
        r.username.includes(needle) ||
        (r.displayName ?? "").toLowerCase().includes(needle),
    )
    .sort((a, b) => {
      if (sort === "active") return (b.lastActive?.getTime() ?? 0) - (a.lastActive?.getTime() ?? 0);
      if (sort === "bets") return b.takes + b.plays - (a.takes + a.plays);
      if (sort === "posts") return b.posts - a.posts;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });

  const countOf = (f: Filter) =>
    f === "all"
      ? rows.length
      : f === "quiet"
        ? rows.filter((r) => r.takes + r.plays + r.posts + r.parlays === 0).length
        : rows.filter((r) => r.role === f).length;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" aria-hidden="true" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Name, @handle or email"
            aria-label="Search users"
            className="pl-9"
          />
        </div>
        <div role="group" aria-label="Show" className="flex flex-wrap gap-1 rounded-xl border border-border p-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "rounded-lg px-2.5 py-1 text-xs transition-colors",
                filter === f.key ? "bg-surface-3 font-medium text-fg" : "text-fg-muted hover:text-fg",
              )}
            >
              {f.label} <span className="num text-fg-subtle">{countOf(f.key)}</span>
            </button>
          ))}
        </div>
        <label className="ml-auto flex items-center gap-2 text-xs text-fg-muted">
          Sort
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className="h-8 rounded-lg border border-border bg-surface px-2 text-xs text-fg"
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="card-hairline overflow-x-auto">
        <table className="w-full min-w-[46rem] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-fg-subtle">
              <th scope="col" className="px-4 py-2.5 font-medium">Account</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Joined</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Last active</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Bets</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Parlays</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Posts</th>
              <th scope="col" className="px-4 py-2.5 text-right font-medium">Followers</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((u) => {
              const href = `/admin/users/${u.id}`;
              return (
                <tr
                  key={u.id}
                  data-user-id={u.id}
                  onClick={(e) => {
                    // The name is the real link; the rest of the row is a bigger target for it.
                    if ((e.target as HTMLElement).closest("a")) return;
                    router.push(href);
                  }}
                  className="cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-white/[0.025]"
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-3">
                      <Avatar name={u.displayName || u.username} avatarId={u.avatarId} size="sm" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Link href={href} className="truncate font-medium text-fg hover:text-brand">
                            {u.displayName || `@${u.username}`}
                          </Link>
                          {u.role === "admin" && <Badge variant="brand">admin</Badge>}
                          {u.plan && <Badge>{u.plan}</Badge>}
                          {u.id === currentUserId && <span className="text-xs text-fg-subtle">(you)</span>}
                        </div>
                        <p className="truncate text-xs text-fg-subtle">
                          @{u.username} · {u.email}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="num whitespace-nowrap px-3 py-2.5 text-xs text-fg-muted">
                    <LocalTime at={u.createdAt} format="date" year="2-digit" />
                  </td>
                  <td className="num whitespace-nowrap px-3 py-2.5 text-xs text-fg-muted">
                    {u.lastActive ? <LocalTime at={u.lastActive} format="ago" /> : <span className="text-fg-subtle">never</span>}
                  </td>
                  <td className="num px-3 py-2.5 text-right text-fg">{u.takes + u.plays || <span className="text-fg-subtle">0</span>}</td>
                  <td className="num px-3 py-2.5 text-right text-fg">{u.parlays || <span className="text-fg-subtle">0</span>}</td>
                  <td className="num px-3 py-2.5 text-right text-fg">{u.posts || <span className="text-fg-subtle">0</span>}</td>
                  <td className="num px-4 py-2.5 text-right text-fg">{u.followers || <span className="text-fg-subtle">0</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {shown.length === 0 && <p className="px-4 py-10 text-center text-sm text-fg-muted">No one matches that.</p>}
      </div>
      <p className="mt-2 text-xs text-fg-subtle">
        Bets are picks taken plus parlays played. Showing {shown.length} of {rows.length}.
      </p>
    </div>
  );
}
