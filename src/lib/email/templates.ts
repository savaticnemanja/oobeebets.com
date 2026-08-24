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

  const html = `<!doctype html>
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
    You've been invited to oobee bets — the link is inside, and it expires ${esc(expiresLabel)}.
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
              <p style="margin:0 0 14px;font-family:${FONT};font-size:11px;font-weight:600;letter-spacing:0.16em;text-transform:uppercase;color:${c.brand};">Closed beta</p>

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
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:20px 8px 0;">
              <p style="margin:0;font-family:${FONT};font-size:12px;line-height:1.6;color:${c.fgSubtle};">
                If you weren't expecting this, you can ignore it — the link only works once and nothing happens until it's used.
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
