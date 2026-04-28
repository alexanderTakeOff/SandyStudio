// ──────────────────────────────────────────────────────────────────────────────
// vitest.config.ts
// Phase 4 unit-test configuration. Pure node — no jsdom, no Next.js runtime.
// Tests live under __tests__/ and never touch a real Supabase or Inngest server.
// ──────────────────────────────────────────────────────────────────────────────

import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      // Mirror tsconfig.json `paths` so `@/lib/...` imports resolve in tests too.
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
    globals: false, // explicit imports from 'vitest'
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['lib/**/*.ts'],
      exclude: ['lib/supabase/types.gen.ts', 'lib/uiux/**'],
    },
  },
});
