import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { DEFAULT_LOCALE, PSEUDO_LOCALE } from '@i18n/index';
import { applyTheme, readStoredTheme, storeTheme, type Theme } from './theme';

/**
 * Dev-only. Switching to the pseudo-locale flips the document to LTR and makes
 * every string ~40% longer, which is how RTL assumptions and tight containers
 * get caught as screens are built rather than in an audit at the end.
 *
 * Never rendered in a production build — see the `import.meta.env.DEV` guard in
 * App.tsx.
 */
export function DevBar() {
  const { t, i18n } = useTranslation();
  const [theme, setTheme] = useState<Theme>(() => readStoredTheme());

  const toggleLocale = () => {
    const next = i18n.resolvedLanguage === PSEUDO_LOCALE ? DEFAULT_LOCALE : PSEUDO_LOCALE;
    void i18n.changeLanguage(next);
  };

  const toggleTheme = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    storeTheme(next);
    applyTheme(next);
  };

  return (
    <div className="fixed inset-inline-start-2 bottom-2 z-50 flex gap-2 rounded-pill bg-surface-raised/90 px-3 py-2 text-caption">
      <button type="button" onClick={toggleLocale} className="font-semibold">
        {t('dev.locale')}: {i18n.resolvedLanguage}
      </button>
      <button type="button" onClick={toggleTheme} className="font-semibold">
        {t('dev.theme')}: {theme === 'dark' ? t('dev.themeDark') : t('dev.themeLight')}
      </button>
    </div>
  );
}
