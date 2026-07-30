'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deactivateUser, updateUser } from '@/actions/users';
import { InviteUserForm } from './InviteUserForm';
import type { Profile, Role } from '@/types';

interface Props {
  users: Profile[];
  roles: Role[];
  currentUserId: string;
}

export function UsersTable({ users, roles, currentUserId }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showInvite, setShowInvite] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  function refresh() {
    startTransition(() => router.refresh());
  }

  // Build a quick lookup: role id → role (for rendering the coloured dot)
  const roleMap = new Map(roles.map((r) => [r.id, r]));

  async function handleDeactivate(userId: string, name: string) {
    if (!confirm(`Deactivate ${name}? They will no longer be able to log in.`)) return;
    setActionError(null);
    const result = await deactivateUser(userId);
    if ('error' in result) setActionError(result.error);
    else refresh();
  }

  async function handleToggleAdmin(user: Profile) {
    setActionError(null);
    const result = await updateUser({ userId: user.id, is_org_admin: !user.is_org_admin });
    if ('error' in result) setActionError(result.error);
    else refresh();
  }

  async function handleToggleAttendance(user: Profile) {
    setActionError(null);
    const result = await updateUser({ userId: user.id, can_mark_attendance: !user.can_mark_attendance });
    if ('error' in result) setActionError(result.error);
    else refresh();
  }

  async function handleRoleChange(user: Profile, roleId: string) {
    setActionError(null);
    // Empty string means "unassign" — we send null to the server
    const result = await updateUser({ userId: user.id, role_id: roleId === '' ? null : roleId });
    if ('error' in result) setActionError(result.error);
    else refresh();
  }

  const active = users.filter((u) => u.is_active);
  const inactive = users.filter((u) => !u.is_active);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Team Members</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {active.length} active member{active.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => setShowInvite(true)}
          className="rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors min-h-[44px]"
        >
          Invite member
        </button>
      </div>

      {/* Invite modal */}
      {showInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-background shadow-lg p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-foreground">Invite team member</h2>
              <button
                onClick={() => setShowInvite(false)}
                className="text-muted-foreground hover:text-foreground text-xl leading-none"
              >
                ×
              </button>
            </div>
            <InviteUserForm onSuccess={() => { setShowInvite(false); refresh(); }} />
          </div>
        </div>
      )}

      {/* Error banner */}
      {actionError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
          <p className="text-sm text-destructive">{actionError}</p>
        </div>
      )}

      {/* Active users table */}
      <div className="rounded-lg border border-border overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="bg-muted/40 border-b border-border">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Name</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Email</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Role</th>
              <th className="text-center px-4 py-3 font-medium text-muted-foreground">Admin</th>
              <th className="text-center px-4 py-3 font-medium text-muted-foreground">Attendance</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {active.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center px-4 py-8 text-muted-foreground">
                  No active members
                </td>
              </tr>
            )}
            {active.map((user) => {
              const assignedRole = user.role_id ? roleMap.get(user.role_id) : null;
              return (
                <tr key={user.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground">
                    {user.full_name}
                    {user.id === currentUserId && (
                      <span className="ml-2 text-xs text-muted-foreground font-normal">(you)</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{user.email}</td>

                  {/* Role dropdown */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {assignedRole && (
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: assignedRole.colour }}
                        />
                      )}
                      <select
                        value={user.role_id ?? ''}
                        onChange={(e) => handleRoleChange(user, e.target.value)}
                        disabled={isPending}
                        className="rounded border border-input bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 max-w-[140px]"
                      >
                        <option value="">— no role —</option>
                        {roles.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </td>

                  {/* Admin toggle */}
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleToggleAdmin(user)}
                      disabled={isPending}
                      title={user.is_org_admin ? 'Revoke admin' : 'Grant admin'}
                      className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold transition-colors disabled:opacity-50 ${
                        user.is_org_admin
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground hover:bg-muted/80'
                      }`}
                    >
                      {user.is_org_admin ? '✓' : '–'}
                    </button>
                  </td>

                  {/* Attendance toggle */}
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleToggleAttendance(user)}
                      disabled={isPending}
                      title={user.can_mark_attendance ? 'Revoke' : 'Grant'}
                      className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold transition-colors disabled:opacity-50 ${
                        user.can_mark_attendance
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground hover:bg-muted/80'
                      }`}
                    >
                      {user.can_mark_attendance ? '✓' : '–'}
                    </button>
                  </td>

                  <td className="px-4 py-3 text-right">
                    {user.id !== currentUserId && (
                      <button
                        onClick={() => handleDeactivate(user.id, user.full_name)}
                        disabled={isPending}
                        className="text-xs text-destructive hover:underline disabled:opacity-50"
                      >
                        Deactivate
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Inactive users */}
      {inactive.length > 0 && (
        <details className="group">
          <summary className="text-sm text-muted-foreground cursor-pointer select-none list-none flex items-center gap-1.5">
            <span className="group-open:rotate-90 transition-transform inline-block">›</span>
            {inactive.length} deactivated member{inactive.length !== 1 ? 's' : ''}
          </summary>
          <div className="mt-3 rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-border">
                {inactive.map((user) => (
                  <tr key={user.id} className="opacity-50">
                    <td className="px-4 py-3 font-medium text-foreground line-through">{user.full_name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{user.email}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}
