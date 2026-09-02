import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth-form";
import { getAuth } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to oobee bets.",
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const auth = await getAuth();
  if (auth) redirect("/picks");

  const { next } = await searchParams;

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
      <p className="mt-2 text-sm text-fg-muted">
        Sign in to see today&apos;s board.
      </p>
      <div className="mt-8">
        {/* Only relative paths are ever forwarded — an absolute `next` would
            turn this into an open redirect. */}
        <LoginForm next={next?.startsWith("/") ? next : undefined} />
      </div>
    </>
  );
}
