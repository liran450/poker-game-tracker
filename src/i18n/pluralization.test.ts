import { describe, expect, it } from 'vitest';
import he from './locales/he.json';

/**
 * Hebrew's `Intl.PluralRules` has THREE categories that actually occur for
 * integers: one (1), two (2), other (0, 3+) — verified against Node's ICU
 * data. i18next resolves a pluralized key by looking up `<key>_<category>`
 * for whichever category `count` falls into; if a key defines `_one` and
 * `_other` but not `_two`, count=2 resolves to nothing and i18next prints the
 * raw key. This bit `addPlayers.commit_two` in the field (docs/build/NOTES.md)
 * — this test is the regression guard: every `_one`/`_other` pair must also
 * have a `_two`.
 */
function collectPluralBases(obj: unknown, prefix: string[] = []): Set<string> {
  const bases = new Set<string>();
  if (typeof obj !== 'object' || obj === null) return bases;

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      if (key.endsWith('_one') || key.endsWith('_other')) {
        bases.add([...prefix, key.replace(/_(one|two|other)$/, '')].join('.'));
      }
    } else {
      for (const base of collectPluralBases(value, [...prefix, key])) bases.add(base);
    }
  }
  return bases;
}

function getByPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, segment) => {
    if (typeof acc !== 'object' || acc === null) return undefined;
    return (acc as Record<string, unknown>)[segment];
  }, obj);
}

describe('Hebrew pluralization', () => {
  const bases = collectPluralBases(he);

  it('found at least one pluralized key to check (guards against a vacuous pass)', () => {
    expect(bases.size).toBeGreaterThan(0);
  });

  it.each([...bases])('%s defines a _two variant alongside _one/_other', (base) => {
    const segments = base.split('.');
    const parentPath = segments.slice(0, -1).join('.');
    const leaf = segments.at(-1);
    const parent = parentPath ? getByPath(he, parentPath) : he;
    expect(
      typeof parent === 'object' && parent !== null && `${leaf}_two` in parent,
      `expected "${base}_two" to exist next to "${base}_one"/"${base}_other"`,
    ).toBe(true);
  });
});
