import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ForgotPasswordForm } from "@/components/password-reset-forms";
import { getAuth } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Reset your password",
  robots: { index: false, follow: false },
};

export default async function ForgotPasswordPage() {
  if (await getAuth()) redirect("/home");
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Forgot your password?</h1>
      <p className="mt-2 text-sm text-fg-muted">
        Enter the email you signed up with and we&apos;ll send you a link to choose a new one.
      </p>
      <div className="mt-8">
        <ForgotPasswordForm />
      </div>
    </>
  );
}
