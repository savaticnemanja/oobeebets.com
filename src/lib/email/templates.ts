import { SITE } from "@/lib/site";
import { formatDate } from "@/lib/i18n/format";

/**
 * The app is designed in the dark, but inbox chrome (Gmail's app, Outlook's
 * reading pane, a screenshot in a support ticket) all assume mail is on a
 * light background — a black canvas email reads as broken there far more
 * often than the app's own dark theme reads as intentional. So this is a
 * dedicated light palette, not a reuse of globals.css.
 */
const c = {
  bg: "#f1f5f4",
  card: "#ffffff",
  border: "#e2e8e6",
  brand: "#0891a8",
  brandBg: "#22d3ee",
  fg: "#0f172a",
  fgMuted: "#475569",
  fgSubtle: "#64748b",
} as const;

const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface Email {
  subject: string;
  html: string;
  text: string;
}

/**
 * The chrome every email shares: light canvas, centred 480px card, wordmark
 * above it and the legal footer below. Only what goes *inside* the card
 * differs between templates, so that is the one thing this takes as markup.
 *
 * `preheader` is the grey line inboxes print next to the subject. The run of
 * zero-width joiners after it stops the client filling that space with the
 * first words of the body instead.
 */
function shell({
  preheader,
  cardHtml,
  footerNote,
}: {
  preheader: string;
  cardHtml: string;
  footerNote: string;
}): string {
  return `<!doctype html>
<html lang="en" dir="ltr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(SITE.name)}</title>
</head>
<body style="margin:0;padding:0;background-color:${c.bg};">

  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">
    ${esc(preheader)}
    ${"&#8199;&#65279;&#847; ".repeat(60)}
  </div>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${c.bg}" style="background-color:${c.bg};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="480" style="width:480px;max-width:100%;">

          <tr>
            <td style="padding:0 4px 24px;">
              <span style="font-family:${FONT};font-size:14px;font-weight:600;letter-spacing:0.18em;color:${c.fg};">oobee<span style="color:${c.brand};">&middot;</span>bets</span>
            </td>
          </tr>

          <tr>
            <td bgcolor="${c.card}" style="background-color:${c.card};border:1px solid ${c.border};border-radius:14px;padding:36px 32px;">
${cardHtml}
            </td>
          </tr>

          <tr>
            <td style="padding:20px 8px 0;">
              <p style="margin:0;font-family:${FONT};font-size:12px;line-height:1.6;color:${c.fgSubtle};">
                ${footerNote}
              </p>
              <p style="margin:12px 0 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${c.fgSubtle};">
                &copy; ${new Date().getFullYear()} ${esc(SITE.name)}
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Sent when an admin invites someone, and again (with a fresh link) when they
 * resend it. Table-based layout with every style inlined — the two things an
 * HTML email needs regardless of client.
 */
export function inviteEmail({
  inviteUrl,
  expiresAt,
}: {
  inviteUrl: string;
  expiresAt: Date;
}): Email {
  const expiresLabel = formatDate(expiresAt);

  const html = shell({
    preheader: `You've been invited to oobee bets — the link is inside, and it expires ${expiresLabel}.`,
    footerNote:
      "If you weren't expecting this, you can ignore it — the link only works once and nothing happens until it's used.",
    cardHtml: `              <p style="margin:0 0 14px;font-family:${FONT};font-size:11px;font-weight:600;letter-spacing:0.16em;text-transform:uppercase;color:${c.brand};">Closed beta</p>

              <h1 style="margin:0 0 16px;font-family:${FONT};font-size:24px;line-height:1.2;font-weight:600;letter-spacing:-0.01em;color:${c.fg};">You're invited to oobee bets</h1>

              <p style="margin:0 0 28px;font-family:${FONT};font-size:15px;line-height:1.6;color:${c.fgMuted};">
                Someone on the team invited you to the closed beta. Follow the link below to set a password and finish creating your account.
              </p>

              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td bgcolor="${c.brandBg}" style="background-color:${c.brandBg};border-radius:10px;">
                    <a href="${inviteUrl}" style="display:inline-block;padding:13px 28px;font-family:${FONT};font-size:15px;font-weight:600;color:#000000;text-decoration:none;">Accept your invite</a>
                  </td>
                </tr>
              </table>

              <p style="margin:28px 0 0;font-family:${FONT};font-size:13px;line-height:1.6;color:${c.fgSubtle};">
                This link expires <strong style="color:${c.fgMuted};">${esc(expiresLabel)}</strong>. If the button above doesn't work, paste this into your browser:
              </p>
              <p style="margin:8px 0 0;font-family:${FONT};font-size:13px;line-height:1.5;word-break:break-all;">
                <a href="${inviteUrl}" style="color:${c.brand};text-decoration:underline;">${esc(inviteUrl)}</a>
              </p>`,
  });

  const text = [
    "CLOSED BETA",
    "",
    "You're invited to oobee bets",
    "",
    "Someone on the team invited you to the closed beta. Follow the link below",
    "to set a password and finish creating your account.",
    "",
    inviteUrl,
    "",
    `This link expires ${expiresLabel}.`,
    "",
    "If you weren't expecting this, you can ignore it — the link only works",
    "once and nothing happens until it's used.",
  ].join("\n");

  return {
    subject: "You're invited to oobee bets",
    html,
    text,
  };
}

/* ---------------------------------------------------------- announcements */

/** Blank line starts a paragraph; a single newline is a line break inside one. */
function paragraphs(body: string): string[] {
  return body
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/**
 * A broadcast to testers — the owner writes the heading and the body, and this
 * puts them in the same envelope the invite uses so an announcement doesn't
 * arrive looking like it came from somewhere else.
 *
 * The body is escaped and split into paragraphs rather than passed through as
 * markup. That is not (only) about trusting the author: hand-written HTML in an
 * email body is where layouts break, and the owner writing plain text into a
 * textarea cannot accidentally produce an unclosed tag that swallows the
 * footer. Blank lines separate paragraphs, single newlines become <br>.
 */
export function announcementEmail({
  heading,
  body,
}: {
  heading: string;
  body: string;
}): Email {
  const blocks = paragraphs(body);

  const bodyHtml = blocks
    .map(
      (p, i) =>
        `              <p style="margin:0 0 ${i === blocks.length - 1 ? "0" : "16px"};font-family:${FONT};font-size:15px;line-height:1.6;color:${c.fgMuted};">${esc(p).replace(/\n/g, "<br>")}</p>`,
    )
    .join("\n");

  // The opening of the body, as the inbox preview. Whitespace is collapsed
  // first: this is one line in a list of subjects, and a paragraph that wraps
  // in the textarea would otherwise carry its newlines into it.
  const preheader = (blocks[0] ?? heading).replace(/\s+/g, " ").slice(0, 140);

  const html = shell({
    preheader,
    footerNote: `You're receiving this because you have an account on ${SITE.name}.`,
    cardHtml: `              <p style="margin:0 0 14px;font-family:${FONT};font-size:11px;font-weight:600;letter-spacing:0.16em;text-transform:uppercase;color:${c.brand};">Announcement</p>

              <h1 style="margin:0 0 16px;font-family:${FONT};font-size:24px;line-height:1.2;font-weight:600;letter-spacing:-0.01em;color:${c.fg};">${esc(heading)}</h1>

${bodyHtml}`,
  });

  const text = [
    "ANNOUNCEMENT",
    "",
    heading,
    "",
    blocks.join("\n\n"),
    "",
    `You're receiving this because you have an account on ${SITE.name}.`,
  ].join("\n");

  return { subject: heading, html, text };
}
