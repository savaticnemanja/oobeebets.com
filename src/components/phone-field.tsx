"use client";

import * as React from "react";
import {
  AsYouType,
  getCountries,
  getCountryCallingCode,
  getExampleNumber,
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js";
import examples from "libphonenumber-js/examples.mobile.json";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Regional-indicator pair — 🇷🇸 from "RS". */
function flagFor(country: string): string {
  return String.fromCodePoint(
    ...[...country].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65),
  );
}

// Pinned to "en" rather than the runtime locale: the list is built once at
// module scope on both server and client, and a locale-dependent name would
// render differently in each and break hydration.
const REGION_NAMES = new Intl.DisplayNames(["en"], { type: "region" });

function nameFor(country: string): string {
  try {
    return REGION_NAMES.of(country) ?? country;
  } catch {
    return country;
  }
}

export const COUNTRIES = getCountries()
  .map((code) => ({
    code,
    name: nameFor(code),
    dial: `+${getCountryCallingCode(code)}`,
    flag: flagFor(code),
  }))
  .sort((a, b) => a.name.localeCompare(b.name, "en"));

const COUNTRY_BY_CODE = new Map(COUNTRIES.map((c) => [c.code as string, c]));

/** A real number from that country, formatted the way a local would write it. */
function placeholderFor(country: CountryCode): string {
  try {
    return getExampleNumber(country, examples)?.formatNational() ?? "";
  } catch {
    return "";
  }
}

/**
 * What the field should show after a keystroke.
 *
 * Formatting only runs when the caret is at the end — re-running it on a
 * mid-string edit would shove the caret to the end after every keystroke —
 * and never while deleting, where re-adding a separator the tester just
 * removed would trap them on it.
 */
export function formatAsTyped(
  next: string,
  previous: string,
  country: CountryCode,
  caretAtEnd: boolean,
): string {
  if (!caretAtEnd) return next;
  const formatted = new AsYouType(country).input(next);
  return next.length < previous.length && formatted.length > next.length ? next : formatted;
}

/** E.164 (`+381641234567`) if the pair parses, otherwise undefined. */
export function toE164(country: CountryCode, national: string): string | undefined {
  const parsed = parsePhoneNumberFromString(national, country);
  return parsed?.isValid() ? parsed.number : undefined;
}

/**
 * Country picker plus a national-format number field. The number is formatted
 * as it's typed, using the selected country's own conventions, so a tester
 * sees the shape they'd write on paper rather than a bare digit run.
 */
export function PhoneField({
  id,
  country,
  onCountryChange,
  value,
  onValueChange,
  onBlur,
  invalid,
  describedBy,
}: {
  id: string;
  country: CountryCode;
  onCountryChange: (country: CountryCode) => void;
  value: string;
  onValueChange: (value: string) => void;
  onBlur?: () => void;
  invalid?: boolean;
  describedBy?: string;
}) {
  const selected = COUNTRY_BY_CODE.get(country);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value;
    onValueChange(formatAsTyped(next, value, country, e.target.selectionStart === next.length));
  }

  return (
    <div className="flex gap-2">
      <Select
        value={country}
        onValueChange={(v) => {
          onCountryChange(v as CountryCode);
          // Re-format what's already typed for the new country's conventions.
          onValueChange(new AsYouType(v as CountryCode).input(value));
        }}
      >
        <SelectTrigger className="w-28 shrink-0" aria-label="Country calling code">
          <SelectValue>
            <span aria-hidden="true">{selected?.flag}</span>{" "}
            <span className="num">{selected?.dial}</span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="max-h-72">
          {COUNTRIES.map((c) => (
            <SelectItem key={c.code} value={c.code} textValue={c.name}>
              <span aria-hidden="true">{c.flag}</span> {c.name}{" "}
              <span className="num text-fg-subtle">{c.dial}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        placeholder={placeholderFor(country)}
        value={value}
        onChange={handleChange}
        onBlur={onBlur}
        className="num"
        aria-invalid={invalid}
        aria-describedby={describedBy}
      />
    </div>
  );
}
