import type { Metadata } from "next";
import { LeaveWaitlistForm } from "@/components/leave-waitlist-form";

export const metadata: Metadata = {
  title: "Leave the waitlist",
  robots: { index: false, follow: false },
};

/**
 * Where a waitlist email's "leave" link lands. It asks before acting: opening
 * the page does nothing, so a mail scanner that follows every link can't take
 * anyone off.
 */
export default async function LeaveWaitlistPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Leave the waitlist?</h1>
      <p className="mt-2 text-sm text-fg-muted">
        We&apos;ll stop emailing you and forget you asked. You can always join again from the home page.
      </p>
      <div className="mt-8">
        <LeaveWaitlistForm token={token ?? ""} />
      </div>
    </>
  );
}
