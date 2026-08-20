import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { BetaGateForm } from "@/components/beta-gate-form";
import { betaGatePassword, safeNextPath } from "@/lib/beta-gate";

/**
 * Reads BETA_GATE_PASSWORD, which only exists at run time. Prerendered — the
 * default — the `notFound()` below is decided during the build, when no such
 * variable is set, and the gate 404s on the very deployment it guards.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Beta",
  robots: { index: false, follow: false },
};

/**
 * The prompt in front of the beta deployment.
 *
 * Middleware already redirects here, and would not have on a build with no
 * BETA_GATE_PASSWORD set — but the route is reachable directly, and a password
 * form on an ungated site is an invitation to guess at nothing. It 404s there
 * instead.
 */
export default async function BetaGatePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  if (!betaGatePassword()) notFound();

  const { next } = await searchParams;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="px-4 py-5 sm:px-6">
        <Logo />
      </header>

      <main id="main" className="flex flex-1 items-center justify-center px-4 py-8">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-semibold tracking-tight">Beta</h1>
          <p className="mt-2 text-sm text-fg-muted">
            An unreleased build of oobee bets. Everything here is test data —
            picks, records and accounts are seeded, not real.
          </p>
          <div className="mt-8">
            <BetaGateForm next={safeNextPath(next) ?? undefined} />
          </div>
          <p className="mt-6 text-xs text-fg-subtle">
            Looking for the live site?{" "}
            {/* Deliberately not a <Link>: it leaves this deployment entirely,
                and prefetching another origin does nothing useful. */}
            <a href="https://oobeebets.com" className="underline hover:text-fg-muted">
              oobeebets.com
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}
