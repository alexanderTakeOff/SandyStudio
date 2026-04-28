// ──────────────────────────────────────────────────────────────────────────────
// app/login/page.tsx
// Single-Director login per auth.md §1. Email/password.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') ?? '/';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) {
      setError(err.message);
      setSubmitting(false);
      return;
    }
    router.replace(next);
    router.refresh();
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Director sign-in</CardTitle>
        </CardHeader>
        <CardBody>
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="block text-xs uppercase tracking-wider text-text-muted mb-1.5">
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-10 px-3 rounded-lg bg-[var(--bg-elevated)] border border-glass text-sm text-text-primary focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-text-muted mb-1.5">
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-10 px-3 rounded-lg bg-[var(--bg-elevated)] border border-glass text-sm text-text-primary focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>
            {error && (
              <p className="text-sm text-[var(--accent-danger)]" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? 'Signing in…' : 'Sign in'}
            </Button>
            <p className="text-xs text-text-muted text-center pt-2">
              Director account must be created in Supabase Dashboard → Authentication → Users.
            </p>
          </form>
        </CardBody>
      </Card>
    </main>
  );
}
