import Link from "next/link";
import { Bot, UserRound } from "lucide-react";
import { Avatar } from "@/components/social/identity";
import { LocalTime } from "@/components/local-time";
import type { ActivityItem, Tone } from "@/lib/admin/activity";
import { formatSlateDate } from "@/lib/i18n/format";
import { slateDateString } from "@/lib/slate-date";
import { cn } from "@/lib/utils";

const TONE_DOT: Record<Tone, string> = {
  neutral: "bg-fg-subtle/50",
  brand: "bg-brand",
  hit: "bg-hit",
  miss: "bg-miss",
  pending: "bg-pending",
};

function Row({ item }: { item: ActivityItem }) {
  const who = item.actor?.name ?? item.actorFallback;
  const inner = (
    <>
      {item.actor ? (
        <Avatar name={item.actor.name} avatarId={item.actor.avatarId} size="sm" className="mt-0.5" />
      ) : (
        <span aria-hidden="true" className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full border border-border bg-surface-2 text-fg-subtle">
          {item.actorFallback === "Auto-grader" ? <Bot className="size-4" /> : <UserRound className="size-4" />}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-snug text-fg-muted">
          <span className="font-medium text-fg">{who}</span> {item.text}
        </p>
        {item.detail && <p className="mt-0.5 truncate text-xs text-fg-subtle">{item.detail}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2 pt-0.5">
        <span aria-hidden="true" className={cn("size-1.5 rounded-full", TONE_DOT[item.tone])} />
        <LocalTime at={item.at} format="ago" className="num text-xs text-fg-subtle" />
      </div>
    </>
  );
  return (
    <li data-activity={item.action}>
      {item.href ? (
        <Link href={item.href} className="-mx-2 flex items-start gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-white/[0.03]">
          {inner}
        </Link>
      ) : (
        <div className="flex items-start gap-3 py-2.5">{inner}</div>
      )}
    </li>
  );
}

/** The log as a list; `grouped` puts a heading over each slate day. */
export function ActivityList({ items, grouped = false }: { items: ActivityItem[]; grouped?: boolean }) {
  if (!grouped) {
    return (
      <ul className="divide-y divide-border/60">
        {items.map((item) => (
          <Row key={item.id} item={item} />
        ))}
      </ul>
    );
  }
  const days: { day: string; items: ActivityItem[] }[] = [];
  for (const item of items) {
    const day = slateDateString(item.at);
    const last = days.at(-1);
    if (last?.day === day) last.items.push(item);
    else days.push({ day, items: [item] });
  }
  return (
    <div className="space-y-6">
      {days.map((d) => (
        <section key={d.day} aria-label={formatSlateDate(d.day)}>
          <h2 className="num mb-1 text-xs font-medium uppercase tracking-wider text-fg-subtle">{formatSlateDate(d.day)}</h2>
          <ul className="divide-y divide-border/60">
            {d.items.map((item) => (
              <Row key={item.id} item={item} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
