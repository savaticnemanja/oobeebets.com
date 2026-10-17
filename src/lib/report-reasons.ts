import type { ReportReason } from "@/db/schema";

/** Why something is being reported — the report dialog's choices and the admin queue's labels. */
export const REPORT_REASONS: Array<{ key: ReportReason; label: string; hint: string }> = [
  { key: "spam", label: "Spam", hint: "Ads, junk links, the same thing over and over" },
  { key: "harassment", label: "Harassment", hint: "Targeting, threatening or piling on someone" },
  { key: "hate", label: "Hate", hint: "Attacks on people for who they are" },
  { key: "scam", label: "Scam or paid picks", hint: "Selling picks, tipster scams, fake guarantees" },
  { key: "other", label: "Something else", hint: "Breaks the Terms another way" },
];

export const REPORT_REASON_LABEL = Object.fromEntries(REPORT_REASONS.map((r) => [r.key, r.label])) as Record<ReportReason, string>;
