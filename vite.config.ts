import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * A strict Content-Security-Policy, injected as a <meta http-equiv> tag because
 * GitHub Pages cannot set response headers (CLAUDE.md § Security).
 *
 * The session persists across reloads, so an XSS is a stolen session — this is
 * the main line of defence. It is injected at BUILD time only: Vite's dev server
 * needs inline scripts for HMR, and weakening the policy so dev is happy would
 * mean shipping a policy nobody has actually tested.
 *
 * Two directives cannot be expressed in a meta tag and are therefore absent by
 * necessity, not oversight: `frame-ancestors` and `report-uri`. Both need real
 * headers. Clickjacking is mitigated instead by having no sensitive same-origin
 * iframe surface.
 *
 * `connect-src` gains the Supabase project origin in step 12; until then the app
 * makes no cross-origin requests at all.
 */
function buildCsp(supabaseUrl: string | undefined): string {
  const connect = ["'self'", supabaseUrl, supabaseUrl?.replace(/^https:/, 'wss:')]
    .filter(Boolean)
    .join(' ');
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src ${connect}`,
    "manifest-src 'self'",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
  ].join('; ');
}

function cspPlugin(supabaseUrl: string | undefined): Plugin {
  return {
    name: 'poker-csp',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler: (html) =>
        html.replace(
          '<!--CSP-->',
          `<meta http-equiv="Content-Security-Policy" content="${buildCsp(supabaseUrl)}">`,
        ),
    },
  };
}

/**
 * The app is served from a GitHub Pages project site, so every asset URL is
 * prefixed with the repository name. Routing is hash-based on top of that —
 * Pages has no SPA fallback (02-architecture.md#hosting-details).
 */
const BASE = '/poker-game-tracker/';

const alias = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig(({ mode }) => ({
  base: BASE,
  resolve: {
    alias: {
      '@': alias('./src'),
      '@app': alias('./src/app'),
      '@core': alias('./src/core'),
      '@data': alias('./src/data'),
      '@features': alias('./src/features'),
      '@components': alias('./src/components'),
      '@i18n': alias('./src/i18n'),
      '@styles': alias('./src/styles'),
    },
  },
  css: {
    modules: {
      // styles.playerRow, never styles['player-row'].
      localsConvention: 'camelCaseOnly',
      generateScopedName: '[name]__[local]__[hash:base64:5]',
    },
  },
  build: {
    target: 'es2022',
    // The repo is public, so a source map buys nothing an attacker can't already
    // read — and it would add ~1.4 MB to a Pages deploy for every build.
    sourcemap: false,
  },
  plugins: [
    react(),
    tailwindcss(),
    cspPlugin(loadEnv(mode, process.cwd(), 'VITE_')['VITE_SUPABASE_URL']),
    VitePWA({
      registerType: 'prompt',
      injectRegister: null,
      includeAssets: ['favicon.svg', 'offline.html'],
      manifest: {
        id: BASE,
        name: 'Poker Game Tracker',
        short_name: 'Poker',
        description: 'מעקב כספים למשחק פוקר ביתי',
        lang: 'he',
        dir: 'rtl',
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0E0C09',
        theme_color: '#0E0C09',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,svg,png}'],
        navigateFallback: `${BASE}index.html`,
        navigateFallbackDenylist: [/^\/api/],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
}));
