import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import i18next from 'eslint-plugin-i18next';

import local from './eslint-local/index.js';

export default tseslint.config(
  { ignores: ['dist', 'dev-dist', 'coverage', 'node_modules', 'docs/design/**', 'playwright-report'] },

  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,

  // Type-aware rules need a TS program. The plain-JS files (this config, the
  // local plugin) aren't in one, so the typed rules are switched off for them.
  {
    files: ['**/*.js'],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: { globals: globals.node },
  },

  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      i18next,
      local,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // --- The non-negotiables from CLAUDE.md, as rules ---

      // RTL: logical properties only. The SCSS half is stylelint's job.
      'local/no-physical-utilities': 'error',

      // No inline styles. Also what lets `style-src 'self'` hold in the CSP.
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='style']",
          message:
            'No inline styles — use a Tailwind class, or a .module.scss when Tailwind cannot express it. This also keeps the CSP free of unsafe-inline.',
        },
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message:
            'dangerouslySetInnerHTML is the largest XSS vector in React, and an XSS here steals the persisted session. Use i18next <Trans> with real components.',
        },
      ],

      // No literal user-facing strings: every sentence is a template with named
      // parameters, so word order can differ per language.
      //
      // Two rules, deliberately. The plugin only reports JSX returned from a
      // function *declaration*, so arrow components pass it silently; the local
      // rule covers every component shape plus the translatable attributes.
      'local/no-literal-jsx-text': 'error',
      'i18next/no-literal-string': ['error', { mode: 'jsx-text-only' }],

      // No eval, no new Function, nothing built from a user-controlled string.
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-script-url': 'error',

      // Money is integers in the minor unit; a stray float is a bug worth noise.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'warn',

      quotes: ['error', 'single', { avoidEscape: true, allowTemplateLiterals: false }],
    },
  },

  // core/settlement.ts and core/events.ts must stay pure: no React, no
  // Supabase, no Dexie, no DOM — they are the parts that must be provably
  // correct (CLAUDE.md #Purity). core/offline/ is deliberately exempt: it IS
  // the Dexie outbox and sync engine (02-architecture.md#repository-layout).
  {
    files: ['src/core/*.ts'],
    ignores: ['src/core/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-*', '@supabase/*', 'dexie', '@data/*', '@features/*', '@components/*'],
              message:
                'core/settlement.ts and core/events.ts are pure by contract — no React, Supabase, Dexie or UI imports. Anything that needs them belongs in core/offline/, a hook, or the repository layer.',
            },
          ],
        },
      ],
    },
  },

  // Node-side config files.
  {
    files: ['*.config.{ts,js}', 'eslint-local/**/*.js', 'e2e/**/*.ts', 'supabase/tests/**/*.ts'],
    languageOptions: { globals: globals.node },
    rules: {
      'i18next/no-literal-string': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
    },
  },

  // Tests describe themselves in English; forcing them through i18n is noise.
  {
    files: ['**/*.test.{ts,tsx}', 'src/test/**/*.{ts,tsx}'],
    rules: {
      'i18next/no-literal-string': 'off',
    },
  },
);
