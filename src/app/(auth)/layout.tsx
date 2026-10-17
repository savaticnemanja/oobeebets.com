import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { HelpLine } from "@/components/help-line";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="px-4 py-5 sm:px-6">
        <Logo />
      </header>
      <main id="main" className="flex flex-1 items-center justify-center px-4 py-8">
        {/* The beta application's pages mark themselves data-wide: long
            questions and two-up answer cards need more than a login form. */}
        <div className="w-full max-w-sm has-[[data-wide]]:max-w-lg">{children}</div>
      </main>
      <footer className="px-4 py-6 text-center sm:px-6">
        <p className="text-xs text-fg-subtle">
          21+ only. Picks are opinion, not guarantees. <HelpLine />{" "}
          <Link href="/legal/terms" className="underline hover:text-fg-muted">
            Terms
          </Link>
        </p>
      </footer>
    </div>
  );
}
