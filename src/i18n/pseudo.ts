/**
 * The pseudo-locale: LTR, and ~40% longer than the Hebrew it replaces.
 *
 * It exists from day one so that every screen is checked against it AS IT IS
 * BUILT (CLAUDE.md § Working style). Two classes of bug are invisible in Hebrew
 * alone and obvious here:
 *
 *   - a layout that silently assumes RTL, because RTL happened to be the only
 *     direction ever rendered;
 *   - a container sized to fit Hebrew, which runs ~15% shorter than English and
 *     far shorter than German.
 *
 * Interpolation placeholders are preserved verbatim: padding `{{count}}` would
 * break the very interpolation the pseudo-locale exists to exercise.
 */

const PLACEHOLDER = /(\{\{[^}]+\}\}|<\d+>|<\/\d+>)/g;

/** Latin lookalikes, so real translations stand out from pseudo-translated ones. */
const ACCENTS: Record<string, string> = {
  a: 'á', c: 'ç', e: 'é', i: 'í', n: 'ñ', o: 'ó', s: 'š', u: 'ü', y: 'ý', z: 'ž',
  A: 'Á', C: 'Ç', E: 'É', I: 'Í', N: 'Ñ', O: 'Ó', S: 'Š', U: 'Ü', Y: 'Ý', Z: 'Ž',
};

const PAD_RATIO = 0.4;

function accentuate(text: string): string {
  return [...text].map((char) => ACCENTS[char] ?? char).join('');
}

/**
 * Pads to ~140% of the source length. Hebrew source text is padded on character
 * count, which is the honest proxy: we cannot know the eventual English string,
 * only that it will be longer.
 */
function pad(text: string): string {
  const target = Math.ceil(text.length * PAD_RATIO);
  if (target === 0) return text;
  return `${text}${'·'.repeat(target)}`;
}

export function pseudoTranslate(source: string): string {
  const segments = source.split(PLACEHOLDER);
  const transformed = segments
    .map((segment, index) => (index % 2 === 1 ? segment : accentuate(segment)))
    .join('');
  return `⟦${pad(transformed)}⟧`;
}

/** Recursively pseudo-translates a resource bundle, leaving its shape intact. */
export function pseudoBundle(source: unknown): unknown {
  if (typeof source === 'string') return pseudoTranslate(source);
  if (Array.isArray(source)) return source.map(pseudoBundle);
  if (source && typeof source === 'object') {
    return Object.fromEntries(
      Object.entries(source).map(([key, value]) => [key, pseudoBundle(value)]),
    );
  }
  return source;
}
