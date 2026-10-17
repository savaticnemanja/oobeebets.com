import { cn } from "@/lib/utils";

/**
 * One number in the 2×2 grid at the top of Stats and of a player's page: a
 * small uppercase label over a big value, hairlines between the four. Goes
 * inside a `<dl className="grid grid-cols-2 border-b border-border">`.
 */
export function StatCell({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "hit" | "miss" | "brand";
}) {
  return (
    <div className="border-border px-4 py-3 odd:border-r [&:nth-child(-n+2)]:border-b">
      <dt className="text-[0.6875rem] font-medium uppercase tracking-wider text-fg-subtle">{label}</dt>
      <dd
        className={cn(
          "num mt-1 text-2xl font-bold tracking-tight",
          tone === "hit" ? "text-hit" : tone === "miss" ? "text-miss" : tone === "brand" ? "text-brand" : "text-fg",
        )}
      >
        {value}
        {sub && <span className="mt-0.5 block text-xs font-normal tracking-normal text-fg-subtle">{sub}</span>}
      </dd>
    </div>
  );
}
