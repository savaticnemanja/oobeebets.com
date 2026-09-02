import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Badge } from "@/components/ui/badge";
import { getAuth } from "@/lib/auth";
import { NAV_ADMIN } from "@/lib/site";
import { AdminNav } from "@/components/admin/admin-nav";
import { logoutAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

/**
 * robots.txt disallows /admin, but that only asks crawlers not to fetch it — a
 * URL linked from anywhere else can still be indexed on the strength of the
 * link alone. These pages inherited `index, follow` from the root, so say it
 * explicitly. The title also stops all five admin routes reporting themselves
 * as the marketing homepage.
 */
export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Admin" },
  robots: { index: false, follow: false, nocache: true },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const auth = await getAuth();

  // 404 rather than 403: a non-admin should not learn this route exists.
  if (!auth?.isAdmin) notFound();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-black/80 backdrop-blur-xl pt-safe-top pl-safe-left pr-safe-right">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Logo href="/admin" />
            <Badge variant="brand">{auth.user.role}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/picks">View site</Link>
            </Button>
            <form action={logoutAction}>
              <Button variant="ghost" size="sm" type="submit">
                Sign out
              </Button>
            </form>
          </div>
        </div>
        <AdminNav items={NAV_ADMIN} />
      </header>

      <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
        {children}
      </main>
    </div>
  );
}
