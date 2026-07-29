'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Role } from '@/types';

const PRESET_COLORS = [
  '#7C3AED',
  '#2563EB',
  '#059669',
  '#D97706',
  '#DC2626',
  '#6B7280',
  '#0891B2',
  '#0F2D52',
];

const schema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Invalid color'),
});

type FormData = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onClose: () => void;
  role?: Role | null;
  onSave: (data: { name: string; color: string }) => Promise<void>;
}

export function RoleEditor({ open, onClose, role, onSave }: Props) {
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState('');

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: role?.name ?? '',
      color: role?.color ?? '#6366f1',
    },
  });

  // Reset form values whenever the dialog opens with a different role
  const selectedColor = watch('color');

  async function onSubmit(data: FormData) {
    setSaving(true);
    setServerError('');
    try {
      await onSave(data);
      reset();
      onClose();
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSaving(false);
    }
  }

  function handleClose() {
    reset();
    setServerError('');
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{role ? 'Edit Role' : 'Create Role'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-1">
          {serverError && (
            <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
              {serverError}
            </p>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="role-name">Role Name</Label>
            <Input
              id="role-name"
              {...register('name')}
              placeholder="e.g. Senior Manager"
              autoFocus
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Colour</Label>
            <div className="flex gap-2 flex-wrap items-center">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setValue('color', c)}
                  className="w-7 h-7 rounded-full border-2 transition-all hover:scale-110"
                  style={{
                    backgroundColor: c,
                    borderColor: selectedColor === c ? '#000' : 'transparent',
                    outline: selectedColor === c ? '2px solid #fff' : 'none',
                    outlineOffset: '-3px',
                  }}
                  aria-label={`Select colour ${c}`}
                />
              ))}
              <input
                type="color"
                value={selectedColor}
                onChange={(e) => setValue('color', e.target.value)}
                className="w-7 h-7 rounded cursor-pointer border border-border"
                aria-label="Custom colour"
              />
            </div>
            {errors.color && (
              <p className="text-xs text-destructive">{errors.color.message}</p>
            )}
          </div>

          <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
            <Button type="button" variant="outline" onClick={handleClose} disabled={saving} className="min-h-[44px] w-full sm:w-auto">
              Cancel
            </Button>
            <Button type="submit" disabled={saving} className="min-h-[44px] w-full sm:w-auto">
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
