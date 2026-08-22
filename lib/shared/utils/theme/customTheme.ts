/**
 * Custom themes (FA-948).
 *
 * A custom theme is three seed colors — background, primary, secondary — from
 * which we derive a full shadcn CSS-variable palette. When a theme is selected
 * it OVERRIDES the light/dark mode entirely (it explicitly sets `--background`
 * etc. on <html>, winning over the `.dark`/`:root` tokens in globals.css).
 *
 * Themes live on the backend (synced per-user), but the *active* theme's derived
 * palette is also cached in localStorage so we can apply it before paint (FOUC).
 */

export const ACTIVE_THEME_CACHE_KEY = 'fa-active-custom-theme';

/** Same-tab signal when the cached custom theme changes (storage events only fire cross-tab). */
export const ACTIVE_THEME_CHANGE_EVENT = 'fa-active-custom-theme-change';

export interface CustomThemeColors {
  background: string;
  primary: string;
  secondary: string;
}

/** Built-in Soft Kitty color preset (FA-948). Colors only — companions live in UI extensions. */
export const SOFT_KITTY_COLORS: CustomThemeColors = {
  background: '#FFF0F5',
  primary: '#F7A6C4',
  secondary: '#C8A2DB',
};

function normalizeHex(hex: string): string {
  return hex.trim().toLowerCase();
}

export function isSoftKittyColors(colors: CustomThemeColors | null | undefined): boolean {
  if (!colors) return false;
  return (
    normalizeHex(colors.background) === normalizeHex(SOFT_KITTY_COLORS.background) &&
    normalizeHex(colors.primary) === normalizeHex(SOFT_KITTY_COLORS.primary) &&
    normalizeHex(colors.secondary) === normalizeHex(SOFT_KITTY_COLORS.secondary)
  );
}

/** Parse `#rgb`/`#rrggbb` into 0–255 channels, or null if malformed. */
function parseHex(hex: string): { r: number; g: number; b: number } | null {
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  }
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

export function isValidHex(hex: string): boolean {
  return parseHex(hex) !== null;
}

export function hexToHsl(hex: string): Hsl | null {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

/** The full set of CSS variables a custom theme drives on <html>. */
const THEME_DRIVEN_VARS = [
  '--background',
  '--foreground',
  '--card',
  '--card-foreground',
  '--popover',
  '--popover-foreground',
  '--primary',
  '--primary-foreground',
  '--secondary',
  '--secondary-foreground',
  '--muted',
  '--muted-foreground',
  '--accent',
  '--accent-foreground',
  '--border',
  '--input',
  '--ring',
  '--sidebar-background',
  '--sidebar-foreground',
  '--sidebar-accent',
  '--sidebar-accent-foreground',
  '--sidebar-border',
  '--sidebar-ring',
] as const;

interface Hsl {
  h: number;
  s: number;
  l: number;
}

function toVar(h: number, s: number, l: number): string {
  return `${Math.round(h)} ${Math.round(s)}% ${Math.round(l)}%`;
}

/** Clamp lightness into [0,100]. */
function clampL(l: number): number {
  return Math.max(0, Math.min(100, l));
}

/** Legible foreground (near-white / near-black) for text on a given base color. */
function foregroundFor(base: Hsl): string {
  return base.l >= 60 ? '0 0% 9%' : '0 0% 98%';
}

/**
 * Shift a base color's lightness toward the foreground direction by `amount`
 * percentage points — used for dark themes (lift surfaces) and shared helpers.
 */
function shiftToward(base: Hsl, isDark: boolean, amount: number): Hsl {
  return { h: base.h, s: base.s, l: clampL(base.l + (isDark ? amount : -amount)) };
}

/**
 * Light custom themes (Soft Kitty, pastels): elevate like paper on a tinted
 * canvas — slightly lighter + desaturated — instead of darkening the bg hue,
 * which makes dusty two-tone cards and loud magenta borders.
 */
function elevateLightSurface(base: Hsl, desaturateBy: number, lightenBy: number): Hsl {
  return {
    h: base.h,
    s: Math.max(0, base.s - desaturateBy),
    l: clampL(Math.min(100, base.l + lightenBy)),
  };
}

function recessLightSurface(base: Hsl, desaturateBy: number, darkenBy: number): Hsl {
  return {
    h: base.h,
    s: Math.max(0, base.s - desaturateBy),
    l: clampL(base.l - darkenBy),
  };
}

/**
 * Derive the complete palette (as CSS-var triplet strings) from the three seed
 * colors. Returns null if any seed is not a valid hex.
 */
export function deriveThemeVars(colors: CustomThemeColors): Record<string, string> | null {
  const bg = hexToHsl(colors.background);
  const primary = hexToHsl(colors.primary);
  const secondary = hexToHsl(colors.secondary);
  if (!bg || !primary || !secondary) return null;

  const isDark = bg.l < 50;
  const fg: Hsl = { h: bg.h, s: Math.min(bg.s, 20), l: isDark ? 96 : 10 };

  // Dark: lift surfaces toward white. Light: paper elevation (not muddy darken).
  const card = isDark ? shiftToward(bg, true, 4) : elevateLightSurface(bg, 28, 2);
  const muted = isDark ? shiftToward(bg, true, 8) : recessLightSurface(bg, 16, 3);
  const border = isDark ? shiftToward(bg, true, 14) : recessLightSurface(bg, 32, 9);
  const mutedFg: Hsl = { h: bg.h, s: Math.min(bg.s, 25), l: isDark ? 65 : 45 };
  // Keep a soft tinted sidebar on light themes so Soft Kitty doesn't lose its pink rail.
  const sidebarBg = isDark ? card : recessLightSurface(bg, 6, 3);
  // Sidebar's own active/selected highlight — must diverge from sidebarBg by more than
  // muted does, or the active nav item is indistinguishable from the rail (FA bug: Soft
  // Kitty's near-white bg compresses card/muted/sidebarBg into the same lightness band).
  const sidebarAccent = isDark ? shiftToward(bg, true, 20) : recessLightSurface(bg, 22, 12);

  return {
    '--background': toVar(bg.h, bg.s, bg.l),
    '--foreground': toVar(fg.h, fg.s, fg.l),
    '--card': toVar(card.h, card.s, card.l),
    '--card-foreground': toVar(fg.h, fg.s, fg.l),
    '--popover': toVar(card.h, card.s, card.l),
    '--popover-foreground': toVar(fg.h, fg.s, fg.l),
    '--primary': toVar(primary.h, primary.s, primary.l),
    '--primary-foreground': foregroundFor(primary),
    '--secondary': toVar(secondary.h, secondary.s, secondary.l),
    '--secondary-foreground': foregroundFor(secondary),
    '--muted': toVar(muted.h, muted.s, muted.l),
    '--muted-foreground': toVar(mutedFg.h, mutedFg.s, mutedFg.l),
    // Accent (hover/selected token) reuses secondary hue, softened toward bg.
    '--accent': toVar(muted.h, muted.s, muted.l),
    '--accent-foreground': toVar(fg.h, fg.s, fg.l),
    '--border': toVar(border.h, border.s, border.l),
    '--input': toVar(border.h, border.s, border.l),
    '--ring': toVar(primary.h, primary.s, primary.l),
    // App sidebar (uses its own token set) — elevated surface + theme foreground.
    // Deriving sidebar-accent/border/ring here (rather than leaving them undefined)
    // is what keeps the active nav-item highlight legible: it always matches this
    // theme's real background lightness, instead of whatever next-themes' light/dark
    // class happens to be set to.
    '--sidebar-background': toVar(sidebarBg.h, sidebarBg.s, sidebarBg.l),
    '--sidebar-foreground': toVar(fg.h, fg.s, fg.l),
    '--sidebar-accent': toVar(sidebarAccent.h, sidebarAccent.s, sidebarAccent.l),
    '--sidebar-accent-foreground': toVar(fg.h, fg.s, fg.l),
    '--sidebar-border': toVar(border.h, border.s, border.l),
    '--sidebar-ring': toVar(primary.h, primary.s, primary.l),
  };
}

/**
 * Apply (or clear, when passed null) a custom theme's derived palette to <html>.
 *
 * Also syncs the `dark` class to match the theme's own background lightness.
 * Custom themes never call next-themes' `setTheme()`, so without this, a light
 * custom theme selected while the app happens to be in Dark mode would leave
 * the `dark` class in place — breaking any component that still legitimately
 * uses Tailwind's `dark:` variant (e.g. surfaces intentionally pinned to a
 * fixed dark look, like the FocusGPT search panel) even though the actual
 * background is light. Our own CSS-var overrides win over `.dark`'s rules via
 * higher specificity (inline style vs class selector), so toggling this class
 * doesn't affect the custom theme's own colors — it only keeps `dark:` correct
 * for anything else that inspects it.
 */
export function applyCustomTheme(colors: CustomThemeColors | null | undefined): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (!colors) {
    THEME_DRIVEN_VARS.forEach((v) => root.style.removeProperty(v));
    return;
  }
  const vars = deriveThemeVars(colors);
  if (!vars) {
    THEME_DRIVEN_VARS.forEach((v) => root.style.removeProperty(v));
    return;
  }
  Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));
  const bg = hexToHsl(colors.background);
  if (bg) root.classList.toggle('dark', bg.l < 50);
}

export function getCachedActiveTheme(): CustomThemeColors | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(ACTIVE_THEME_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CustomThemeColors;
    if (
      parsed &&
      isValidHex(parsed.background) &&
      isValidHex(parsed.primary) &&
      isValidHex(parsed.secondary)
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function subscribeActiveTheme(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key === ACTIVE_THEME_CACHE_KEY || e.key === null) onChange();
  };
  window.addEventListener(ACTIVE_THEME_CHANGE_EVENT, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(ACTIVE_THEME_CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onStorage);
  };
}

/** Resolve a shadcn HSL CSS var (e.g. `--primary`) to an `hsl(...)` color string. */
export function readCssHslVar(varName: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  if (!raw) return fallback;
  return `hsl(${raw})`;
}

/**
 * Glow / accent palette derived from the active theme tokens (not hardcoded
 * rainbow greens). Re-read after custom-theme or light/dark changes.
 */
export function getThemeGlowColors(): string[] {
  return [
    readCssHslVar('--primary', 'hsl(222 47% 11%)'),
    readCssHslVar('--secondary', 'hsl(210 40% 96%)'),
    readCssHslVar('--ring', 'hsl(222 84% 5%)'),
    readCssHslVar('--accent', 'hsl(210 40% 96%)'),
  ];
}

/** Re-apply whatever theme is currently cached (or clear overrides if none). */
export function reconcileAppearance(): void {
  applyCustomTheme(getCachedActiveTheme());
}

/** Cache + apply the active theme. Passing null clears the cache and the overrides. */
export function setCachedActiveTheme(colors: CustomThemeColors | null): void {
  if (typeof window !== 'undefined') {
    try {
      if (colors) {
        window.localStorage.setItem(ACTIVE_THEME_CACHE_KEY, JSON.stringify(colors));
      } else {
        window.localStorage.removeItem(ACTIVE_THEME_CACHE_KEY);
      }
    } catch {
      /* storage unavailable — theme just won't survive reload on this device */
    }
    window.dispatchEvent(new Event(ACTIVE_THEME_CHANGE_EVENT));
  }
  reconcileAppearance();
}

/**
 * Blocking inline script (mirrors the accent FOUC script) that applies the cached
 * active custom theme before paint. Self-contained plain JS.
 */
export function getCustomThemeScript(): string {
  // Keep in sync with deriveThemeVars — light themes elevate paper-style (not muddy darken).
  return `(function(){try{var raw=localStorage.getItem('${ACTIVE_THEME_CACHE_KEY}');if(!raw)return;var c=JSON.parse(raw);if(!c)return;function hx(v){var h=(''+v).trim().replace(/^#/,'');if(h.length===3){h=h.split('').map(function(x){return x+x}).join('')}if(!/^[0-9a-fA-F]{6}$/.test(h))return null;var r=parseInt(h.slice(0,2),16)/255,g=parseInt(h.slice(2,4),16)/255,b=parseInt(h.slice(4,6),16)/255;var mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn,l=(mx+mn)/2,s=0,hu=0;if(d!==0){s=l>0.5?d/(2-mx-mn):d/(mx+mn);if(mx===r){hu=(g-b)/d+(g<b?6:0)}else if(mx===g){hu=(b-r)/d+2}else{hu=(r-g)/d+4}hu/=6}return{h:hu*360,s:s*100,l:l*100}}var bg=hx(c.background),pr=hx(c.primary),se=hx(c.secondary);if(!bg||!pr||!se)return;var dark=bg.l<50;function clamp(x){return Math.max(0,Math.min(100,x))}function v(h,s,l){return Math.round(h)+' '+Math.round(s)+'% '+Math.round(clamp(l))+'%'}function fgc(x){return x.l>=60?'0 0% 9%':'0 0% 98%'}function elev(b,ds,up){return{h:b.h,s:Math.max(0,b.s-ds),l:clamp(Math.min(100,b.l+up))}}function recess(b,ds,dn){return{h:b.h,s:Math.max(0,b.s-ds),l:clamp(b.l-dn)}}var fg=v(bg.h,Math.min(bg.s,20),dark?96:10);var card=dark?{h:bg.h,s:bg.s,l:clamp(bg.l+4)}:elev(bg,28,2);var muted=dark?{h:bg.h,s:bg.s,l:clamp(bg.l+8)}:recess(bg,16,3);var border=dark?{h:bg.h,s:bg.s,l:clamp(bg.l+14)}:recess(bg,32,9);var sidebar=dark?card:recess(bg,6,3);var sidebarAccent=dark?{h:bg.h,s:bg.s,l:clamp(bg.l+20)}:recess(bg,22,12);var mfg=v(bg.h,Math.min(bg.s,25),dark?65:45);var e=document.documentElement,S=function(k,val){e.style.setProperty(k,val)};S('--background',v(bg.h,bg.s,bg.l));S('--foreground',fg);S('--card',v(card.h,card.s,card.l));S('--card-foreground',fg);S('--popover',v(card.h,card.s,card.l));S('--popover-foreground',fg);S('--primary',v(pr.h,pr.s,pr.l));S('--primary-foreground',fgc(pr));S('--secondary',v(se.h,se.s,se.l));S('--secondary-foreground',fgc(se));S('--muted',v(muted.h,muted.s,muted.l));S('--muted-foreground',mfg);S('--accent',v(muted.h,muted.s,muted.l));S('--accent-foreground',fg);S('--border',v(border.h,border.s,border.l));S('--input',v(border.h,border.s,border.l));S('--ring',v(pr.h,pr.s,pr.l));S('--sidebar-background',v(sidebar.h,sidebar.s,sidebar.l));S('--sidebar-foreground',fg);S('--sidebar-accent',v(sidebarAccent.h,sidebarAccent.s,sidebarAccent.l));S('--sidebar-accent-foreground',fg);S('--sidebar-border',v(border.h,border.s,border.l));S('--sidebar-ring',v(pr.h,pr.s,pr.l));e.classList.toggle('dark',dark)}catch(e){}})();`;
}

function copyResolvedThemeVars(source: HTMLElement, target: HTMLElement): () => void {
  const sourceStyle = getComputedStyle(source);
  const previous = new Map<string, string>();

  for (const name of THEME_DRIVEN_VARS) {
    previous.set(name, target.style.getPropertyValue(name));
    const value = sourceStyle.getPropertyValue(name).trim();
    if (value) {
      target.style.setProperty(name, value);
    }
  }

  return () => {
    for (const name of THEME_DRIVEN_VARS) {
      const prev = previous.get(name) ?? '';
      if (prev) target.style.setProperty(name, prev);
      else target.style.removeProperty(name);
    }
  };
}

function syncDarkClassFromRoot(target: HTMLElement): () => void {
  const rootDark = document.documentElement.classList.contains('dark');
  const hadDark = target.classList.contains('dark');
  target.classList.toggle('dark', rootDark);
  return () => target.classList.toggle('dark', hadDark);
}

/**
 * html-to-image clones a subtree without <html>'s theme context. Mirror the active
 * palette (built-in mode or custom FA-948 theme) onto the capture root briefly so
 * exports match what the user sees.
 */
export async function withThemedHtmlCaptureContext<T>(
  target: HTMLElement,
  run: () => Promise<T>,
): Promise<T> {
  const restoreDark = syncDarkClassFromRoot(target);
  const restoreVars = copyResolvedThemeVars(document.documentElement, target);
  try {
    return await run();
  } finally {
    restoreVars();
    restoreDark();
  }
}

function hslFromCssVar(style: CSSStyleDeclaration, name: string): string | null {
  const value = style.getPropertyValue(name).trim();
  return value ? `hsl(${value})` : null;
}

/** Resolved export colors for html-to-image, aligned with the active theme. */
export function resolveThemedExportColors(element: HTMLElement): {
  backgroundColor: string;
  color: string;
} {
  const elementStyle = getComputedStyle(element);
  const rootStyle = getComputedStyle(document.documentElement);

  const backgroundColor =
    elementStyle.backgroundColor !== 'rgba(0, 0, 0, 0)'
      ? elementStyle.backgroundColor
      : rootStyle.backgroundColor !== 'rgba(0, 0, 0, 0)'
        ? rootStyle.backgroundColor
        : (hslFromCssVar(rootStyle, '--background') ?? 'hsl(0 0% 100%)');

  const color =
    elementStyle.color !== 'rgba(0, 0, 0, 0)'
      ? elementStyle.color
      : (hslFromCssVar(rootStyle, '--foreground') ?? 'hsl(0 0% 9%)');

  return { backgroundColor, color };
}
