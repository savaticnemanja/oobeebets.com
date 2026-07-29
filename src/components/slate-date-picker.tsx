"use client";

import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatSlateDate } from "@/lib/i18n/format";

export function SlateDatePicker({
  dates,
  current,
}: {
  dates: string[];
  current: string;
}) {
  const router = useRouter();

  return (
    <Select
      value={dates.includes(current) ? current : undefined}
      onValueChange={(v) => router.push(`/picks?date=${v}`)}
    >
      {/* Deliberately compact, and a Radix trigger is a button, so it is not
          one of the controls iOS zooms for — opt back out of touch:text-base
          or 16px text would not fit the 2rem height. */}
      <SelectTrigger className="h-8 w-40 text-xs touch:text-xs" aria-label="Choose a date">
        <SelectValue placeholder={formatSlateDate(current)} />
      </SelectTrigger>
      <SelectContent>
        {dates.map((d) => (
          <SelectItem key={d} value={d} className="text-xs">
            {formatSlateDate(d)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
