"use client";

import Link from "next/link";
import { Check, ChevronDown } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * The season, as a compact "2025–26 ▾" pill that opens the list of seasons
 * we hold. Every option is a link the server built, so the page stays the
 * source of truth for what the URL means.
 */
export function SeasonPicker({
  current,
  options,
}: {
  current: string;
  options: Array<{ label: string; href: string; active: boolean }>;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Season: ${current}`}
        className="num inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-border px-3 text-sm font-medium text-fg transition-colors hover:border-border-strong data-[state=open]:border-brand/60"
      >
        {current}
        <ChevronDown className="size-3.5 text-fg-subtle" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-80 min-w-36 overflow-y-auto">
        {options.map((o) => (
          <DropdownMenuItem key={o.href} asChild>
            <Link href={o.href} aria-current={o.active ? "true" : undefined} className={cn("num", o.active && "text-brand")}>
              <Check className={cn(!o.active && "invisible")} aria-hidden="true" />
              {o.label}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
