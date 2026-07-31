/**
 * The non-negotiables in CLAUDE.md are only real if lint enforces them, and a
 * rule that silently stops matching is worse than no rule — it buys false
 * confidence. So each guard is asserted here against code that must fail.
 *
 * The rule settings are read from the actual configs rather than restated, so
 * downgrading a rule to 'warn' or dropping a property from the disallowed list
 * breaks this test rather than quietly weakening the guard.
 */
import { readFileSync } from 'node:fs';
import { ESLint } from 'eslint';
import stylelint from 'stylelint';
import { describe, expect, it } from 'vitest';

import eslintConfig from '../../eslint.config.js';
import localPlugin from '../../eslint-local/index.js';

type ConfigEntry = { rules?: Record<string, unknown> };

/** Pulls a rule's configured setting out of the real flat config. */
function ruleSetting(name: string): unknown {
  const entry = (eslintConfig as ConfigEntry[]).find((item) => item.rules && name in item.rules);
  return entry?.rules?.[name];
}

async function lintTsx(code: string, rules: Record<string, unknown>) {
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.tsx'],
        languageOptions: {
          parser: await import('@typescript-eslint/parser'),
          parserOptions: { ecmaFeatures: { jsx: true } },
        },
        plugins: {
          local: localPlugin as unknown as ESLint.Plugin,
          i18next: (await import('eslint-plugin-i18next')).default,
        },
        rules: rules as never,
      },
    ],
  });
  const [result] = await eslint.lintText(code, { filePath: 'probe.tsx' });
  return result?.messages ?? [];
}

describe('RTL guard: physical Tailwind utilities', () => {
  const rules = { 'local/no-physical-utilities': ruleSetting('local/no-physical-utilities') };

  it('is an error in the real config, not a warning', () => {
    expect(rules['local/no-physical-utilities']).toBe('error');
  });

  it.each([
    ['ml-2', 'ms'],
    ['mr-4', 'me'],
    ['pl-1', 'ps'],
    ['pr-1', 'pe'],
    ['left-0', 'start'],
    ['right-3', 'end'],
    ['text-left', 'text-start'],
    ['rounded-l-lg', 'rounded-s'],
    ['border-r', 'border-e'],
  ])('rejects %s and names the logical replacement', async (utility, replacement) => {
    const messages = await lintTsx(`export const A = () => <div className='${utility}' />;`, rules);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.message).toContain(replacement);
  });

  it('rejects a physical utility behind a responsive or state variant', async () => {
    const messages = await lintTsx(
      "export const A = () => <div className='sm:hover:ml-2' />;",
      rules,
    );
    expect(messages).toHaveLength(1);
  });

  it('rejects a physical utility hidden in a clsx() argument', async () => {
    const messages = await lintTsx(
      "export const A = () => <div className={clsx('flex', cond && 'pr-3')} />;",
      rules,
    );
    expect(messages).toHaveLength(1);
  });

  it('accepts the logical equivalents', async () => {
    const messages = await lintTsx(
      "export const A = () => <div className='ms-2 me-4 ps-1 pe-1 start-0 end-3 text-start rounded-s-lg border-e' />;",
      rules,
    );
    expect(messages).toEqual([]);
  });

  it('does not fire on unrelated classes that merely contain the letters', async () => {
    // `mr` inside `transform`, `pl` inside `place-items`, `left` inside nothing.
    const messages = await lintTsx(
      "export const A = () => <div className='transform place-items-center overflow-hidden' />;",
      rules,
    );
    expect(messages).toEqual([]);
  });
});

describe('XSS and inline-style guards', () => {
  const rules = { 'no-restricted-syntax': ruleSetting('no-restricted-syntax') };

  it('rejects an inline style prop', async () => {
    const messages = await lintTsx(
      'export const A = () => <div style={{ color: "red" }} />;',
      rules,
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]?.message).toContain('No inline styles');
  });

  it('rejects dangerouslySetInnerHTML', async () => {
    const messages = await lintTsx(
      'export const A = () => <div dangerouslySetInnerHTML={{ __html: x }} />;',
      rules,
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]?.message).toContain('XSS');
  });
});

describe('i18n guard: literal user-facing strings', () => {
  const rules = {
    'local/no-literal-jsx-text': ruleSetting('local/no-literal-jsx-text'),
    'i18next/no-literal-string': ruleSetting('i18next/no-literal-string'),
  };

  it('rejects a bare string in a function-declaration component', async () => {
    const messages = await lintTsx('export function A(){ return <p>Start a game</p>; }', rules);
    expect(messages.length).toBeGreaterThan(0);
  });

  it('rejects a bare string in an ARROW component', async () => {
    // The plugin alone misses this shape entirely, which is why the local rule exists.
    const messages = await lintTsx('export const A = () => <p>Start a game</p>;', rules);
    expect(messages.length).toBeGreaterThan(0);
  });

  it('rejects literal Hebrew, not just Latin text', async () => {
    const messages = await lintTsx('export const A = () => <p>התחל משחק</p>;', rules);
    expect(messages.length).toBeGreaterThan(0);
  });

  it('rejects literal text in an attribute a user reads', async () => {
    const messages = await lintTsx('export const A = () => <img alt="a poker chip" />;', rules);
    expect(messages.length).toBeGreaterThan(0);
  });

  it('accepts a translated string', async () => {
    const messages = await lintTsx("export const A = () => <p>{t('home.title')}</p>;", rules);
    expect(messages).toEqual([]);
  });

  it('accepts alt="" — the correct way to mark an image decorative', async () => {
    const messages = await lintTsx('export const A = () => <img alt="" src={src} />;', rules);
    expect(messages).toEqual([]);
  });

  it('accepts markup inside <Trans>, whose job is exactly that', async () => {
    const messages = await lintTsx(
      'export const A = () => <Trans i18nKey="k">read <strong>this</strong> first</Trans>;',
      rules,
    );
    expect(messages).toEqual([]);
  });

  it('does not fire on punctuation or digits alone', async () => {
    const messages = await lintTsx('export const A = () => <span>·</span>;', rules);
    expect(messages).toEqual([]);
  });
});

describe('repository-layer guard: supabase-js only importable from src/data/', () => {
  const dataEntry = (
    eslintConfig as { files?: string[]; ignores?: string[]; rules?: Record<string, unknown> }[]
  ).find((entry) => entry.ignores?.includes('src/data/**'));
  const restricted = dataEntry?.rules?.['no-restricted-imports'] as
    | [string, { patterns: { group: string[] }[] }]
    | undefined;

  it('is an error in the real config, not a warning', () => {
    expect(restricted?.[0]).toBe('error');
  });

  it('bans @supabase/supabase-js in the real config', () => {
    expect(restricted?.[1].patterns[0]?.group).toEqual(
      expect.arrayContaining(['@supabase/supabase-js']),
    );
  });

  /**
   * Lints a probe at `filePath` with the real block's own `files`/`ignores`/
   * `rules` (read straight from the config above, not restated) — but
   * without type-aware parsing, which needs the probe to be a real file on
   * disk and part of the tsconfig project. `no-restricted-imports` needs no
   * type information, so this loses nothing the real config would have
   * caught.
   */
  async function lintAt(filePath: string, code: string) {
    const eslint = new ESLint({
      overrideConfigFile: true,
      overrideConfig: [
        {
          files: dataEntry?.files ?? [],
          ignores: dataEntry?.ignores ?? [],
          languageOptions: { parser: await import('@typescript-eslint/parser') },
          rules: (dataEntry?.rules ?? {}) as never,
        },
      ],
    });
    const [result] = await eslint.lintText(code, { filePath });
    return result?.messages ?? [];
  }

  it('rejects supabase-js imported from outside src/data/', async () => {
    const messages = await lintAt(
      'src/features/game/probe.ts',
      "import { createClient } from '@supabase/supabase-js';\nexport const x = createClient;\n",
    );
    expect(messages.some((m) => m.ruleId === 'no-restricted-imports')).toBe(true);
  });

  it('rejects it from core/offline/ too — the seam is src/data/, not core/', async () => {
    const messages = await lintAt(
      'src/core/offline/probe.ts',
      "import { createClient } from '@supabase/supabase-js';\nexport const x = createClient;\n",
    );
    expect(messages.some((m) => m.ruleId === 'no-restricted-imports')).toBe(true);
  });

  it('allows it inside src/data/ — that is the whole point of the seam', async () => {
    const messages = await lintAt(
      'src/data/probe.ts',
      "import { createClient } from '@supabase/supabase-js';\nexport const x = createClient;\n",
    );
    expect(messages.some((m) => m.ruleId === 'no-restricted-imports')).toBe(false);
  });
});

describe('purity guard: core/ imports nothing from React or the data layer', () => {
  it('bans the framework and the repository layer from core/', () => {
    const config = eslintConfig as { files?: string[]; rules?: Record<string, unknown> }[];
    const coreEntry = config.find((entry) => entry.files?.some((f) => f.includes('src/core')));
    const restricted = coreEntry?.rules?.['no-restricted-imports'] as
      | [string, { patterns: { group: string[] }[] }]
      | undefined;

    expect(restricted?.[0]).toBe('error');
    const banned = restricted?.[1].patterns[0]?.group ?? [];
    expect(banned).toEqual(expect.arrayContaining(['react', '@supabase/*', 'dexie']));
  });
});

describe('RTL guard: physical CSS properties', () => {
  const config = JSON.parse(readFileSync('.stylelintrc.json', 'utf8')) as {
    rules: { 'property-disallowed-list': [string[], { message: string }] };
  };

  it.each([
    'margin-left',
    'padding-right',
    'border-left',
    'border-top-left-radius',
    'left',
    'right',
  ])('bans %s in the real stylelint config', (property) => {
    expect(config.rules['property-disallowed-list'][0]).toContain(property);
  });

  it('rejects a physical property in an SCSS module', async () => {
    const result = await stylelint.lint({
      code: '.playerRow { margin-left: 4px; }',
      codeFilename: 'probe.module.scss',
      configFile: '.stylelintrc.json',
    });
    expect(result.errored).toBe(true);
  });

  it('accepts the logical equivalent', async () => {
    const result = await stylelint.lint({
      code: '.playerRow { margin-inline-start: 4px; }',
      codeFilename: 'probe.module.scss',
      configFile: '.stylelintrc.json',
    });
    expect(result.errored).toBe(false);
  });

  it('rejects a kebab-case module class name, since modules are camelCase', async () => {
    const result = await stylelint.lint({
      code: '.player-row { color: red; }',
      codeFilename: 'probe.module.scss',
      configFile: '.stylelintrc.json',
    });
    expect(result.errored).toBe(true);
  });
});
