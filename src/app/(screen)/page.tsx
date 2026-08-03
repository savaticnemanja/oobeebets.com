import type { Metadata } from "next";
import { SubscribeForm } from "@/components/newsletter/subscribe-form";
import { SITE } from "@/lib/site";

/**
 * The pre-launch signup page.
 *
 * Served at `/` by a rewrite in proxy.ts, which is why the canonical below
 * points at the site root and not at this route's own path — `/soon` is an
 * implementation detail of the gate and must never be the indexed URL.
 *
 * Sized to sit inside one viewport: the layout pins the chrome to the screen,
 * so everything here has to earn its height.
 */
export const metadata: Metadata = {
  // Absolute, or the root layout's `%s · oobee bets` template appends the brand
  // to a title that already opens with it.
  title: { absolute: `${SITE.name} — launching soon` },
  description:
    "Daily sports betting picks with a public, unedited track record. We're launching soon — join the list for the launch notification.",
  alternates: { canonical: "/" },
};

export default function PrelaunchPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      {/* Delays are staggered by hand rather than through the motion components:
          this is the one page every visitor loads, and a CSS keyframe already
          in the theme costs nothing to ship. */}
      <div className="animate-rise">
        <div className="flex items-center gap-2">
          <span className="ripple size-2" aria-hidden="true">
            <span className="relative inline-flex size-2 rounded-full bg-brand" />
          </span>
          <span className="text-[0.6875rem] font-medium uppercase tracking-[0.2em] text-brand">
            Launching soon
          </span>
        </div>
      </div>

      <h1
        className="animate-rise mt-6 text-balance text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl"
        style={{ animationDelay: "60ms" }}
      >
        Every pick we make,{" "}
        <span className="text-brand">settled in public.</span>
      </h1>

      <p
        className="animate-rise mt-5 max-w-xl text-pretty text-base leading-relaxed text-fg-muted sm:text-lg"
        style={{ animationDelay: "120ms" }}
      >
        We&rsquo;re not open yet. The board is being built &mdash; thirty picks a day,
        ranked best to worst, every one graded against the real final score. Leave your
        email and you&rsquo;ll be first through the door.
      </p>

      <div className="animate-rise max-w-xl" style={{ animationDelay: "180ms" }}>
        <SubscribeForm />
      </div>
    </div>
  );
}
