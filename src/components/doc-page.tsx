import { getAuth } from "@/lib/auth";
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
  children,
}: {
  title: string;
  /** A line under the title — the legal pages' "draft" warning. */
  kicker?: React.ReactNode;
  children: React.ReactNode;
}) {
  const auth = await getAuth();
  return (
    <SocialShell className={auth ? undefined : "mx-auto"}>
      <header className="border-b border-border px-4 pb-3 pt-4">
        <h1 className="text-xl font-bold tracking-tight">{title}</h1>
        {kicker}
      </header>
      {children}
    </SocialShell>
  );
}

/** One section of a DocPage: a heading and its paragraphs, in Home's text size. */
export function DocSection({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-border px-4 py-4">
      {title && <h2 className="text-base font-bold tracking-tight text-fg">{title}</h2>}
      <div className="mt-1.5 space-y-3 text-[0.9375rem] leading-relaxed text-fg-muted first:mt-0">{children}</div>
    </section>
  );
}
