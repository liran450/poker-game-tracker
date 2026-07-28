/**
 * Dark is the primary design target and the default; light must be correct but
 * is secondary (10-design-brief.md#visual-direction). The token overrides live
 * in styles/tokens.css under `:root[data-theme='light']`.
 */

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'poker.theme';

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset['theme'] = theme;
  document.documentElement.style.colorScheme = theme;
}

export function readStoredTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'light' ? 'light' : 'dark';
}

export function storeTheme(theme: Theme): void {
  localStorage.setItem(STORAGE_KEY, theme);
}
