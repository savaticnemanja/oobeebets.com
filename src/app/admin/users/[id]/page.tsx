import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ArrowUpRight, History, Layers, MonitorSmartphone } from "lucide-react";
import { requireAdminPage } from "@/lib/auth";
import { deviceLabel, getUserDetail } from "@/lib/admin/users";
import { getActivity } from "@/lib/admin/activity";
import { getPlayerFollows } from "@/lib/stats";
import { getSignupSurvey } from "@/lib/waitlist";
import { SurveyAnswerList } from "@/components/admin/survey-answers";
import { getPlayedParlays, getUserParlays } from "@/lib/parlay-store";
import { SPEND_BAND_LABELS, FEEDBACK_KIND_LABELS } from "@/lib/validation";
import { FOLLOW_STAKE_UNITS } from "@/lib/follows";
import { formatUnits } from "@/lib/i18n/format";
import { ActivityList } from "@/components/admin/activity-list";
import { Empty, Kpi, KpiGrid, Panel, PanelLink, TabNav, since } from "@/components/admin/kit";
import { ParlayTable } from "@/components/admin/parlay-table";
import { PlayerBets } from "@/components/admin/player-bets";
import { RoleControl } from "@/components/admin/role-control";
import { SuspendControl } from "@/components/admin/suspend-control";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { Avatar } from "@/components/social/identity";
import { LocalTime } from "@/components/local-time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "User" };

export const dynamic = "force-dynamic";

const TABS = ["summary", "bets", "parlays", "activity"] as const;
type Tab = (typeof TABS)[number];

export default async function AdminUserPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const [auth, { id }, sp] = await Promise.all([requireAdminPage(), params, searchParams]);
  // A hand-typed id should 404 like any other missing account, not reach
  // Postgres as a malformed uuid and throw.
  if (!z.string().uuid().safeParse(id).success) notFound();
  const tab: Tab = TABS.includes(sp.tab as Tab) ? (sp.tab as Tab) : "summary";

  const [detail, bets] = await Promise.all([getUserDetail(id), getPlayerFollows(id)]);
  if (!detail || !bets) notFound();
  const { user, counts } = detail;
  const [survey, suspendedBy] = await Promise.all([
    getSignupSurvey(user.email),
    user.suspendedBy
      ? db.select({ username: users.username }).from(users).where(eq(users.id, user.suspendedBy)).limit(1).then(([r]) => r?.username ?? null)
      : Promise.resolve(null),
  ]);
  const name = user.displayName?.trim() || user.username;
  const lastActive = [user.lastLoginAt, detail.sessions[0]?.lastSeenAt]
    .filter((d): d is Date => Boolean(d))
    .sort((a, b) => b.getTime() - a.getTime())[0];

  const base = `/admin/users/${id}`;
  const tabs = [
    { href: base, label: "Summary", active: tab === "summary" },
    { href: `${base}?tab=bets`, label: "Bets", count: counts.takes, active: tab === "bets" },
    { href: `${base}?tab=parlays`, label: "Parlays", count: counts.parlays + counts.plays, active: tab === "parlays" },
    { href: `${base}?tab=activity`, label: "Activity", active: tab === "activity" },
  ];

  return (
    <div>
      <Link
        href="/admin/users"
        className="mb-4 inline-flex items-center gap-1.5 text-xs text-fg-muted transition-colors hover:text-fg"
      >
        ← All users
      </Link>

      {/* ---------------------------------------------------------- identity */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar name={name} avatarId={user.avatarId} size="lg" className="size-16 text-2xl" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl font-semibold tracking-tight">{name}</h1>
              {user.role === "admin" && <Badge variant="brand">admin</Badge>}
              {user.suspendedAt && <Badge variant="miss">suspended</Badge>}
              {detail.plan && <Badge>{detail.plan}</Badge>}
            </div>
            <p className="mt-0.5 truncate text-sm text-fg-muted">
              @{user.username} · {user.email}
            </p>
            <p className="mt-0.5 text-xs text-fg-subtle">
              Joined <LocalTime at={user.createdAt} format="date" /> ·{" "}
              {lastActive ? `last active ${since(lastActive)}` : "never signed in"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/u/${user.username}`}>
              Profile
              <ArrowUpRight aria-hidden="true" />
            </Link>
          </Button>
          {user.id === auth.user.id ? (
            <Badge variant="outline">{user.role} · you</Badge>
          ) : (
            <>
              <SuspendControl userId={user.id} username={user.username} suspended={Boolean(user.suspendedAt)} />
              <RoleControl userId={user.id} email={user.email} role={user.role} />
            </>
          )}
        </div>
      </div>

      {user.suspendedAt && (
        <p role="status" className="mb-6 rounded-lg border border-miss/30 bg-miss-dim px-4 py-3 text-sm text-fg">
          <span className="font-medium text-miss">Suspended</span> <LocalTime at={user.suspendedAt} format="datetime" />
          {suspendedBy ? ` by @${suspendedBy}` : ""}
          {user.suspendedReason ? <> — {user.suspendedReason}</> : null}. They can&apos;t sign in, and nothing they posted
          shows anywhere until it&apos;s lifted.
        </p>
      )}

      <TabNav label="Account sections" tabs={tabs} />

      {tab === "summary" && (
        <>
          <KpiGrid>
            <Kpi
              label="Bets taken"
              value={counts.takes + counts.plays}
              sub={`${counts.takes} picks · ${counts.plays} parlays played`}
              href={`${base}?tab=bets`}
            />
            <Kpi
              label="Their record"
              value={bets.record.settled === 0 ? "—" : `${bets.record.wins}–${bets.record.losses}`}
              tone={bets.record.settled === 0 ? "neutral" : bets.record.netUnits >= 0 ? "hit" : "miss"}
              sub={
                bets.record.settled === 0
                  ? "nothing settled yet"
                  : `${formatUnits(bets.record.netUnits)} at ${Number(FOLLOW_STAKE_UNITS).toFixed(0)}u a pick`
              }
              href={`${base}?tab=bets`}
            />
            <Kpi
              label="Posts"
              value={counts.posts + counts.replies}
              sub={`${counts.posts} posts · ${counts.replies} replies · ${counts.likes} likes given`}
            />
            <Kpi label="Followers" value={counts.followers} sub={`following ${counts.following}`} />
          </KpiGrid>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="grid content-start gap-4">
            <Panel id="account" title="Account">
              <dl className="divide-y divide-border/60 text-sm">
                <Fact label="Came in">
                  {detail.invitedBy
                    ? detail.invitedBy.selfServe
                      ? "Signed up themselves"
                      : `Invited by ${detail.invitedBy.email ?? "a deleted admin"}`
                    : "Before invites were recorded"}
                </Fact>
                <Fact label="Last signed in">
                  {user.lastLoginAt ? <LocalTime at={user.lastLoginAt} format="datetime" /> : "Never"}
                </Fact>
                <Fact label="21+ and Terms">
                  {user.termsAcceptedAt ? <LocalTime at={user.termsAcceptedAt} format="date" /> : "Not recorded"}
                </Fact>
                {/* Asked at sign-up until 17 Oct; the application below replaced it. */}
                {user.monthlySpendBand && (
                  <Fact label="Monthly spend">{SPEND_BAND_LABELS[user.monthlySpendBand]}</Fact>
                )}
                <Fact label="Phone">{user.phone ?? "Not given"}</Fact>
                <Fact label="Plan">{detail.plan ?? "Free"}</Fact>
                <Fact label="Parlays built">
                  {counts.parlays}
                  {counts.shared > 0 && ` · ${counts.shared} shared to Community`}
                </Fact>
              </dl>
            </Panel>

            <Panel id="application" title="Beta application" description="Their answers when they signed up">
              {survey ? (
                <div className="text-sm">
                  <SurveyAnswerList s={survey} />
                </div>
              ) : (
                <p className="text-sm text-fg-muted">Not answered — they joined before the application existed.</p>
              )}
            </Panel>
            </div>

            <div className="grid content-start gap-4">
              <Panel id="sessions" title="Signed in on" description="Devices with a live session">
                {detail.sessions.length === 0 ? (
                  <p className="text-sm text-fg-muted">No live sessions.</p>
                ) : (
                  <ul className="space-y-2.5">
                    {detail.sessions.map((s) => (
                      <li key={s.id} className="flex items-center gap-3 text-sm">
                        <MonitorSmartphone className="size-4 shrink-0 text-fg-subtle" aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate text-fg" title={s.userAgent ?? undefined}>
                          {deviceLabel(s.userAgent)}
                        </span>
                        <span className="shrink-0 text-xs text-fg-subtle">seen {since(s.lastSeenAt)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>

              <Panel id="moderation" title="Reports and feedback">
                <dl className="divide-y divide-border/60 text-sm">
                  <Fact label="Reported by others">
                    {detail.reportsAgainst.total === 0 ? (
                      "Never"
                    ) : (
                      <Link href="/admin/reports" className="hover:text-brand">
                        {detail.reportsAgainst.total} time{detail.reportsAgainst.total === 1 ? "" : "s"}
                        {detail.reportsAgainst.open > 0 && ` · ${detail.reportsAgainst.open} open`}
                      </Link>
                    )}
                  </Fact>
                  <Fact label="Reports they filed">{detail.reportsFiled}</Fact>
                </dl>
                {detail.feedback.length > 0 && (
                  <ul className="mt-3 space-y-2">
                    {detail.feedback.map((f) => (
                      <li key={f.id} className="rounded-lg bg-surface-2 px-3 py-2">
                        <p className="flex items-center gap-2 text-xs text-fg-subtle">
                          <Badge variant={f.kind === "bug" ? "miss" : f.kind === "idea" ? "brand" : "default"}>
                            {FEEDBACK_KIND_LABELS[f.kind as keyof typeof FEEDBACK_KIND_LABELS]}
                          </Badge>
                          <LocalTime at={f.createdAt} format="ago" />
                          {f.resolvedAt ? " · resolved" : ""}
                        </p>
                        <p className="mt-1 line-clamp-2 text-sm text-fg">{f.body}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
          </div>

          <RecentFor id={id} base={base} />
        </>
      )}

      {tab === "bets" && <PlayerBets player={bets} />}

      {tab === "parlays" && <Parlays id={id} />}

      {tab === "activity" && <ActivityFor id={id} />}
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 first:pt-0 last:pb-0">
      <dt className="text-fg-muted">{label}</dt>
      <dd className="text-right text-fg">{children}</dd>
    </div>
  );
}

async function RecentFor({ id, base }: { id: string; base: string }) {
  const { items } = await getActivity({ subject: id, limit: 5 });
  if (items.length === 0) return null;
  return (
    <Panel id="recent" title="Recent activity" className="mt-4" action={<PanelLink href={`${base}?tab=activity`}>View all</PanelLink>}>
      <ActivityList items={items} />
    </Panel>
  );
}

async function ActivityFor({ id }: { id: string }) {
  const { items } = await getActivity({ subject: id, limit: 100 });
  return items.length === 0 ? (
    <Empty icon={History} title="Nothing logged">
      Joining, password changes, and anything they did as an admin shows up here.
    </Empty>
  ) : (
    <ActivityList items={items} grouped />
  );
}

async function Parlays({ id }: { id: string }) {
  const [built, played] = await Promise.all([getUserParlays(id), getPlayedParlays(id)]);
  if (built.length === 0 && played.length === 0) {
    return (
      <Empty icon={Layers} title="No parlays">
        They haven&apos;t built or played one yet.
      </Empty>
    );
  }
  return (
    <div className="space-y-8">
      <section aria-labelledby="built-heading">
        <h2 id="built-heading" className="mb-3 text-sm font-semibold tracking-tight">
          Built <span className="num font-normal text-fg-subtle">{built.length}</span>
        </h2>
        {built.length === 0 ? <p className="text-sm text-fg-muted">None built.</p> : <ParlayTable parlays={built} />}
      </section>
      <section aria-labelledby="played-heading">
        <h2 id="played-heading" className="mb-3 text-sm font-semibold tracking-tight">
          Played <span className="num font-normal text-fg-subtle">{played.length}</span>
        </h2>
        {played.length === 0 ? <p className="text-sm text-fg-muted">None played.</p> : <ParlayTable parlays={played} />}
      </section>
    </div>
  );
}
