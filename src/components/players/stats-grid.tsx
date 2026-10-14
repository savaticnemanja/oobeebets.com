import Link from "next/link";
import { ArrowDown, ArrowUp } from "lucide-react";
import { formatStat, type StatColumn } from "@/lib/players/catalog";
import { cn } from "@/lib/utils";
import { StatRow } from "./stat-row";

/**
 * The Players tables — the league table, a player's seasons, their game log.
 *
 * A grid of rows rather than a <table>, so the infinite-scroll loader
 * (components/load-more.tsx) can append rows after the first fifty: every row
 * carries the same column template, and the loader sits inside the same
 * scroller, so a loaded row lines up with the rest and scrolls sideways with
 * them. Wide tables scroll inside their own box (as components/ui/table.tsx
 * does) with the rank and the name pinned on the left, so the page itself
 * never scrolls sideways on a phone.
 */

export interface GridRow {
  id: string;
  /** Tapping the row goes here; the name in `lead` should link here too. */
  href?: string;
  /** Position in the list, for the # column. */
  rank?: number;
  /** The pinned left cell: a player's name and team, a season, a game. */
  lead: React.ReactNode;
  stats: Record<string, number>;
}

export interface GridSort {
  key: string;
  dir: "asc" | "desc";
  /** Where a header points: its column, best first — or flipped, if it's the one sorted. */
  href: (key: string) => string;
}

/**
 * The columns, as a CSS grid template every row repeats. The pinned name
 * column is narrower on a phone (--grid-lead, set on the table), so more
 * numbers fit beside it.
 */
function template(columns: number, rank: boolean): string {
  return `${rank ? "2.5rem " : ""}var(--grid-lead) repeat(${columns}, minmax(3.5rem,1fr))`;
}

const PIN = "sticky z-10 bg-black transition-colors group-hover:bg-surface";

export function StatsGrid({
  label,
  leadLabel,
  columns,
  rows,
  rank = false,
  sort,
  more,
}: {
  /** Names the table for screen readers: "NBA per game, 2025–26". */
  label: string;
  /** The pinned column's header: "Player", "Season", "Game". */
  leadLabel: string;
  columns: StatColumn[];
  rows: GridRow[];
  rank?: boolean;
  sort?: GridSort;
  /** Rows still to come — the infinite-scroll loader. */
  more?: React.ReactNode;
}) {
  const style = { gridTemplateColumns: template(columns.length, rank) };
  return (
    <div className="overflow-x-auto overscroll-x-contain [scrollbar-width:thin]">
      <div role="table" aria-label={label} className="w-max min-w-full [--grid-lead:8.75rem] sm:[--grid-lead:11.5rem]">
        <div role="row" style={style} className="grid border-b border-border">
          {rank && (
            <span role="columnheader" className={cn(PIN, "left-0 py-2.5 pl-4 text-[0.6875rem] font-medium uppercase tracking-wider text-fg-subtle")}>
              #
            </span>
          )}
          <span
            role="columnheader"
            className={cn(
              PIN,
              rank ? "left-[2.5rem]" : "left-0 pl-4",
              "border-r border-border py-2.5 pr-3 text-[0.6875rem] font-medium uppercase tracking-wider text-fg-subtle",
            )}
          >
            {leadLabel}
          </span>
          {columns.map((col) => (
            <HeaderCell key={col.key} column={col} sort={sort} />
          ))}
        </div>
        <GridRows columns={columns} rows={rows} rank={rank} activeKey={sort?.key} />
        {more}
      </div>
    </div>
  );
}

function HeaderCell({ column, sort }: { column: StatColumn; sort?: GridSort }) {
  const active = sort?.key === column.key;
  const Arrow = sort?.dir === "asc" ? ArrowUp : ArrowDown;
  const text = (
    <>
      {active && <Arrow className="size-3 shrink-0 text-brand" strokeWidth={2.5} aria-hidden="true" />}
      <abbr title={column.title} className="no-underline">
        {column.label}
      </abbr>
    </>
  );
  const cls = cn(
    "flex items-center justify-end gap-0.5 px-2 py-2.5 text-[0.6875rem] font-medium uppercase tracking-wider",
    active ? "text-fg" : "text-fg-subtle",
  );
  return (
    <span
      role="columnheader"
      aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined}
      className="flex"
    >
      {sort ? (
        <Link
          href={sort.href(column.key)}
          scroll={false}
          aria-label={`Sort by ${column.title}`}
          className={cn(cls, "flex-1 transition-colors hover:text-fg")}
        >
          {text}
        </Link>
      ) : (
        <span className={cn(cls, "flex-1")}>{text}</span>
      )}
    </span>
  );
}

/**
 * The rows alone — what a loaded chunk renders, so it matches the first page
 * cell for cell.
 */
export function GridRows({
  columns,
  rows,
  rank = false,
  activeKey,
}: {
  columns: StatColumn[];
  rows: GridRow[];
  rank?: boolean;
  activeKey?: string;
}) {
  const style = { gridTemplateColumns: template(columns.length, rank) };
  const rowClass = "grid border-b border-border";
  return rows.map((row) => {
    const cells = (
      <>
        {rank && (
          <span role="cell" className={cn(PIN, "num left-0 flex items-center py-2.5 pl-4 text-sm text-fg-subtle")}>
            {row.rank}
          </span>
        )}
        <span
          role="rowheader"
          className={cn(PIN, rank ? "left-[2.5rem]" : "left-0 pl-4", "min-w-0 border-r border-border py-2 pr-3")}
        >
          {row.lead}
        </span>
        {columns.map((col) => (
          <span
            role="cell"
            key={col.key}
            className={cn(
              "num flex items-center justify-end px-2 py-2.5 text-sm",
              col.key === activeKey ? "font-semibold text-fg" : "text-fg-muted",
            )}
          >
            {formatStat(row.stats[col.key], col.format)}
          </span>
        ))}
      </>
    );
    return row.href ? (
      <StatRow key={row.id} href={row.href} style={style} className={cn(rowClass, "group transition-colors hover:bg-surface")}>
        {cells}
      </StatRow>
    ) : (
      <div key={row.id} role="row" style={style} className={rowClass}>
        {cells}
      </div>
    );
  });
}

/** The pinned cell for a player: name over "TEAM · POS". */
export function PlayerLead({
  href,
  name,
  team,
  position,
}: {
  href: string;
  name: string;
  team: string | null;
  position: string | null;
}) {
  const sub = [team, position].filter(Boolean).join(" · ");
  return (
    <>
      <Link href={href} className="block truncate text-sm font-semibold text-fg hover:underline">
        {name}
      </Link>
      {sub && <span className="block truncate text-xs text-fg-subtle">{sub}</span>}
    </>
  );
}
