import Link from "next/link";
import { ArrowDownRight, ArrowLeft, ArrowUpRight, Minus } from "lucide-react";
import { InfoTip } from "@/components/ui/info-tip";
import { ScrollActiveTab } from "@/components/ui/scroll-active-tab";
import { cn } from "@/lib/utils";
import { formatUnits } from "@/lib/i18n/format";

/**
 * The pieces every admin page is built from, so the console reads as one
 * dashboard: a page header, link tabs, panels, KPI tiles and empty states.
 * Server components throughout — only InfoTip hydrates.
 */

/** Title row: h1, an (i) for the long explanation, a lede, and actions on the right. */
export function PageHeader({
  title,
  description,
  info,
  actions,
  back,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** The how-it-works copy, behind an (i) beside the title. */
  info?: React.ReactNode;
  actions?: React.ReactNode;
  back?: { href: string; label: string };
  className?: string;
}) {
  return (
    <div className={cn("mb-6", className)}>
      {back && (
        <Link
          href={back.href}
          className="mb-3 inline-flex items-center gap-1.5 text-xs text-fg-muted transition-colors hover:text-fg"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="min-w-0 text-2xl font-semibold tracking-tight">{title}</h1>
            {info && (
              <InfoTip label="How this page works" className="shrink-0">
                {info}
              </InfoTip>
            )}
          </div>
          {description && <p className="mt-1 max-w-2xl text-sm text-fg-muted">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export interface TabLink {
  href: string;
  label: string;
  count?: number;
  active: boolean;
  /** Draw the count loud: something in this tab is waiting on an admin. */
  attention?: boolean;
}

/** Underlined link tabs — each one a URL, so a tab survives reload and back. */
export function TabNav({ label, tabs, className }: { label: string; tabs: TabLink[]; className?: string }) {
  return (
    <nav
      aria-label={label}
      className={cn("relative -mx-4 mb-6 overflow-x-auto overscroll-x-contain border-b border-border px-4 sm:mx-0 sm:px-0", className)}
    >
      <ScrollActiveTab />
      <ul className="flex min-w-max items-center gap-1">
        {tabs.map((tab) => (
          <li key={tab.href}>
            <Link
              href={tab.href}
              aria-current={tab.active ? "page" : undefined}
              className={cn(
                "relative inline-flex items-center gap-2 whitespace-nowrap px-3 py-2.5 text-sm transition-colors",
                tab.active ? "font-medium text-fg" : "text-fg-muted hover:text-fg",
              )}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span
                  className={cn(
                    "num rounded-full px-1.5 text-[0.6875rem] font-semibold leading-5",
                    tab.attention && tab.count > 0 ? "bg-brand text-black" : "bg-surface-2 text-fg-muted",
                  )}
                >
                  {tab.count}
                </span>
              )}
              {tab.active && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand" />}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** A titled card section. `action` sits on the title row's right — usually a "View all" link. */
export function Panel({
  title,
  description,
  action,
  children,
  className,
  bodyClassName,
  id,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  id?: string;
}) {
  const headingId = id ? `${id}-heading` : undefined;
  return (
    <section aria-labelledby={headingId} className={cn("card-hairline flex min-w-0 flex-col", className)}>
      {(title || action) && (
        <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-4">
          <div className="min-w-0">
            {title && (
              <h2 id={headingId} className="text-sm font-semibold tracking-tight text-fg">
                {title}
              </h2>
            )}
            {description && <p className="mt-0.5 text-xs text-fg-subtle">{description}</p>}
          </div>
          {action && <div className="shrink-0 text-xs">{action}</div>}
        </div>
      )}
      <div className={cn("min-w-0 flex-1 px-5 pb-5", !title && !action && "pt-5", bodyClassName)}>{children}</div>
    </section>
  );
}

/** "View all →" in a panel header. */
export function PanelLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 text-fg-muted transition-colors hover:text-brand">
      {children}
      <ArrowUpRight className="size-3.5" aria-hidden="true" />
    </Link>
  );
}

/**
 * One number with its label: the value, an optional change against a named
 * earlier period (coloured by whether that direction is good, and always
 * with an arrow and a word, never colour alone), and an optional trend drawn
 * under it.
 */
export function Kpi({
  label,
  value,
  sub,
  delta,
  tone = "neutral",
  trend,
  href,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  delta?: { now: number; before: number; period: string; upIsGood?: boolean };
  tone?: "neutral" | "hit" | "miss" | "brand";
  trend?: React.ReactNode;
  href?: string;
}) {
  const body = (
    <>
      <dt className="text-xs font-medium text-fg-muted">{label}</dt>
      <dd className="mt-2">
        <span
          className={cn(
            "block text-[1.75rem] font-semibold leading-none tracking-tight",
            tone === "hit" && "text-hit",
            tone === "miss" && "text-miss",
            tone === "brand" && "text-brand",
            tone === "neutral" && "text-fg",
          )}
        >
          {value}
        </span>
        {(delta || sub) && (
          <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-fg-subtle">
            {delta && <Delta {...delta} />}
            {sub && <span>{sub}</span>}
          </span>
        )}
        {trend && <span className="mt-3 block">{trend}</span>}
      </dd>
    </>
  );
  return href ? (
    <div className="card-hairline relative p-4 transition-colors hover:border-border-strong">
      <Link href={href} className="absolute inset-0 rounded-[inherit]" aria-label={label} />
      {body}
    </div>
  ) : (
    <div className="card-hairline p-4">{body}</div>
  );
}

function Delta({ now, before, period, upIsGood = true }: { now: number; before: number; period: string; upIsGood?: boolean }) {
  const diff = now - before;
  if (diff === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-fg-muted">
        <Minus className="size-3" aria-hidden="true" />
        same as {period}
      </span>
    );
  }
  const up = diff > 0;
  const good = up === upIsGood;
  const pct = before > 0 ? Math.round((Math.abs(diff) / before) * 100) : null;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("num inline-flex items-center gap-0.5 font-medium", good ? "text-hit" : "text-miss")}>
      <Icon className="size-3.5" aria-hidden="true" />
      {up ? "+" : "−"}
      {Math.abs(diff)}
      {pct !== null && <span className="font-normal"> ({pct}%)</span>}
      <span className="font-normal text-fg-subtle"> vs {period}</span>
    </span>
  );
}

/** A grid of Kpi tiles. A <dl>, since each tile is a term and its value. */
export function KpiGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <dl className={cn("grid grid-cols-2 gap-3 lg:grid-cols-4", className)}>{children}</dl>;
}

/** Nothing to show: an icon, one line that says so, and optionally what to do. */
export function Empty({
  icon: Icon,
  title,
  children,
  className,
}: {
  icon?: React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" }>;
  title: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("card-hairline flex flex-col items-center justify-center px-6 py-12 text-center", className)}>
      {Icon && (
        <span className="mb-3 grid size-10 place-items-center rounded-full bg-surface-2 text-fg-subtle">
          <Icon className="size-5" aria-hidden="true" />
        </span>
      )}
      <p className="text-sm font-medium text-fg">{title}</p>
      {children && <div className="mt-1 max-w-sm text-sm text-fg-muted">{children}</div>}
    </div>
  );
}

/** Net units in the result colours, or a dash when nothing has settled. */
export function NetUnits({ units, settled = 1, className }: { units: number; settled?: number; className?: string }) {
  if (settled === 0) return <span className={cn("text-fg-subtle", className)}>—</span>;
  return (
    <span
      className={cn(
        "num font-medium",
        units > 0 ? "text-hit" : units < 0 ? "text-miss" : "text-fg-muted",
        className,
      )}
    >
      {formatUnits(units)}
    </span>
  );
}

/**
 * "3 hours ago", worked out on the server at render. For admin copy that
 * reads as a sentence; feed rows use <LocalTime format="ago"> ("3h").
 */
export function since(at: Date, now: Date = new Date()): string {
  const s = Math.max(0, Math.round((now.getTime() - at.getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} ${h === 1 ? "hour" : "hours"} ago`;
  const d = Math.floor(h / 24);
  return `${d} days ago`;
}

/** "in 3 hours" / "in 2 days" — the other direction. */
export function until(at: Date, now: Date = new Date()): string {
  const s = Math.round((at.getTime() - now.getTime()) / 1000);
  if (s <= 0) return "now";
  const m = Math.floor(s / 60);
  if (m < 60) return `in ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `in ${h} ${h === 1 ? "hour" : "hours"}`;
  return `in ${Math.floor(h / 24)} days`;
}
