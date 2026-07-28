import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

import he from './locales/he.json';
import { pseudoBundle } from './pseudo';

export const PSEUDO_LOCALE = 'en-XA';
export const DEFAULT_LOCALE = 'he';
export const LOCALE_STORAGE_KEY = 'poker.locale';

const isDev = import.meta.env.DEV;

/**
 * Direction is DERIVED from the locale and never hardcoded — no component may
 * assume RTL is true (02-architecture.md#internationalisation).
 *
 * `Intl.Locale.prototype.getTextInfo` is the standard way to ask; the explicit
 * list is the fallback for engines that haven't shipped it, and it is a list of
 * RTL scripts rather than of countries.
 */
const RTL_LANGUAGES = new Set(['he', 'iw', 'ar', 'fa', 'ur', 'ps', 'dv', 'yi', 'ku', 'sd']);

type TextInfoCapable = Intl.Locale & { getTextInfo?: () => { direction: string } };

export function directionFor(locale: string): 'rtl' | 'ltr' {
  try {
    const parsed = new Intl.Locale(locale) as TextInfoCapable;
    const direction = parsed.getTextInfo?.().direction;
    if (direction === 'rtl' || direction === 'ltr') return direction;
    return RTL_LANGUAGES.has(parsed.language) ? 'rtl' : 'ltr';
  } catch {
    return RTL_LANGUAGES.has(locale.split('-')[0] ?? '') ? 'rtl' : 'ltr';
  }
}

/** Applies locale and direction to <html>. The one place either is written. */
export function applyLocaleToDocument(locale: string): void {
  const root = document.documentElement;
  root.lang = locale;
  root.dir = directionFor(locale);
}

/**
 * The pseudo-locale is a development instrument, never a language a user can
 * land in. It is therefore resolved EXPLICITLY — from `?lang=` or from a value
 * this app itself stored — and never by sniffing `navigator.language`.
 *
 * This is not belt-and-braces. i18next's browser detector matches a requested
 * `en-US` against a supported `en-XA` on the shared language part, so simply
 * registering the pseudo-locale alongside a detector boots every English-locale
 * phone into pseudo-translated Hebrew. That is exactly what happened, and the
 * smoke test that caught it still guards this.
 *
 * Real detection returns when a second real language ships; with one shipping
 * language there is nothing to detect.
 */
function resolveInitialLocale(): string {
  if (!isDev) return DEFAULT_LOCALE;
  try {
    const requested = new URLSearchParams(window.location.search).get('lang');
    if (requested === PSEUDO_LOCALE) return PSEUDO_LOCALE;
    if (window.localStorage.getItem(LOCALE_STORAGE_KEY) === PSEUDO_LOCALE) return PSEUDO_LOCALE;
  } catch {
    // A blocked storage or an exotic URL must never stop the app booting.
  }
  return DEFAULT_LOCALE;
}

export const SUPPORTED_LOCALES = isDev ? [DEFAULT_LOCALE, PSEUDO_LOCALE] : [DEFAULT_LOCALE];

/* Resources are bundled inline, so init resolves synchronously — no top-level
 * await, which keeps this module importable from tests and from the SW build. */
void i18next.use(initReactI18next).init({
  lng: resolveInitialLocale(),
  resources: {
    [DEFAULT_LOCALE]: { translation: he },
    // The pseudo bundle is dev-only, so it never reaches a production payload.
    ...(isDev ? { [PSEUDO_LOCALE]: { translation: pseudoBundle(he) as typeof he } } : {}),
  },
  supportedLngs: SUPPORTED_LOCALES,
  fallbackLng: DEFAULT_LOCALE,
  interpolation: {
    // React escapes on render; double-escaping mangles Hebrew punctuation.
    escapeValue: false,
  },
});

i18next.on('languageChanged', (locale: string) => {
  applyLocaleToDocument(locale);
  if (!isDev) return;
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Persisting the dev locale is a convenience, never a requirement.
  }
});

applyLocaleToDocument(i18next.resolvedLanguage ?? DEFAULT_LOCALE);

export default i18next;
