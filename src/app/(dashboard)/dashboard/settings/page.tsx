import { getCurrentUser } from '@/lib/auth/getUser';
import { redirect } from 'next/navigation';
import { db } from '@/db';
import { profiles } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { ChangePasswordForm } from '@/components/settings/ChangePasswordForm';

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.id, user.id),
    columns: { full_name: true, email: true, user_code: true },
  });

  if (!profile) redirect('/login');

  const isInternalAccount = profile.email.endsWith('@filio.internal');

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-10">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage your account preferences.</p>
      </div>

      {/* Account info */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold">Account</h2>
        <div className="rounded-lg border bg-card p-4 space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Name</span>
            <span className="font-medium">{profile.full_name}</span>
          </div>
          {profile.user_code && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">User ID</span>
              <span className="font-mono font-medium">{profile.user_code}</span>
            </div>
          )}
          {!isInternalAccount && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Email</span>
              <span className="font-medium">{profile.email}</span>
            </div>
          )}
        </div>
      </section>

      {/* Change password */}
      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold">Change password</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isInternalAccount
              ? 'Enter your current password to set a new one.'
              : 'Enter your current password to set a new one. Does not affect magic link sign-in.'}
          </p>
        </div>
        <ChangePasswordForm />
      </section>
    </div>
  );
}
