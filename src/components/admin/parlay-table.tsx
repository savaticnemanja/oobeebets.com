import Link from "next/link";
import { ParlayLegList } from "@/components/parlay-card";
import { LocalTime } from "@/components/local-time";
import { NetUnits } from "@/components/admin/kit";
import type { ParlayView } from "@/lib/parlay-store";
import { formatOdds, formatSlateDate } from "@/lib/i18n/format";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const STATUS_LABEL = t().status;

const STATUS_TONE: Record<string, string> = {
  won: "text-hit",
  lost: "text-miss",
  pending: "text-pending",
};

/**
 * Parlays as a table — the legs, the live price, how it went and what it
 * paid at the flat stake. `owner` adds a column linking each to its builder's
 * page in Users.
 */
export function ParlayTable({ parlays, owner = false }: { parlays: ParlayView[]; owner?: boolean }) {
  return (
    <div className="card-hairline overflow-x-auto">
      <table className="w-full min-w-[46rem] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-fg-subtle">
            {owner && <th scope="col" className="px-4 py-2.5 font-medium">Built by</th>}
            <th scope="col" className={cn("py-2.5 font-medium", owner ? "px-3" : "px-4")}>Legs</th>
            <th scope="col" className="px-3 py-2.5 text-right font-medium">Price</th>
            <th scope="col" className="px-3 py-2.5 font-medium">Result</th>
            <th scope="col" className="px-3 py-2.5 text-right font-medium">Units</th>
            <th scope="col" className="px-4 py-2.5 text-right font-medium">Built</th>
          </tr>
        </thead>
        <tbody>
          {parlays.map((p) => (
            <tr key={p.id} className="border-b border-border/60 align-top last:border-0">
              {owner && (
                <td className="px-4 py-3">
                  {p.ownerId ? (
                    <Link href={`/admin/users/${p.ownerId}?tab=parlays`} className="text-fg hover:text-brand hover:underline">
                      {p.ownerEmail ?? (p.ownerUsername ? `@${p.ownerUsername}` : "an account")}
                    </Link>
                  ) : (
                    <span className="text-fg">Oobee</span>
                  )}
                  <span className="num mt-0.5 block text-xs text-fg-subtle">{formatSlateDate(p.slateDate)}</span>
                  {p.shared && <span className="mt-0.5 block text-xs text-fg-subtle">shared to Community</span>}
                </td>
              )}
              <td className={cn("py-3", owner ? "px-3" : "px-4")}>
                <span className="num text-xs text-fg-subtle">
                  {p.title ?? `${p.legs.length} legs`}
                  {!owner && ` · ${formatSlateDate(p.slateDate)}`}
                  {!owner && !p.ownerId && " · Oobee's"}
                  {!owner && p.ownerUsername && p.ownerId && ` · by @${p.ownerUsername}`}
                </span>
                <div className="mt-1">
                  <ParlayLegList legs={p.legs} />
                </div>
              </td>
              <td className="num px-3 py-3 text-right text-fg-muted">{p.price === null ? "—" : formatOdds(p.price)}</td>
              <td className={cn("px-3 py-3 text-xs", STATUS_TONE[p.status] ?? "text-fg-subtle")}>{STATUS_LABEL[p.status]}</td>
              <td className="px-3 py-3 text-right">
                <NetUnits units={p.profit} settled={p.status === "pending" || p.status === "void" ? 0 : 1} />
              </td>
              <td className="num whitespace-nowrap px-4 py-3 text-right text-xs text-fg-subtle">
                <LocalTime at={p.createdAt} format="datetime" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
