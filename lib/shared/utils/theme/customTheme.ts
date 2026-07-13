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

export interface CustomThemeColors {
  background: string;
  primary: string;
  secondary: string;
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
 * percentage points — used to derive elevated surfaces, muted fills and borders
 * that read correctly whether the theme is light or dark.
 */
function shiftToward(base: Hsl, isDark: boolean, amount: number): Hsl {
  return { h: base.h, s: base.s, l: clampL(base.l + (isDark ? amount : -amount)) };
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

  const card = shiftToward(bg, isDark, 4);
  const muted = shiftToward(bg, isDark, 8);
  const border = shiftToward(bg, isDark, 14);
  const mutedFg: Hsl = { h: bg.h, s: Math.min(bg.s, 25), l: isDark ? 65 : 45 };

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
    '--sidebar-background': toVar(card.h, card.s, card.l),
    '--sidebar-foreground': toVar(fg.h, fg.s, fg.l),
    '--sidebar-accent': toVar(muted.h, muted.s, muted.l),
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
  }
  reconcileAppearance();
}

/**
 * Blocking inline script (mirrors the accent FOUC script) that applies the cached
 * active custom theme before paint. Self-contained plain JS.
 */
export function getCustomThemeScript(): string {
  return `(function(){try{var raw=localStorage.getItem('${ACTIVE_THEME_CACHE_KEY}');if(!raw)return;var c=JSON.parse(raw);if(!c)return;function hx(v){var h=(''+v).trim().replace(/^#/,'');if(h.length===3){h=h.split('').map(function(x){return x+x}).join('')}if(!/^[0-9a-fA-F]{6}$/.test(h))return null;var r=parseInt(h.slice(0,2),16)/255,g=parseInt(h.slice(2,4),16)/255,b=parseInt(h.slice(4,6),16)/255;var mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn,l=(mx+mn)/2,s=0,hu=0;if(d!==0){s=l>0.5?d/(2-mx-mn):d/(mx+mn);if(mx===r){hu=(g-b)/d+(g<b?6:0)}else if(mx===g){hu=(b-r)/d+2}else{hu=(r-g)/d+4}hu/=6}return{h:hu*360,s:s*100,l:l*100}}var bg=hx(c.background),pr=hx(c.primary),se=hx(c.secondary);if(!bg||!pr||!se)return;var dark=bg.l<50;function v(h,s,l){return Math.round(h)+' '+Math.round(s)+'% '+Math.round(Math.max(0,Math.min(100,l)))+'%'}function fgc(x){return x.l>=60?'0 0% 9%':'0 0% 98%'}var fg=v(bg.h,Math.min(bg.s,20),dark?96:10);var card=v(bg.h,bg.s,bg.l+(dark?4:-4));var muted=v(bg.h,bg.s,bg.l+(dark?8:-8));var border=v(bg.h,bg.s,bg.l+(dark?14:-14));var mfg=v(bg.h,Math.min(bg.s,25),dark?65:45);var e=document.documentElement,S=function(k,val){e.style.setProperty(k,val)};S('--background',v(bg.h,bg.s,bg.l));S('--foreground',fg);S('--card',card);S('--card-foreground',fg);S('--popover',card);S('--popover-foreground',fg);S('--primary',v(pr.h,pr.s,pr.l));S('--primary-foreground',fgc(pr));S('--secondary',v(se.h,se.s,se.l));S('--secondary-foreground',fgc(se));S('--muted',muted);S('--muted-foreground',mfg);S('--accent',muted);S('--accent-foreground',fg);S('--border',border);S('--input',border);S('--ring',v(pr.h,pr.s,pr.l));S('--sidebar-background',card);S('--sidebar-foreground',fg);S('--sidebar-accent',muted);S('--sidebar-accent-foreground',fg);S('--sidebar-border',border);S('--sidebar-ring',v(pr.h,pr.s,pr.l));e.classList.toggle('dark',dark)}catch(e){}})();`;
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
