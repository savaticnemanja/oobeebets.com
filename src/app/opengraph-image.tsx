import { ImageResponse } from "next/og";
import { SITE } from "@/lib/site";

/**
 * The card every share of this site renders as. `twitter.card` is
 * summary_large_image, which without an image degrades to a bare text link.
 *
 * Generated at build time into a static PNG — nothing here reads request data,
 * so it costs one render per deploy rather than one per crawl. Satori supports
 * a flexbox subset only: every element needs an explicit `display: flex`, and
 * there is no cascade to lean on.
 */
export const alt = `${SITE.name} — ${SITE.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          background: "#000000",
          // The ambient bloom from the site itself, flattened to one gradient.
          backgroundImage:
            "radial-gradient(900px 480px at 12% -10%, rgba(34,211,238,0.20), transparent 60%)," +
            "radial-gradient(700px 400px at 92% 108%, rgba(14,116,144,0.22), transparent 62%)",
          padding: "0 96px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <svg width="88" height="88" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="8" fill="none" stroke="#22d3ee" strokeWidth="2.75" />
          </svg>
          <div
            style={{
              display: "flex",
              fontSize: 54,
              fontWeight: 600,
              color: "#e8ecea",
              letterSpacing: "0.16em",
            }}
          >
            oobee
            <span style={{ color: "#22d3ee" }}>·</span>
            bets
          </div>
        </div>

        <div
          style={{
            display: "flex",
            marginTop: 40,
            fontSize: 76,
            fontWeight: 700,
            lineHeight: 1.1,
            letterSpacing: "-0.03em",
            color: "#ffffff",
          }}
        >
          Every pick,
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 76,
            fontWeight: 700,
            lineHeight: 1.1,
            letterSpacing: "-0.03em",
            color: "#22d3ee",
          }}
        >
          settled on the record.
        </div>

        <div
          style={{
            display: "flex",
            marginTop: 44,
            fontSize: 30,
            color: "#8b9694",
          }}
        >
          {SITE.domain}
        </div>
      </div>
    ),
    size,
  );
}
