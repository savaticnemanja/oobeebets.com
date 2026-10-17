import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Stats moved into your profile, as its Stats tab. Old links — and every
 * revalidatePath("/stats") that still names it — land there, view and
 * filter kept: /stats?tab=parlays&show=built → /u/you?tab=stats&view=parlays&show=built.
 */
export default async function StatsPage({ searchParams }: { searchParams: Promise<{ tab?: string; show?: string }> }) {
  const [auth, params] = await Promise.all([getAuth(), searchParams]);
  if (!auth) redirect("/login?next=/stats");
  const view = params.tab === "picks" || params.tab === "parlays" ? `&view=${params.tab}` : "";
  const show = params.show && /^[a-z]+$/.test(params.show) ? `&show=${params.show}` : "";
  redirect(`/u/${auth.user.username}?tab=stats${view}${show}`);
}
