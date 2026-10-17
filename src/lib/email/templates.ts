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

/**
 * The "forgot password" link. Same envelope as the invite. Says plainly that
 * ignoring it changes nothing, since most of these that arrive unasked are
 * someone typing the wrong address, not an attack.
 */
export function passwordResetEmail({ resetUrl, minutes }: { resetUrl: string; minutes: number }): Email {
  const html = shell({
    preheader: `Reset your oobee bets password — the link works for ${minutes} minutes.`,
    footerNote:
      "If you didn't ask for this, you can ignore it — your password stays as it is, and the link stops working on its own.",
    cardHtml: `              <h1 style="margin:0 0 16px;font-family:${FONT};font-size:24px;line-height:1.2;font-weight:600;letter-spacing:-0.01em;color:${c.fg};">Reset your password</h1>

              <p style="margin:0 0 28px;font-family:${FONT};font-size:15px;line-height:1.6;color:${c.fgMuted};">
                Someone — hopefully you — asked to reset the password for your oobee bets account. Follow the link below to choose a new one. You'll be signed out everywhere else.
              </p>

              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td bgcolor="${c.brandBg}" style="background-color:${c.brandBg};border-radius:10px;">
                    <a href="${resetUrl}" style="display:inline-block;padding:13px 28px;font-family:${FONT};font-size:15px;font-weight:600;color:#000000;text-decoration:none;">Choose a new password</a>
                  </td>
                </tr>
              </table>

              <p style="margin:28px 0 0;font-family:${FONT};font-size:13px;line-height:1.6;color:${c.fgSubtle};">
                This link works once, for <strong style="color:${c.fgMuted};">${minutes} minutes</strong>. If the button above doesn't work, paste this into your browser:
              </p>
              <p style="margin:8px 0 0;font-family:${FONT};font-size:13px;line-height:1.5;word-break:break-all;">
                <a href="${resetUrl}" style="color:${c.brand};text-decoration:underline;">${esc(resetUrl)}</a>
              </p>`,
  });

  const text = [
    "Reset your password",
    "",
    "Someone — hopefully you — asked to reset the password for your oobee bets",
    "account. Follow the link below to choose a new one. You'll be signed out",
    "everywhere else.",
    "",
    resetUrl,
    "",
    `This link works once, for ${minutes} minutes.`,
    "",
    "If you didn't ask for this, you can ignore it — your password stays as it",
    "is, and the link stops working on its own.",
  ].join("\n");

  return { subject: "Reset your oobee bets password", html, text };
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

/* ------------------------------------------------- account and waitlist mail */

/** A paragraph: plain text, or text ending in one link ("…: <label>."). */
type Para = string | { text: string; link: { label: string; url: string } };

/**
 * The card most of the mail below shares: an optional kicker, a heading, a
 * few paragraphs, one button and the raw link under it. Each template only
 * decides the words. Paragraphs are plain text and escaped here.
 */
function actionEmail({
  subject,
  preheader,
  kicker,
  heading,
  paragraphs: body,
  cta,
  linkNote,
  footerNote,
}: {
  subject: string;
  preheader: string;
  kicker?: string;
  heading: string;
  paragraphs: Para[];
  cta?: { label: string; url: string };
  /** The line above the pasted-in link, e.g. "This link works for 48 hours." */
  linkNote?: string;
  footerNote: string;
}): Email {
  const p = (para: Para, last: boolean) => {
    const inner =
      typeof para === "string"
        ? esc(para)
        : `${esc(para.text)} <a href="${para.link.url}" style="color:${c.brand};text-decoration:underline;">${esc(para.link.label)}</a>.`;
    return `              <p style="margin:0 0 ${last ? "0" : "16px"};font-family:${FONT};font-size:15px;line-height:1.6;color:${c.fgMuted};">${inner}</p>`;
  };
  const plain = (para: Para) => (typeof para === "string" ? para : `${para.text} ${para.link.url}`);

  const html = shell({
    preheader,
    footerNote: esc(footerNote),
    cardHtml: [
      kicker &&
        `              <p style="margin:0 0 14px;font-family:${FONT};font-size:11px;font-weight:600;letter-spacing:0.16em;text-transform:uppercase;color:${c.brand};">${esc(kicker)}</p>`,
      `              <h1 style="margin:0 0 16px;font-family:${FONT};font-size:24px;line-height:1.2;font-weight:600;letter-spacing:-0.01em;color:${c.fg};">${esc(heading)}</h1>`,
      ...body.map((text, i) => p(text, i === body.length - 1 && !cta)),
      cta &&
        `              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:12px;">
                <tr>
                  <td bgcolor="${c.brandBg}" style="background-color:${c.brandBg};border-radius:10px;">
                    <a href="${cta.url}" style="display:inline-block;padding:13px 28px;font-family:${FONT};font-size:15px;font-weight:600;color:#000000;text-decoration:none;">${esc(cta.label)}</a>
                  </td>
                </tr>
              </table>

              <p style="margin:28px 0 0;font-family:${FONT};font-size:13px;line-height:1.6;color:${c.fgSubtle};">
                ${linkNote ? `${esc(linkNote)} ` : ""}If the button above doesn't work, paste this into your browser:
              </p>
              <p style="margin:8px 0 0;font-family:${FONT};font-size:13px;line-height:1.5;word-break:break-all;">
                <a href="${cta.url}" style="color:${c.brand};text-decoration:underline;">${esc(cta.url)}</a>
              </p>`,
    ]
      .filter(Boolean)
      .join("\n\n"),
  });

  const text = [
    ...(kicker ? [kicker.toUpperCase(), ""] : []),
    heading,
    "",
    body.map(plain).join("\n\n"),
    ...(cta ? ["", `${cta.label}: ${cta.url}`] : []),
    ...(linkNote ? ["", linkNote] : []),
    "",
    footerNote,
  ].join("\n");

  return { subject, html, text };
}

/** "You're on the list" — the one mail a waitlist sign-up gets until we open. */
/**
 * The one email a new waitlist address gets: confirm, or hear nothing more.
 * Sent for both the homepage box and the /signup application; `answered` says
 * which, so the homepage's quick sign-ups are pointed at the application.
 */
export function waitlistConfirmEmail({
  confirmUrl,
  leaveUrl,
  answered,
}: {
  confirmUrl: string;
  leaveUrl: string;
  answered: boolean;
}): Email {
  return actionEmail({
    subject: "Confirm your place on the oobee bets waitlist",
    preheader: "One click and you're on the list. Nothing happens until you do.",
    kicker: "Waitlist",
    heading: "Confirm your place",
    paragraphs: [
      "Someone — hopefully you — asked to join the oobee bets waitlist with this address. Press the button below to confirm, and we'll email you once, the day there's a place for you.",
      answered
        ? "We have your answers to the sign-up questions, so there's nothing else to do."
        : "Once you've confirmed, you can answer a few quick questions about how you bet — testers who do are let in first.",
      { text: "Changed your mind?", link: { label: "Leave the waitlist", url: leaveUrl } },
    ],
    cta: { label: "Confirm my place", url: confirmUrl },
    linkNote: "This link works for 7 days.",
    footerNote: `If you didn't ask for this, ignore it — you won't hear from ${SITE.name} again, and the address is deleted in 7 days.`,
  });
}

/** Sent to the waitlist when SIGNUP_ENABLED goes on and an admin tells them. */
export function signupsOpenEmail({ signupUrl, leaveUrl }: { signupUrl: string; leaveUrl: string }): Email {
  return actionEmail({
    subject: "Sign-ups are open on oobee bets",
    preheader: "You asked us to tell you — your place is ready.",
    kicker: "Waitlist",
    heading: "Your place is ready",
    paragraphs: [
      "You asked us to tell you when oobee bets opened up. It has: you can create your account now.",
      "Enter this address on the sign-up page and we'll send a link to finish setting up — it takes about a minute.",
      { text: "Not interested any more?", link: { label: "Leave the waitlist", url: leaveUrl } },
    ],
    cta: { label: "Create your account", url: signupUrl },
    footerNote: "This is the one email the waitlist promised.",
  });
}

/** The self-serve "invite": the link that leads to the account form. */
export function signupLinkEmail({ signupUrl, hours }: { signupUrl: string; hours: number }): Email {
  return actionEmail({
    subject: "Finish creating your oobee bets account",
    preheader: `Your sign-up link — it works for ${hours} hours.`,
    heading: "Finish creating your account",
    paragraphs: [
      "Thanks for signing up. Follow the link below to choose a password and set up your profile. It also confirms this address is yours, which is where receipts and password resets will go.",
    ],
    cta: { label: "Create my account", url: signupUrl },
    linkNote: `This link works once, for ${hours} hours.`,
    footerNote: "If you didn't sign up, ignore this — no account is made unless the link is used.",
  });
}

/**
 * Someone signed up (or joined the waitlist) with an address that already has
 * an account. The form says the same either way, so this mail is the only
 * place the difference shows — in the owner's own inbox.
 */
export function accountExistsEmail({ loginUrl, resetUrl }: { loginUrl: string; resetUrl: string }): Email {
  return actionEmail({
    subject: "You already have an oobee bets account",
    preheader: "Someone tried to sign up with this address — it already has an account.",
    heading: "You already have an account",
    paragraphs: [
      "Someone — probably you — just tried to sign up with this address, but it already has an oobee bets account. There's no need to make another: sign in instead.",
      { text: "Forgotten your password?", link: { label: "Choose a new one", url: resetUrl } },
    ],
    cta: { label: "Sign in", url: loginUrl },
    footerNote: "If this wasn't you, you can ignore it. Nothing about your account has changed.",
  });
}

/** After the account form is done, invite or sign-up alike. */
export function welcomeEmail({ name, homeUrl, accountUrl }: { name: string; homeUrl: string; accountUrl: string }): Email {
  return actionEmail({
    subject: "Welcome to oobee bets",
    preheader: "Your account is ready — here's what's on the board.",
    heading: `Welcome, ${name}`,
    paragraphs: [
      "Your account is ready. Every game day we put out our game bets and player props, each with its price, its stake and the reasoning behind it — logged before kick-off and graded against the final score after.",
      "Mark the ones you take and your profile keeps your own record alongside ours.",
      { text: "Add a profile picture and a bio from", link: { label: "your account page", url: accountUrl } },
      "Please bet responsibly. If gambling stops being fun, call or text 1-800-GAMBLER.",
    ],
    cta: { label: "See the board", url: homeUrl },
    footerNote: `You're getting this because you just created an account on ${SITE.name}.`,
  });
}

/**
 * Security notice after a password change or reset. Sent to the address on
 * the account, so whoever really owns it hears about a change they didn't make.
 */
export function accountDeletedEmail(): Email {
  return actionEmail({
    subject: "Your oobee bets account was deleted",
    preheader: "Your account and everything on it are gone.",
    heading: "Your account was deleted",
    paragraphs: [
      "Your oobee bets account was deleted just now, as you asked: your profile, posts, replies, likes, follows, parlays, the picks you marked and your sign-up answers. You've been signed out everywhere.",
      "Copies in our nightly backups age out within 7 days. If you didn't do this, reply to this email straight away.",
    ],
    footerNote: "This is the last email we'll send to this address unless you sign up again.",
  });
}

export function passwordChangedEmail({ at, resetUrl }: { at: Date; resetUrl: string }): Email {
  const when = `${formatDate(at)} at ${at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York", timeZoneName: "short" })}`;
  return actionEmail({
    subject: "Your oobee bets password was changed",
    preheader: `Your password was changed ${when}.`,
    heading: "Your password was changed",
    paragraphs: [
      `The password on your oobee bets account was changed ${when}, and every other device was signed out.`,
      "If that was you, there's nothing to do. If it wasn't, reset it now — the link below signs everyone out again, including whoever changed it.",
    ],
    cta: { label: "Reset my password", url: resetUrl },
    footerNote: "We send this after every password change, so you always know about one.",
  });
}
