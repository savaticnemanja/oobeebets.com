import { requireSignedInLayout } from "@/lib/auth";

/** Signed in only — checked here so it is a real redirect, outside the loading boundary; see requireSignedInLayout. */
export default async function Layout({ children, params }: { children: React.ReactNode; params: Promise<{ username: string }> }) {
  const { username } = await params;
  await requireSignedInLayout(`/u/${encodeURIComponent(decodeURIComponent(username))}`);
  return children;
}
