import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { DocPage, DocSection } from "@/components/doc-page";
import { ProfileForm } from "@/components/social/profile-form";
import { AvatarPicker } from "@/components/social/avatar-picker";
import { displayNameOf } from "@/components/social/identity";

export const metadata: Metadata = {
  title: "Edit profile",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Your public profile — picture, name, handle, bio — reached from "Edit
 * profile" on your profile, as on X. Everything else about the account
 * (sign-in, plan, password, deleting it) is in Settings (/settings). Laid out
 * like every other page: the 600px column, and each part a full-width row.
 */
export default async function AccountPage() {
  const auth = await getAuth();
  if (!auth) redirect("/login?next=/account");

  return (
    <DocPage title="Edit profile" back={{ href: `/u/${auth.user.username}`, label: "Back to your profile" }}>
      <DocSection title="Public profile">
        <p>
          What other users see on your profile and next to your posts. Your email and
          phone number are never shown.
        </p>
        <div className="pt-1 text-fg">
          <AvatarPicker name={displayNameOf(auth.user)} avatarId={auth.user.avatarId} />
        </div>
        <div className="pt-1 text-fg">
          <ProfileForm
            displayName={auth.user.displayName ?? ""}
            username={auth.user.username}
            bio={auth.user.bio ?? ""}
          />
        </div>
      </DocSection>

      <DocSection>
        <p className="text-sm">
          Your sign-in, subscription, password and deleting your account are in{" "}
          <Link href="/settings" className="text-brand hover:underline">
            Settings
          </Link>
          .
        </p>
      </DocSection>
    </DocPage>
  );
}
