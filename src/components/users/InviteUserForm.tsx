'use client';

import { useTransition, useState } from 'react';
import { inviteUser } from '@/actions/users';

interface Props {
  onSuccess: () => void;
}

// InviteUserForm is a Client Component — it runs in the browser and handles
// the interactive invite form. It calls the server action directly; Next.js
// serialises the call over the network automatically.
export function InviteUserForm({ onSuccess }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const form = e.currentTarget;
    const data = {
      email: (form.elements.namedItem('email') as HTMLInputElement).value.trim(),
      full_name: (form.elements.namedItem('full_name') as HTMLInputElement).value.trim(),
      is_org_admin: (form.elements.namedItem('is_org_admin') as HTMLInputElement).checked,
      can_mark_attendance: (form.elements.namedItem('can_mark_attendance') as HTMLInputElement).checked,
    };

    // useTransition marks the period while the server action is running.
    // isPending becomes true immediately and goes false when the action resolves.
    startTransition(async () => {
      const result = await inviteUser(data);
      if ('error' in result) {
        setError(result.error);
      } else {
        setSuccess(true);
        setTimeout(onSuccess, 1200);
      }
    });
  }

  if (success) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800 px-4 py-3">
        <p className="text-sm font-medium text-green-800 dark:text-green-300">
          Invite sent! They will receive an email with a link to set their password.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      <div className="space-y-1.5">
        <label htmlFor="full_name" className="text-sm font-medium text-foreground">
          Full Name
        </label>
        <input
          id="full_name"
          name="full_name"
          type="text"
          required
          minLength={2}
          placeholder="e.g. Priya Sharma"
          className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring min-h-[44px]"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="email" className="text-sm font-medium text-foreground">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          placeholder="priya@yourfirm.com"
          className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring min-h-[44px]"
        />
      </div>

      <div className="space-y-3 pt-1">
        <label className="text-sm font-medium text-foreground">Permissions</label>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            name="is_org_admin"
            type="checkbox"
            className="mt-0.5 h-4 w-4 rounded border-input accent-primary"
          />
          <div>
            <p className="text-sm font-medium text-foreground">Org Admin</p>
            <p className="text-xs text-muted-foreground">
              Can invite users, manage settings, and see all tasks
            </p>
          </div>
        </label>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            name="can_mark_attendance"
            type="checkbox"
            className="mt-0.5 h-4 w-4 rounded border-input accent-primary"
          />
          <div>
            <p className="text-sm font-medium text-foreground">Mark Attendance</p>
            <p className="text-xs text-muted-foreground">
              Can mark and edit attendance for the whole team
            </p>
          </div>
        </label>
      </div>

      <div className="pt-2 flex gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="flex-1 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-h-[44px]"
        >
          {isPending ? 'Sending invite…' : 'Send invite'}
        </button>
      </div>
    </form>
  );
}
