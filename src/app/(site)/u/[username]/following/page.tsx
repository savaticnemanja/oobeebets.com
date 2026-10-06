import type { Metadata } from "next";
import { ConnectionsPage } from "@/components/social/connections-page";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Following",
  robots: { index: false, follow: false },
};

export default async function FollowingPage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  return <ConnectionsPage username={username} direction="following" />;
}
