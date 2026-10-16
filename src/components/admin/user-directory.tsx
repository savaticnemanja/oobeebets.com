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
import { directoryHref, type DirectoryQuery, type UserFilter, type UserSort } from "@/lib/admin/directory";
import { cn } from "@/lib/utils";

const FILTERS: { key: UserFilter; label: string }[] = [
  { key: "all", label: "Everyone" },
  { key: "user", label: "Testers" },
  { key: "admin", label: "Admins" },
  { key: "quiet", label: "Never active" },
];

const SORTS: { key: UserSort; label: string }[] = [
  { key: "newest", label: "Newest" },
  { key: "active", label: "Last active" },
  { key: "bets", label: "Most bets" },
  { key: "posts", label: "Most posts" },
];

/**
 * One page of accounts, searchable by name, handle or email. Search, filter,
 * sort and page all live in the URL and run in Postgres — the page holds only
 * the rows it shows. A row opens that person's page, where roles change.
 */
export function UserDirectory({
  rows,
  counts,
  query,
  currentUserId,
}: {
  rows: DirectoryRow[];
  counts: Record<UserFilter, number>;
  query: DirectoryQuery;
  currentUserId: string;
}) {
  const router = useRouter();
  const [q, setQ] = React.useState(query.q);
  const [, startNav] = React.useTransition();

  // Typing searches after a pause, replacing the entry rather than stacking one per keystroke.
  React.useEffect(() => {
    if (q.trim() === query.q) return;
    const id = setTimeout(() => {
      startNav(() => router.replace(directoryHref({ ...query, q: q.trim() })));
    }, 300);
    return () => clearTimeout(id);
  }, [q, query, router]);

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
        <nav aria-label="Show" className="flex flex-wrap gap-1 rounded-xl border border-border p-1">
          {FILTERS.map((f) => (
            <Link
              key={f.key}
              href={directoryHref({ ...query, filter: f.key })}
              aria-current={query.filter === f.key ? "page" : undefined}
              className={cn(
                "rounded-lg px-2.5 py-1 text-xs transition-colors",
                query.filter === f.key ? "bg-surface-3 font-medium text-fg" : "text-fg-muted hover:text-fg",
              )}
            >
              {f.label} <span className="num text-fg-subtle">{counts[f.key]}</span>
            </Link>
          ))}
        </nav>
        <label className="ml-auto flex items-center gap-2 text-xs text-fg-muted">
          Sort
          <select
            value={query.sort}
            onChange={(e) => router.push(directoryHref({ ...query, sort: e.target.value as UserSort }))}
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
            {rows.map((u) => {
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
        {rows.length === 0 && <p className="px-4 py-10 text-center text-sm text-fg-muted">No one matches that.</p>}
      </div>
      <p className="mt-2 text-xs text-fg-subtle">Bets are picks taken plus parlays played.</p>
    </div>
  );
}
