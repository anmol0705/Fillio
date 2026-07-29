'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { signInWithPassword, signInWithMagicLink } from '@/lib/auth/signIn';

function LoginForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'password' | 'magic'>('password');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [magicSent, setMagicSent] = useState(false);

  useEffect(() => {
    if (searchParams.get('error') === 'no_profile') {
      setError(
        'Your account has not been set up yet. Please contact your administrator.'
      );
    }
  }, [searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (mode === 'password') {
      const result = await signInWithPassword(email, password);
      if (!result.success) {
        setError(result.error);
        setLoading(false);
        return;
      }
      router.push('/dashboard');
      router.refresh();
    } else {
      const result = await signInWithMagicLink(email);
      if (!result.success) {
        setError(result.error);
        setLoading(false);
        return;
      }
      setMagicSent(true);
      setLoading(false);
    }
  }

  if (magicSent) {
    return (
      <div className="text-center">
        <h2 className="text-xl font-semibold mb-2">Check your email</h2>
        <p className="text-sm text-muted-foreground">
          We sent a magic link to <strong>{email}</strong>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Sign in to Filio</h1>
        <p className="text-sm text-muted-foreground mt-1">CA firm work management</p>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Mode toggle */}
      <div className="flex gap-2 text-sm">
        <button
          type="button"
          onClick={() => setMode('password')}
          className={`px-4 py-2.5 rounded-md transition-colors min-h-[44px] font-medium ${
            mode === 'password'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent'
          }`}
        >
          Password
        </button>
        <button
          type="button"
          onClick={() => setMode('magic')}
          className={`px-4 py-2.5 rounded-md transition-colors min-h-[44px] font-medium ${
            mode === 'magic'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent'
          }`}
        >
          Magic link
        </button>
      </div>

      <div className="space-y-3">
        <input
          type="email"
          placeholder="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full rounded-md border border-input bg-background px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-ring min-h-[48px]"
        />
        {mode === 'password' && (
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full rounded-md border border-input bg-background px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-ring min-h-[48px]"
          />
        )}
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors min-h-[48px]"
      >
        {loading
          ? 'Signing in…'
          : mode === 'password'
          ? 'Sign in'
          : 'Send magic link'}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 sm:p-8 shadow-sm">
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
