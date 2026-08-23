import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Shield, Sparkles } from "lucide-react";
import { getAuth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Account",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const auth = await getAuth();
  if (!auth) redirect("/login?next=/account");

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Account</h1>
      <p className="mt-1.5 text-sm text-fg-muted">{auth.user.email}</p>

      {auth.isAdmin && (
        <div className="mt-4 flex items-center gap-2">
          <Badge variant="brand">
            <Shield className="size-3" aria-hidden="true" />
            {auth.user.role}
          </Badge>
          <Button variant="link" asChild>
            <Link href="/admin">Open admin panel</Link>
          </Button>
        </div>
      )}

      {/* --------------------------------------------------------- access */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Access</CardTitle>
          <CardDescription>Free during the beta — the top 15 picks, every day.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center">
            <Sparkles className="mx-auto size-8 text-brand" aria-hidden="true" />
            <p className="mt-3 text-sm text-fg-muted">
              You have full access to the top 15 picks — free during our beta. No plan
              needed.
            </p>
            <Button className="mt-4" asChild>
              <Link href="/picks">See today&apos;s picks</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* -------------------------------------------------------------- misc */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Security</CardTitle>
          <CardDescription>
            You&apos;re signed in on this device for 30 days. Signing out revokes the
            session on the server immediately.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
