import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** American odds -> display string, always signed. */
export function formatOdds(price: number): string {
  return price > 0 ? `+${price}` : `${price}`;
}

/** Units -> display string, always signed, 2dp, e.g. "+1.35u" / "-1.00u". */
export function formatUnits(units: number): string {
  const sign = units > 0 ? "+" : units < 0 ? "" : "";
  return `${sign}${units.toFixed(2)}u`;
}

export function formatPct(value: number, digits = 0): string {
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatMoney(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}
