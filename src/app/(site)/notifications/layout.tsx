import { requireSignedInLayout } from "@/lib/auth";

/** Signed in only — checked here so it is a real redirect, outside the loading boundary; see requireSignedInLayout. */
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireSignedInLayout("/notifications");
  return children;
}
