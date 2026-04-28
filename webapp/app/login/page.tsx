// ──────────────────────────────────────────────────────────────────────────────
// app/login/page.tsx
// Single-Director login per auth.md §1. Email/password.
// Suspense boundary required for useSearchParams in Next.js 15.
// ──────────────────────────────────────────────────────────────────────────────

import { Suspense } from 'react';
import { LoginForm } from './LoginForm';

export const dynamic = 'force-dynamic';

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
