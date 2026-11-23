import type { ThemePreference } from '@zita/shared';

const STORAGE_KEY = 'zita-color-scheme';

export function getSystemColorScheme(): 'dark' | 'light' {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'dark';
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Syncs `<meta name="color-scheme">`, `localStorage`, and the `.dark` root class
 * expected by official `@coss/style` tokens.
 */
export function applyThemePreference(theme: ThemePreference): void {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]');
  const content = theme === 'system' ? 'light dark' : theme;
  if (meta) {
    meta.setAttribute('content', content);
  }
  try {
    if (theme === 'system') {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, theme);
    }
  } catch {
    // Ignore storage access errors
  }

  const resolvedDark = theme === 'dark' || (theme === 'system' && getSystemColorScheme() === 'dark');
  document.documentElement.classList.toggle('dark', resolvedDark);
}
