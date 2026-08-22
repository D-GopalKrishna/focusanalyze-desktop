/**
 * Shared timezone helpers for the Settings → Calendar timezone field and the app-load
 * mismatch banner. `UserSettings.timezone` is only ever set once, silently, during
 * onboarding — any account that skipped/predates that, or whose browser/device zone has
 * since diverged from what's saved, has no way to notice or self-correct without these.
 */

/** Curated fallback list, mirrors onboarding's — used only if `Intl.supportedValuesOf` is unavailable. */
export const FALLBACK_TIMEZONES: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'America/New_York', label: 'Eastern Time (ET) - New York' },
  { value: 'America/Chicago', label: 'Central Time (CT) - Chicago' },
  { value: 'America/Denver', label: 'Mountain Time (MT) - Denver' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT) - Los Angeles' },
  { value: 'America/Anchorage', label: 'Alaska Time (AKT) - Anchorage' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time (HST) - Honolulu' },
  { value: 'Europe/London', label: 'Greenwich Mean Time (GMT) - London' },
  { value: 'Europe/Paris', label: 'Central European Time (CET) - Paris' },
  { value: 'Europe/Berlin', label: 'Central European Time (CET) - Berlin' },
  { value: 'Europe/Moscow', label: 'Moscow Time (MSK) - Moscow' },
  { value: 'Asia/Tokyo', label: 'Japan Standard Time (JST) - Tokyo' },
  { value: 'Asia/Shanghai', label: 'China Standard Time (CST) - Shanghai' },
  { value: 'Asia/Singapore', label: 'Singapore Time (SGT) - Singapore' },
  { value: 'Asia/Kolkata', label: 'India Standard Time (IST) - Kolkata, Mumbai, Delhi' },
  { value: 'Asia/Dubai', label: 'Gulf Standard Time (GST) - Dubai' },
  { value: 'Australia/Sydney', label: 'Australian Eastern Time (AET) - Sydney' },
  { value: 'Pacific/Auckland', label: 'New Zealand Time (NZST) - Auckland' },
  { value: 'America/Sao_Paulo', label: 'Brasilia Time (BRT) - São Paulo' },
  { value: 'Africa/Cairo', label: 'Eastern European Time (EET) - Cairo' },
  { value: 'Africa/Johannesburg', label: 'South Africa Time (SAST) - Johannesburg' },
  { value: 'UTC', label: 'Coordinated Universal Time (UTC)' },
];

/**
 * Full IANA zone list via the runtime, falling back to the curated list above.
 *
 * `Intl.supportedValuesOf('timeZone')` commonly omits the literal `'UTC'` — it's a valid,
 * frequently-relevant zone (many profiles default to it) that just isn't always enumerated
 * under the ICU `timeZone` category — so it's added back explicitly if missing.
 */
export function listSupportedTimezones(): string[] {
  const intlWithSupportedValues = Intl as typeof Intl & {
    supportedValuesOf?: (key: string) => string[];
  };
  if (typeof intlWithSupportedValues.supportedValuesOf === 'function') {
    try {
      const zones = intlWithSupportedValues.supportedValuesOf('timeZone');
      return zones.includes('UTC') ? zones : ['UTC', ...zones];
    } catch {
      // fall through to the curated list
    }
  }
  return FALLBACK_TIMEZONES.map((tz) => tz.value);
}

/**
 * Legacy IANA aliases some browsers'/runtimes' ICU data still resolves to instead of the
 * modern canonical name (e.g. Chromium's `Intl.DateTimeFormat` for `timeZoneId: 'Asia/Kolkata'`
 * reports back `'Asia/Calcutta'` — same offset, same zone, just an older identifier). Same
 * quirk exists in Node's ICU build (`Intl.supportedValuesOf('timeZone')`, confirmed via the
 * unit tests for this file). Mapped here purely for display — the stored/compared value is
 * whatever the browser actually reports, untouched.
 */
const TIMEZONE_ALIASES: Readonly<Record<string, string>> = {
  'Asia/Calcutta': 'Asia/Kolkata',
  'Asia/Rangoon': 'Asia/Yangon',
  'Asia/Saigon': 'Asia/Ho_Chi_Minh',
  'Asia/Katmandu': 'Asia/Kathmandu',
  'Australia/ACT': 'Australia/Sydney',
  'US/Eastern': 'America/New_York',
  'US/Central': 'America/Chicago',
  'US/Mountain': 'America/Denver',
  'US/Pacific': 'America/Los_Angeles',
};

/** Resolves a legacy alias to its modern canonical IANA name; unknown/already-canonical zones pass through. */
export function canonicalTimezone(zone: string): string {
  return TIMEZONE_ALIASES[zone] ?? zone;
}

/** Best-effort human label for a zone the curated list doesn't cover — just the raw IANA name. */
export function labelForTimezone(zone: string): string {
  return FALLBACK_TIMEZONES.find((tz) => tz.value === canonicalTimezone(zone))?.label ?? zone;
}

/**
 * Search text for a zone's picker entry: the raw IANA name, its canonical alias if the
 * runtime reports a legacy one (e.g. 'Asia/Calcutta' -> also includes 'Asia/Kolkata'), and
 * its human label — so a user typing either the old or modern city/region name finds it.
 */
export function searchKeywordsForTimezone(zone: string): string {
  const canonical = TIMEZONE_ALIASES[zone];
  return [zone, canonical, labelForTimezone(zone)].filter(Boolean).join(' ');
}

export function getBrowserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * True when the browser's detected zone differs from the saved profile zone. `null`/`undefined`
 * profile timezone (never loaded yet) is treated as "no mismatch to report" — the banner has
 * nothing meaningful to compare against until settings have actually loaded.
 *
 * Compares *canonical* zones, not raw strings — two different browsers (or the same browser
 * across an OS/ICU update) can report different legacy aliases for the identical real-world
 * zone (e.g. 'Asia/Calcutta' vs 'Asia/Kolkata'). A raw string compare would flag that as a
 * mismatch forever, even right after the user clicks "Update" — this bit a real account: the
 * profile got saved as 'Asia/Calcutta' by one browser, then a different browser reporting
 * 'Asia/Kolkata' kept showing the banner despite both being the same zone.
 */
export function hasTimezoneMismatch(
  profileTimezone: string | null | undefined,
  browserTimezone: string = getBrowserTimezone(),
): boolean {
  if (!profileTimezone) return false;
  return canonicalTimezone(profileTimezone) !== canonicalTimezone(browserTimezone);
}

/**
 * sessionStorage key for dismissing the mismatch banner — scoped to the exact (profile, browser)
 * pair (canonicalized, matching `hasTimezoneMismatch`) so dismissing one mismatch doesn't
 * suppress a *different* future mismatch (e.g. profile gets updated to a third, still-wrong
 * zone) from being reported in a later session.
 */
export function timezoneMismatchDismissKey(
  profileTimezone: string,
  browserTimezone: string,
): string {
  return `focusanalyze:timezone-mismatch-dismissed:${canonicalTimezone(profileTimezone)}:${canonicalTimezone(browserTimezone)}`;
}
