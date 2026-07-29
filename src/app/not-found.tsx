import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/logo";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="px-4 py-5 sm:px-6">
        <Logo />
      </header>
      <main
        id="main"
        className="flex flex-1 flex-col items-center justify-center px-6 text-center"
      >
        <p className="num text-6xl font-semibold tracking-tight text-brand">404</p>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">
          Nothing here
        </h1>
        <p className="mt-2 max-w-sm text-sm text-fg-muted">
          That page doesn&apos;t exist, or you don&apos;t have access to it.
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Button asChild>
            <Link href="/">Home</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/track-record">Track record</Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
