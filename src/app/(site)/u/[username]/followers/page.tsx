import type { Metadata } from "next";
import { ConnectionsPage } from "@/components/social/connections-page";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Followers",
  robots: { index: false, follow: false },
};

export default async function FollowersPage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  return <ConnectionsPage username={username} direction="followers" />;
}
