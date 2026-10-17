import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { AdminShell } from "@/components/admin/shell";
import { getBadgeCounts } from "@/lib/admin/overview";

export const dynamic = "force-dynamic";

/**
 * robots.txt disallows /admin, but that only asks crawlers not to fetch it — a
 * URL linked from anywhere else can still be indexed on the strength of the
 * link alone. These pages inherited `index, follow` from the root, so say it
 * explicitly. The title also stops every admin route reporting itself as the
 * marketing homepage.
 */
export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Admin" },
  robots: { index: false, follow: false, nocache: true },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const auth = await getAuth();

  // 404 rather than 403: a non-admin should not learn this route exists.
  if (!auth?.isAdmin) notFound();

  const badges = await getBadgeCounts();
  const { user } = auth;

  return (
    <AdminShell
      viewer={{ name: user.displayName?.trim() || user.username, email: user.email, avatarId: user.avatarId }}
      badges={badges}
    >
      {children}
    </AdminShell>
  );
}
