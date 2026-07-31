'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function ChangePasswordForm() {
  const [current,   setCurrent]   = useState('');
  const [next,      setNext]      = useState('');
  const [confirm,   setConfirm]   = useState('');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [success,   setSuccess]   = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setSuccess(false);

    if (next !== confirm) { setError('Passwords do not match.'); return; }
    if (next.length < 8)  { setError('Password must be at least 8 characters.'); return; }

    setLoading(true);
    const supabase = createClient();

    // Re-authenticate first to verify current password
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) { setError('Not authenticated.'); setLoading(false); return; }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email:    user.email,
      password: current,
    });

    if (signInError) {
      setError('Current password is incorrect.');
      setLoading(false);
      return;
    }

    // Now update to the new password
    const { error: updateError } = await supabase.auth.updateUser({ password: next });

    if (updateError) {
      setError(updateError.message);
    } else {
      setSuccess(true);
      setCurrent(''); setNext(''); setConfirm('');
    }

    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-sm">
      {error && (
        <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2.5 text-sm text-destructive">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-md bg-green-500/10 border border-green-500/20 px-3 py-2.5 text-sm text-green-600 dark:text-green-400">
          Password changed successfully.
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="current">Current password</Label>
        <Input
          id="current"
          type="password"
          value={current}
          onChange={e => setCurrent(e.target.value)}
          required
          autoComplete="current-password"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="next">New password</Label>
        <Input
          id="next"
          type="password"
          value={next}
          onChange={e => setNext(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
        />
        <p className="text-xs text-muted-foreground">Minimum 8 characters.</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="confirm">Confirm new password</Label>
        <Input
          id="confirm"
          type="password"
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          required
          autoComplete="new-password"
        />
      </div>

      <Button type="submit" disabled={loading} className="w-full">
        {loading ? 'Updating…' : 'Change password'}
      </Button>
    </form>
  );
}
