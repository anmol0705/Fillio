'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { inviteUser, updateUser } from '@/actions/users';
import { cn } from '@/lib/utils';
import { UserPlus } from 'lucide-react';
import type { Profile } from '@/types';

const inviteSchema = z.object({
  email: z.string().email('Invalid email address'),
  full_name: z.string().min(1, 'Name is required').max(200),
});

type InviteFormData = z.infer<typeof inviteSchema>;

interface Props {
  initialUsers: Profile[];
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export function UsersClient({ initialUsers }: Props) {
  const [users, setUsers] = useState<Profile[]>(initialUsers);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [serverError, setServerError] = useState('');
  const [togglingId, setTogglingId] = useState<string | null>(null);

  async function toggleAttendancePermission(user: Profile) {
    setTogglingId(user.id);
    const result = await updateUser({
      id: user.id,
      can_mark_attendance: !user.can_mark_attendance,
    });
    setTogglingId(null);

    if ('error' in result) {
      toast.error(result.error);
      return;
    }

    setUsers((prev) => prev.map((u) => (u.id === user.id ? result.data : u)));
    toast.success(
      result.data.can_mark_attendance
        ? `${user.full_name} can now mark attendance`
        : `Attendance permission removed from ${user.full_name}`,
    );
  }

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<InviteFormData>({
    resolver: zodResolver(inviteSchema),
  });

  async function onInvite(data: InviteFormData) {
    setServerError('');
    const result = await inviteUser({ ...data, is_org_admin: false });

    if ('error' in result) {
      setServerError(result.error);
      return;
    }

    toast.success(`Invite sent to ${data.email}`);
    reset();
    setInviteOpen(false);
  }

  function handleClose() {
    reset();
    setServerError('');
    setInviteOpen(false);
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Team Members</h2>
          <p className="text-sm text-muted-foreground">
            {users.length} member{users.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button size="sm" onClick={() => setInviteOpen(true)} className="min-h-[44px]">
          <UserPlus className="w-4 h-4 mr-1.5" />
          Invite
        </Button>
      </div>

      {users.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <p className="text-sm font-medium text-muted-foreground mb-1">No team members yet</p>
          <p className="text-xs text-muted-foreground mb-4">
            Invite your colleagues to start collaborating on tasks.
          </p>
          <Button size="sm" variant="outline" onClick={() => setInviteOpen(true)}>
            <UserPlus className="w-4 h-4 mr-1.5" />
            Send First Invite
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border divide-y">
          {users.map((u) => (
            <div key={u.id} className="flex items-center gap-3 px-4 py-3">
              <Avatar className="w-8 h-8 flex-shrink-0">
                <AvatarFallback className="text-xs bg-muted">
                  {getInitials(u.full_name)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{u.full_name}</p>
                <p className="text-xs text-muted-foreground truncate">{u.email}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {u.is_org_admin && <Badge variant="secondary">Admin</Badge>}
                {!u.is_active && <Badge variant="destructive">Inactive</Badge>}
                {/* Attendance toggle — only shown for non-admins (admins already have full access) */}
                {!u.is_org_admin && u.is_active && (
                  <button
                    type="button"
                    onClick={() => toggleAttendancePermission(u)}
                    disabled={togglingId === u.id}
                    title={
                      u.can_mark_attendance
                        ? 'Remove attendance permission'
                        : 'Grant attendance permission'
                    }
                    className={cn(
                      'text-xs px-2 py-1 rounded border transition-colors min-h-[32px]',
                      u.can_mark_attendance
                        ? 'border-primary/40 bg-primary/10 text-primary hover:bg-primary/20'
                        : 'border-border text-muted-foreground hover:bg-muted',
                      togglingId === u.id && 'opacity-50 cursor-not-allowed',
                    )}
                  >
                    {togglingId === u.id ? '…' : u.can_mark_attendance ? 'Att. ✓' : 'Att.'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={inviteOpen} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Invite Team Member</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onInvite)} className="space-y-4 pt-1">
            {serverError && (
              <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
                {serverError}
              </p>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="invite-name">Full Name</Label>
              <Input
                id="invite-name"
                {...register('full_name')}
                placeholder="Rahul Sharma"
                autoFocus
              />
              {errors.full_name && (
                <p className="text-xs text-destructive">{errors.full_name.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                {...register('email')}
                type="email"
                placeholder="rahul@example.com"
              />
              {errors.email && (
                <p className="text-xs text-destructive">{errors.email.message}</p>
              )}
            </div>
            <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={isSubmitting}
                className="min-h-[44px] w-full sm:w-auto"
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting} className="min-h-[44px] w-full sm:w-auto">
                {isSubmitting ? 'Sending...' : 'Send Invite'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
