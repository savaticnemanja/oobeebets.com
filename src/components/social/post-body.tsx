import Link from "next/link";
import { tokenizeBody } from "@/lib/social-rules";
import { cn } from "@/lib/utils";

/**
 * A post's text with its links and @mentions made live. Text is rendered as
 * React text nodes, never HTML, so nothing a user types can become markup.
 * Newlines are kept with whitespace-pre-wrap rather than turned into <br>s.
 */
export function PostBody({ body, className }: { body: string; className?: string }) {
  return (
    <p className={cn("whitespace-pre-wrap break-words text-fg", className)}>
      {tokenizeBody(body).map((token, i) => {
        if (token.kind === "url") {
          return (
            <a
              key={i}
              href={token.href}
              target="_blank"
              rel="noopener noreferrer nofollow ugc"
              className="relative z-10 text-brand hover:underline"
            >
              {token.text}
            </a>
          );
        }
        if (token.kind === "mention") {
          return (
            <Link
              key={i}
              href={`/u/${token.username}`}
              className="relative z-10 text-brand hover:underline"
            >
              {token.text}
            </Link>
          );
        }
        return <span key={i}>{token.text}</span>;
      })}
    </p>
  );
}
