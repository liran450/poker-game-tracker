/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Unused until step 12 (docs/build/PLAN.md); .env.example documents the pair. */
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
