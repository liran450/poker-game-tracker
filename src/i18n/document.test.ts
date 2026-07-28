import { beforeEach, describe, expect, it } from 'vitest';

import { applyLocaleToDocument, DEFAULT_LOCALE, PSEUDO_LOCALE } from './index';

describe('applyLocaleToDocument', () => {
  beforeEach(() => {
    document.documentElement.lang = '';
    document.documentElement.dir = '';
  });

  it('sets Hebrew and RTL for the shipping locale', () => {
    applyLocaleToDocument(DEFAULT_LOCALE);
    expect(document.documentElement.lang).toBe('he');
    expect(document.documentElement.dir).toBe('rtl');
  });

  it('flips the document to LTR for the pseudo-locale', () => {
    // The point of the pseudo-locale: no code change, no component opt-in — the
    // direction follows the locale, so an RTL assumption shows up immediately.
    applyLocaleToDocument(PSEUDO_LOCALE);
    expect(document.documentElement.lang).toBe('en-XA');
    expect(document.documentElement.dir).toBe('ltr');
  });

  it('flips back, so switching locales is not one-way', () => {
    applyLocaleToDocument(PSEUDO_LOCALE);
    applyLocaleToDocument(DEFAULT_LOCALE);
    expect(document.documentElement.dir).toBe('rtl');
  });
});
