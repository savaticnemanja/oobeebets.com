import { redirect } from "next/navigation";

/** Leave links in waitlist emails sent before the unsubscribe flows were merged into /unsubscribe. */
export default async function LeaveWaitlistPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  redirect(`/unsubscribe${token ? `?token=${encodeURIComponent(token)}` : ""}`);
}
