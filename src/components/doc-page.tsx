import { getAuth } from "@/lib/auth";
import { BackButton } from "@/components/nav-memory";
import { SocialShell } from "@/components/social/social-shell";

/**
 * About and the legal pages, laid out like Home and the board: the 600px
 * column with hairlines either side, a bold title row, and each section a
 * full-width row with a hairline under it. Signed in, the column sits beside
 * the sidebar where Home's does; signed out, in the marketing layout, it is
 * centred.
 */
export async function DocPage({
  title,
  kicker,
  back,
  children,
}: {
  title: string;
  /** A back arrow before the title, to here — as X's settings pages have. */
  back?: { href: string; label: string };
  /** A line under the title — the legal pages' "draft" warning. */
  kicker?: React.ReactNode;
  children: React.ReactNode;
}) {
  const auth = await getAuth();
  return (
    <SocialShell className={auth ? undefined : "mx-auto sm:max-w-[37.5rem]"}>
      <header className="border-b border-border px-4 pb-3 pt-4">
        <div className="flex items-center gap-3">
          {back && (
            <BackButton
              fallback={back.href}
              label={back.label}
              className="-ml-2 grid size-9 shrink-0 place-items-center rounded-full transition-colors hover:bg-surface-2"
            />
          )}
          <h1 className="text-xl font-bold tracking-tight">{title}</h1>
        </div>
        {kicker}
      </header>
      {children}
    </SocialShell>
  );
}

/** One section of a DocPage: a heading and its paragraphs, in Home's text size. */
export function DocSection({ id, title, children }: { id?: string; title?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 border-b border-border px-4 py-4">
      {title && <h2 className="text-base font-bold tracking-tight text-fg">{title}</h2>}
      <div className="mt-1.5 space-y-3 text-[0.9375rem] leading-relaxed text-fg-muted first:mt-0">{children}</div>
    </section>
  );
}
