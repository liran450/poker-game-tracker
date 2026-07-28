/**
 * The ESLint config and the local plugin are plain JS (ESLint loads them
 * directly, so compiling them would buy nothing). The lint-rule tests read
 * them to assert the real settings rather than restating them, which needs
 * these ambient declarations.
 */

declare module '*/eslint.config.js' {
  const config: { files?: string[]; rules?: Record<string, unknown> }[];
  export default config;
}

declare module '*/eslint-local/index.js' {
  const plugin: { rules: Record<string, unknown> };
  export default plugin;
}
