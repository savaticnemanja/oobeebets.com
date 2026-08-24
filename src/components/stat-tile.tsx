import { cn } from "@/lib/utils";

/**
 * A single number with its label. `tone` colours the value by result, and the
 * value is always paired with a word so colour is never the only signal.
 *
 * WindowTile, WinRateTile and RateBar sat here too — the today/week/month
 * tiles, the suppressed-win-rate tile and the confidence-bucket bars. They went
 * with the public statistics page; git has them if it comes back.
 */
export function StatTile({
  label,
  value,
  sub,
  tone = "neutral",
  className,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "neutral" | "hit" | "miss" | "brand";
  className?: string;
}) {
  return (
    <div className={cn("card-hairline p-4", className)}>
      <dt className="text-[0.6875rem] font-medium uppercase tracking-wider text-fg-subtle">
        {label}
      </dt>
      <dd
        className={cn(
          "num mt-1.5 text-2xl font-semibold tracking-tight",
          tone === "hit" && "text-hit",
          tone === "miss" && "text-miss",
          tone === "brand" && "text-brand",
          tone === "neutral" && "text-fg",
        )}
      >
        {value}
        {/* Inside the <dd>, not beside it. A <div> inside a <dl> may hold
            nothing but one term/definition group, so a sibling <p> here made
            every stat grid in the app an invalid definition list. */}
        {sub && (
          <span className="mt-1 block font-sans text-xs font-normal tracking-normal text-fg-muted">
            {sub}
          </span>
        )}
      </dd>
    </div>
  );
}
