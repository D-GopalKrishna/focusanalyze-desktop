const STORAGE_KEY = 'focusanalyze:planner-sidebar';

export type PlannerSidebarSort = 'relevance' | 'due' | 'priority' | 'name';

export type PlannerSidebarPrefs = {
  sort: PlannerSidebarSort;
  datePreset: string;
  customDueFrom: string;
  customDueTo: string;
  includeDone: boolean;
};

const DEFAULT_PREFS: PlannerSidebarPrefs = {
  sort: 'relevance',
  datePreset: 'all',
  customDueFrom: '',
  customDueTo: '',
  includeDone: false,
};

const VALID_SORTS = new Set<PlannerSidebarSort>(['relevance', 'due', 'priority', 'name']);

export function loadPlannerSidebarPrefs(): PlannerSidebarPrefs {
  if (typeof window === 'undefined') return { ...DEFAULT_PREFS };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw) as Partial<PlannerSidebarPrefs>;
    const sort =
      parsed.sort && VALID_SORTS.has(parsed.sort as PlannerSidebarSort)
        ? (parsed.sort as PlannerSidebarSort)
        : DEFAULT_PREFS.sort;
    return {
      sort,
      datePreset:
        typeof parsed.datePreset === 'string' ? parsed.datePreset : DEFAULT_PREFS.datePreset,
      customDueFrom:
        typeof parsed.customDueFrom === 'string'
          ? parsed.customDueFrom
          : DEFAULT_PREFS.customDueFrom,
      customDueTo:
        typeof parsed.customDueTo === 'string' ? parsed.customDueTo : DEFAULT_PREFS.customDueTo,
      includeDone: parsed.includeDone === true,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePlannerSidebarPrefs(prefs: PlannerSidebarPrefs): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // ignore quota / private mode
  }
}

const DEFAULT_UTC_ALIASES = new Set(['UTC', 'Etc/UTC', 'GMT']);

function isDefaultUtcTimezone(tz?: string | null): boolean {
  if (!tz?.trim()) return true;
  return DEFAULT_UTC_ALIASES.has(tz.trim());
}

function browserTimezone(): string {
  if (typeof Intl !== 'undefined') {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  }
  return 'UTC';
}

/** IANA timezone sent with AI search requests (saved setting, then browser). */
export function resolvePlannerTimezone(userTimezone?: string | null): string {
  const saved = userTimezone?.trim();
  const browser = browserTimezone();

  // UserSettings defaults to UTC — treat that as unset and prefer the device timezone.
  if (saved && !isDefaultUtcTimezone(saved)) return saved;
  if (!isDefaultUtcTimezone(browser)) return browser;
  return saved || browser || 'UTC';
}
