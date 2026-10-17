/**
 * The problem-gambling helpline, in every page's small print. 1-800-GAMBLER
 * is the US national helpline (run by the National Council on Problem
 * Gambling) — the audience the slate's time zone, the dollar spend bands and
 * the US books all point at. A tel: link rather than a help page: the old
 * help pages were removed, but the number belongs wherever the 21+ line does.
 */
export function HelpLine() {
  return (
    <>
      Gambling problem? Call or text{" "}
      <a href="tel:+18004262537" className="whitespace-nowrap text-fg-muted underline-offset-2 hover:underline">
        1-800-GAMBLER
      </a>
      .
    </>
  );
}
