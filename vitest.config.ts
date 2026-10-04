// vitest configuration — same alias as the build (vite.config.ts).
import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';
import { SUPABASE_PLACEHOLDER, supabaseDefines } from './vite.config';

export default defineConfig({
  define: {
    // Tests always run on the placeholder connection values — they never depend on a local .env.
    ...supabaseDefines(SUPABASE_PLACEHOLDER),
    __BUILD_ID__: JSON.stringify('test'),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.mjs'],
  },
});
