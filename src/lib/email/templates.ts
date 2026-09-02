import { SITE, appUrl } from "@/lib/site";
import { formatDate } from "@/lib/i18n/format";

/**
 * The design tokens from globals.css, restated as flat hex.
 *
 * Two reasons this is a copy rather than an import. CSS custom properties do
 * not exist in email — every value has to be inlined on the element — and the
 * `rgba()` borders the app uses render as transparent-black in the clients
 * that do not composite them, which on a black background means an invisible
 * hairline. These are the same colours pre-composited over the surface they
 * sit on.
 */
const c = {
  bg: "#000000",
  surface: "#0a0c0b",
  surface2: "#111413",
  border: "#1e2220",
  borderStrong: "#2b302e",
  brand: "#22d3ee",
  brandDim: "#0e7490",
  fg: "#e8ecea",
  fgMuted: "#8b9694",
  fgSubtle: "#788481",
} as const;

const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/** Escapes text interpolated into the HTML body. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* ------------------------------------------------------------- fragments */

function heading(text: string): string {
  return `<h1 style="margin:0 0 16px;font-family:${FONT};font-size:28px;line-height:1.15;font-weight:600;letter-spacing:-0.02em;color:${c.fg};">${text}</h1>`;
}

function paragraph(html: string): string {
  return `<p style="margin:0 0 16px;font-family:${FONT};font-size:15px;line-height:1.65;color:${c.fgMuted};">${html}</p>`;
}

/**
 * Bulleted list built from table rows rather than <ul>. Outlook ignores list
 * padding and Gmail's mobile app re-indents it; a two-column row per item is
 * the one construction that lands identically everywhere.
 */
function list(items: string[]): string {
  const rows = items
    .map(
      (item) => `
        <tr>
          <td width="18" valign="top" style="padding:0 0 10px;font-family:${FONT};font-size:15px;line-height:1.65;color:${c.brand};">&bull;</td>
          <td valign="top" style="padding:0 0 10px;font-family:${FONT};font-size:15px;line-height:1.65;color:${c.fgMuted};">${item}</td>
        </tr>`,
    )
    .join("");

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 16px;">${rows}</table>`;
}

function divider(): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:8px 0 24px;"><tr><td height="1" style="height:1px;line-height:1px;font-size:0;background-color:${c.border};">&nbsp;</td></tr></table>`;
}

/* ----------------------------------------------------------------- shell */

interface ShellArgs {
  /** The grey line after the subject in the inbox list. */
  preheader: string;
  body: string;
  /**
   * The first line of the footer: why this person is receiving this message.
   * HTML, because the newsletter's version carries the unsubscribe link and
   * the transactional ones do not — an invite has nothing to unsubscribe from,
   * and offering one implies a list the recipient is not on.
   *
   * The 18+ notice below it is not passed in. It is the one thing that has to
   * be on every message we send, so it lives here where a new template cannot
   * forget it.
   */
  footerNote: string;
}

/**
 * The frame every message shares: black canvas, 600px hairline card, wordmark,
 * legal footer.
 *
 * One shell for the newsletter, the invite and the announcement. Beta grew a
 * second, light-palette shell of its own while main was rewriting this one;
 * keeping both meant an invite and a welcome note arriving in the same inbox
 * looked like they came from two different companies. This is the dark one,
 * because that is what the product looks like.
 */
function shell({ preheader, body, footerNote }: ShellArgs): string {
  return `<!doctype html>
<html lang="en" dir="ltr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<!-- The product is designed in the dark; tell the clients that so they leave
     the palette alone instead of inverting it into grey-on-white. -->
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${esc(SITE.name)}</title>
</head>
<body style="margin:0;padding:0;background-color:${c.bg};">

  <!-- Preheader. Zero-height and off-screen so it feeds the inbox preview
       without ever rendering; the nbsp run stops clients from pulling the
       footer's small print in behind it. -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">
    ${esc(preheader)}
    ${"&#8199;&#65279;&#847; ".repeat(60)}
  </div>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${c.bg}" style="background-color:${c.bg};">
    <tr>
      <td align="center" style="padding:32px 16px;">

        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:100%;">

          <!-- wordmark -->
          <tr>
            <td style="padding:0 0 24px;">
              <a href="${appUrl("/")}" style="font-family:${FONT};font-size:14px;font-weight:600;letter-spacing:0.18em;color:${c.fg};text-decoration:none;">oobee<span style="color:${c.brand};">&middot;</span>bets</a>
            </td>
          </tr>

          <!-- card -->
          <tr>
            <td bgcolor="${c.surface}" style="background-color:${c.surface};border:1px solid ${c.border};border-radius:14px;padding:36px 32px;">
              ${body}
            </td>
          </tr>

          <!-- footer -->
          <tr>
            <td style="padding:24px 8px 0;">
              <p style="margin:0 0 12px;font-family:${FONT};font-size:12px;line-height:1.6;color:${c.fgSubtle};">
                ${footerNote}
              </p>
              <p style="margin:0;font-family:${FONT};font-size:12px;line-height:1.6;color:${c.fgSubtle};">
                <strong style="color:${c.fgMuted};">18+ only.</strong> ${esc(SITE.name)} sells information and opinion, not wagers.
                We do not take bets, hold funds, or act as a bookmaker. Every pick is a judgement call that can lose.
                Never stake money you cannot afford to lose.
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

/* -------------------------------------------------------------- messages */

export interface Email {
  subject: string;
  html: string;
  text: string;
  /**
   * Optional: only the newsletter sets any. The welcome note is bulk mail and
   * needs List-Unsubscribe to reach Gmail and Yahoo inboxes at all; an invite
   * is transactional and must not carry one.
   */
  headers?: Record<string, string>;
}

/**
 * The human-facing page, linked from the footer of every message.
 *
 * The `token` in the URL is the Resend contact id. It used to be a random
 * secret we minted and stored ourselves; now that Resend holds the list there
 * is nowhere local to keep such a secret, and the contact id is the identifier
 * the opt-out actually needs. The query parameter keeps its old name because
 * that is what the page, the form and the endpoint all read.
 */
export function unsubscribeUrlFor(contactId: string): string {
  return appUrl(`/unsubscribe?token=${encodeURIComponent(contactId)}`);
}

/**
 * The machine-facing endpoint in the List-Unsubscribe header. Has to be a
 * route that accepts POST — the mail provider submits to it directly, with no
 * browser and no page to render.
 */
function oneClickUnsubscribeUrl(contactId: string): string {
  return appUrl(`/api/unsubscribe?token=${encodeURIComponent(contactId)}`);
}

/**
 * Sent once, immediately after someone subscribes.
 */
export function welcomeEmail(contactId: string): Email {
  const unsubscribeUrl = unsubscribeUrlFor(contactId);

  const body = `
    <p style="margin:0 0 14px;font-family:${FONT};font-size:11px;font-weight:500;letter-spacing:0.2em;text-transform:uppercase;color:${c.brand};">Pre-launch</p>

    ${heading("Welcome to the family.")}

    ${paragraph(
      `Thanks for subscribing to <strong style="color:${c.fg};font-weight:600;">oobee bets</strong>. You're on the list &mdash; and when the doors open, you'll be among the first to know.`,
    )}

    ${paragraph("Here's what lands in your inbox, and nothing else:")}

    ${list([
      "The official launch notification, the moment we go live.",
      "New things coming to the platform, before they ship.",
      "The occasional note on how we're building it. No daily blasts.",
    ])}

    ${divider()}

    ${paragraph(
      "We're building the opposite of a tipster feed. Every pick gets logged before kick-off and graded against the real final score &mdash; the losses stay on the page, right next to the wins.",
    )}

    <p style="margin:24px 0 0;font-family:${FONT};font-size:17px;line-height:1.5;font-weight:600;color:${c.brand};">Let's beat the books.</p>
  `;

  const text = [
    "PRE-LAUNCH",
    "",
    "Welcome to the family.",
    "",
    "Thanks for subscribing to oobee bets. You're on the list — and when the doors",
    "open, you'll be among the first to know.",
    "",
    "Here's what lands in your inbox, and nothing else:",
    "",
    "  • The official launch notification, the moment we go live.",
    "  • New things coming to the platform, before they ship.",
    "  • The occasional note on how we're building it. No daily blasts.",
    "",
    "We're building the opposite of a tipster feed. Every pick gets logged before",
    "kick-off and graded against the real final score — the losses stay on the",
    "page, right next to the wins.",
    "",
    "Let's beat the books.",
    "",
    "—",
    `You're receiving this because you subscribed at ${SITE.domain}.`,
    `Unsubscribe: ${unsubscribeUrl}`,
    "",
    "18+ only. oobee bets sells information and opinion, not wagers. We do not",
    "take bets, hold funds, or act as a bookmaker. Every pick is a judgement call",
    "that can lose. Never stake money you cannot afford to lose.",
  ].join("\n");

  return {
    subject: "You're on the list — welcome to oobee bets",
    html: shell({
      preheader: "The launch notification lands here first.",
      body,
      footerNote:
        `You're receiving this because you subscribed at ` +
        `<a href="${appUrl("/soon")}" style="color:${c.fgMuted};text-decoration:underline;">${esc(SITE.domain)}</a>. ` +
        `<a href="${unsubscribeUrl}" style="color:${c.fgMuted};text-decoration:underline;">Unsubscribe</a>.`,
    }),
    text,
    headers: {
      "List-Unsubscribe": `<${oneClickUnsubscribeUrl(contactId)}>`,
      // Tells Gmail/Yahoo the URI above is safe to POST to without a human,
      // which is what turns on the native unsubscribe button beside the
      // sender name. Both are required for bulk mail to those two.
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}

/* ------------------------------------------------------------- invitations */

/**
 * Sent when an admin invites someone, and again (with a fresh link) when they
 * resend it.
 *
 * No List-Unsubscribe header and no unsubscribe link in the footer: this is
 * transactional, sent to one person who was named by an admin, and offering to
 * unsubscribe them implies a list they are not on.
 */
export function inviteEmail({
  inviteUrl,
  expiresAt,
}: {
  inviteUrl: string;
  expiresAt: Date;
}): Email {
  const expiresLabel = formatDate(expiresAt);

  const body = `
    <p style="margin:0 0 14px;font-family:${FONT};font-size:11px;font-weight:600;letter-spacing:0.16em;text-transform:uppercase;color:${c.brand};">Closed beta</p>

    ${heading("You're invited to oobee bets")}

    ${paragraph(
      "Someone on the team invited you to the closed beta. Follow the link below to set a password and finish creating your account.",
    )}

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 0;">
      <tr>
        <td bgcolor="${c.brand}" style="background-color:${c.brand};border-radius:10px;">
          <a href="${inviteUrl}" style="display:inline-block;padding:13px 28px;font-family:${FONT};font-size:15px;font-weight:600;color:#000000;text-decoration:none;">Accept your invite</a>
        </td>
      </tr>
    </table>

    <p style="margin:28px 0 0;font-family:${FONT};font-size:13px;line-height:1.6;color:${c.fgSubtle};">
      This link expires <strong style="color:${c.fgMuted};">${esc(expiresLabel)}</strong>. If the button above doesn't work, paste this into your browser:
    </p>
    <p style="margin:8px 0 0;font-family:${FONT};font-size:13px;line-height:1.5;word-break:break-all;">
      <a href="${inviteUrl}" style="color:${c.brand};text-decoration:underline;">${esc(inviteUrl)}</a>
    </p>
  `;

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
    html: shell({
      preheader: `You've been invited to oobee bets — the link is inside, and it expires ${expiresLabel}.`,
      body,
      footerNote:
        "If you weren't expecting this, you can ignore it — the link only works once and nothing happens until it's used.",
    }),
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
 * A broadcast to testers — an admin writes the heading and the body, and this
 * puts them in the same envelope the invite uses so an announcement doesn't
 * arrive looking like it came from somewhere else.
 *
 * The body is escaped and split into paragraphs rather than passed through as
 * markup. That is not (only) about trusting the author: hand-written HTML in an
 * email body is where layouts break, and an admin writing plain text into a
 * textarea cannot accidentally produce an unclosed tag that swallows the
 * footer. Blank lines separate paragraphs, single newlines become <br>.
 */
export function announcementEmail({
  heading: subject,
  body,
}: {
  heading: string;
  body: string;
}): Email {
  const blocks = paragraphs(body);

  const bodyHtml = blocks
    .map((p) => paragraph(esc(p).replace(/\n/g, "<br>")))
    .join("\n    ");

  // The opening of the body, as the inbox preview. Whitespace is collapsed
  // first: this is one line in a list of subjects, and a paragraph that wraps
  // in the textarea would otherwise carry its newlines into it.
  const preheader = (blocks[0] ?? subject).replace(/\s+/g, " ").slice(0, 140);

  const html = shell({
    preheader,
    body: `
    <p style="margin:0 0 14px;font-family:${FONT};font-size:11px;font-weight:600;letter-spacing:0.16em;text-transform:uppercase;color:${c.brand};">Announcement</p>

    ${heading(esc(subject))}

    ${bodyHtml}
  `,
    footerNote: `You're receiving this because you have an account on ${esc(SITE.name)}.`,
  });

  const text = [
    "ANNOUNCEMENT",
    "",
    subject,
    "",
    blocks.join("\n\n"),
    "",
    `You're receiving this because you have an account on ${SITE.name}.`,
  ].join("\n");

  return { subject, html, text };
}
