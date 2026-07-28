import { describe, expect, it } from 'vitest';

import { directionFor } from './index';
import { pseudoBundle, pseudoTranslate } from './pseudo';

describe('directionFor', () => {
  it('derives RTL for Hebrew, however the locale is spelled', () => {
    expect(directionFor('he')).toBe('rtl');
    expect(directionFor('he-IL')).toBe('rtl');
  });

  it('derives LTR for the pseudo-locale, so RTL assumptions surface', () => {
    expect(directionFor('en-XA')).toBe('ltr');
  });

  it('derives LTR for English and RTL for Arabic', () => {
    expect(directionFor('en')).toBe('ltr');
    expect(directionFor('ar')).toBe('rtl');
  });

  it('falls back to LTR rather than throwing on a malformed tag', () => {
    expect(directionFor('not a locale')).toBe('ltr');
  });
});

describe('pseudoTranslate', () => {
  it('makes the string materially longer, to expose tight containers', () => {
    const source = 'התחל משחק ראשון';
    const result = pseudoTranslate(source);
    expect(result.length).toBeGreaterThan(source.length * 1.3);
  });

  it('brackets the string so an untranslated literal is obvious on screen', () => {
    expect(pseudoTranslate('abc')).toMatch(/^⟦.*⟧$/);
  });

  it('leaves interpolation placeholders untouched', () => {
    // Padding inside {{count}} would break the interpolation this exists to test.
    expect(pseudoTranslate('{{count}} players')).toContain('{{count}}');
  });

  it('leaves Trans component placeholders untouched', () => {
    expect(pseudoTranslate('read <1>the rules</1> first')).toContain('<1>');
    expect(pseudoTranslate('read <1>the rules</1> first')).toContain('</1>');
  });

  it('accents Latin text so real translations stand out', () => {
    expect(pseudoTranslate('save')).toContain('šávé');
  });
});

describe('pseudoBundle', () => {
  it('preserves the shape of the bundle and translates only the leaves', () => {
    const result = pseudoBundle({ home: { title: 'abc', nested: { n: 'x' } } }) as {
      home: { title: string; nested: { n: string } };
    };
    expect(result.home.title).toMatch(/^⟦/);
    expect(result.home.nested.n).toMatch(/^⟦/);
  });

  it('leaves non-string leaves alone', () => {
    expect(pseudoBundle({ n: 3, b: true, nil: null })).toEqual({ n: 3, b: true, nil: null });
  });
});
