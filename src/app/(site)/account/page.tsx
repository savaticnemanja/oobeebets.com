import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Shield } from "lucide-react";
import { getAuth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DocPage, DocSection } from "@/components/doc-page";
import { ProfileForm } from "@/components/social/profile-form";

export const metadata: Metadata = {
  title: "Edit profile",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Your profile and account settings — reached from "Edit profile" on your
 * profile, not from the navigation, as on X. Laid out like every other page:
 * the 600px column, and each part a full-width row.
 */
export default async function AccountPage() {
  const auth = await getAuth();
  if (!auth) redirect("/login?next=/account");

  return (
    <DocPage title="Edit profile" back={{ href: `/u/${auth.user.username}`, label: "Back to your profile" }}>
      <DocSection title="Public profile">
        <p>
          What other testers see on your profile and next to your posts. Your email and
          phone number are never shown.
        </p>
        <div className="pt-1 text-fg">
          <ProfileForm
            displayName={auth.user.displayName ?? ""}
            username={auth.user.username}
            bio={auth.user.bio ?? ""}
          />
        </div>
      </DocSection>

      <DocSection title="Account">
        <p>
          Signed in as <span className="text-fg">{auth.user.email}</span>.
        </p>
        {auth.isAdmin && (
          <div className="flex items-center gap-3">
            <Badge variant="brand">
              <Shield className="size-3" aria-hidden="true" />
              {auth.user.role}
            </Badge>
            <Link href="/admin" className="text-brand hover:underline">
              Open admin panel
            </Link>
          </div>
        )}
      </DocSection>

      <DocSection title="Access">
        <p>You have the whole board — all 15 picks, free during our beta. No plan needed.</p>
        <Button asChild className="rounded-full">
          <Link href="/picks">See today&apos;s picks</Link>
        </Button>
      </DocSection>

      <DocSection title="Security">
        <p>
          You&apos;re signed in on this device for 30 days. Signing out revokes the session
          on the server immediately.
        </p>
      </DocSection>
    </DocPage>
  );
}
