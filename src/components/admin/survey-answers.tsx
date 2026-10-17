import * as React from "react";
import { LocalTime } from "@/components/local-time";
import type { SignupSurveyRow } from "@/lib/waitlist";

const SOURCE_LABELS: Record<string, string> = {
  landing: "the landing page",
  signup: "/signup",
  invite: "their invite",
};

function withOther(xs: string[], other: string | null): string {
  return xs.map((x) => (x === "Other" && other ? `Other: ${other}` : x)).join(", ");
}

/** The beta application as an admin reads it — /admin/waitlist and /admin/users/[id]. */
export function SurveyAnswerList({ s }: { s: SignupSurveyRow }) {
  const yn = (b: boolean) => (b ? "Yes" : "No");
  const never = "— (never bets)";
  const rows: [string, React.ReactNode][] = [
    ["Name", s.fullName],
    ["21+", yn(s.is21)],
    ["Bets", s.betFrequency],
    ["Experience", s.experience],
    ["Sports", withOther(s.sports, s.sportsOther)],
    ["Sportsbooks", s.sportsbooks.length ? withOther(s.sportsbooks, s.sportsbookOther) : never],
    ["Typical bet", s.betSize ?? never],
    ["Decides with", s.decisionTools.length ? withOther(s.decisionTools, s.decisionToolsOther) : never],
    ["Wants", s.wants],
    ["Will give feedback", yn(s.willGiveFeedback)],
    ["End-of-beta survey", yn(s.willDoSurvey)],
    [
      "Answered",
      <>
        <LocalTime at={s.updatedAt} format="datetime" /> on {SOURCE_LABELS[s.source] ?? s.source}
      </>,
    ],
  ];
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
      {rows.map(([k, v]) => (
        <React.Fragment key={k}>
          <dt className="text-fg-subtle">{k}</dt>
          <dd className="whitespace-pre-wrap break-words text-fg">{v}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}
