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
    // Dummy env so modules that validate env at import time (lib/env.ts
    // PUBLIC_ENV, pulled in transitively via lib/concierge/llm.ts etc.) don't
    // throw under vitest. Tests never touch a real Supabase/Inngest server.
    env: {
      NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
      NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    },
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
