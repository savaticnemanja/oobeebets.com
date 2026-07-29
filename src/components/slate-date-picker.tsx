"use client";

import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatSlateDate } from "@/lib/slate-date";

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
      <SelectTrigger className="h-8 w-40 text-xs" aria-label="Choose a date">
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
