import { Check } from "lucide-react";
import { PassButton } from "@/components/billing/pass-button";
import { DocSection } from "@/components/doc-page";
import { Badge } from "@/components/ui/badge";
import { PASS, formatPrice } from "@/lib/pass";

/**
 * The pass, one full-width row under the account page's Plan section — where
 * the board's Unlock rows point. Someone holding a pass can buy the next one
 * here too; it starts where theirs ends.
 */
export function PassOffer({
  holding,
  testMode,
}: {
  /** They hold a pass right now. */
  holding: boolean;
  /** A Stripe test key: say which card works. */
  testMode: boolean;
}) {
  return (
    <>
      <section id="pass" className="scroll-mt-20 border-b border-border bg-surface/40 px-4 py-5">
        <div className="flex items-baseline justify-between gap-4">
          <h3 className="flex items-center gap-2 text-lg font-bold tracking-tight">
            {PASS.name}
            {holding && <Badge variant="hit">Active</Badge>}
          </h3>
          <p className="num text-lg font-semibold">
            {formatPrice(PASS.priceCents)}
            <span className="text-sm font-normal text-fg-muted"> once</span>
          </p>
        </div>
        <p className="mt-1 text-[0.9375rem] text-fg-muted">{PASS.tagline}</p>
        <ul className="mt-3 space-y-1.5 text-[0.9375rem]">
          {PASS.features.map((f) => (
            <li key={f} className="flex items-center gap-2">
              <Check className="size-4 shrink-0 text-brand" aria-hidden="true" />
              {f}
            </li>
          ))}
        </ul>
        <div className="mt-4 max-w-xs">
          <PassButton
            label={`${holding ? `Add ${PASS.days} more days` : `Get ${PASS.days} days`} — ${formatPrice(PASS.priceCents)}`}
          />
        </div>
      </section>

      <DocSection>
        <p className="text-sm">
          Payments are handled by Stripe; oobee never sees your card.
          {testMode && (
            <>
              {" "}
              This deployment uses Stripe&apos;s test mode: pay with card 4242 4242 4242 4242, any future date and
              any CVC. Nothing is charged.
            </>
          )}
        </p>
      </DocSection>
    </>
  );
}
