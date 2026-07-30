'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createRole, updateRole, deleteRole } from '@/actions/roles';
import type { Role } from '@/types';

const PALETTE = [
  '#6B7280', '#3B82F6', '#10B981', '#F59E0B',
  '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6',
];

interface Props {
  initialRoles: Role[];
}

export function RolesManager({ initialRoles }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [roles, setRoles] = useState<Role[]>(initialRoles);

  const [showCreate, setShowCreate]   = useState(false);
  const [newName, setNewName]         = useState('');
  const [newColour, setNewColour]     = useState(PALETTE[0]);
  const [createError, setCreateError] = useState<string | null>(null);

  const [editingId, setEditingId]   = useState<string | null>(null);
  const [editName, setEditName]     = useState('');
  const [editColour, setEditColour] = useState('');
  const [editError, setEditError]   = useState<string | null>(null);

  const [actionError, setActionError] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Create — append returned Role to local state immediately; no refresh needed
  // ---------------------------------------------------------------------------

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    const result = await createRole({ name: newName.trim(), colour: newColour });
    if ('error' in result) {
      setCreateError(result.error);
      return;
    }
    setRoles((prev) => [...prev, result.data]);
    setNewName('');
    setNewColour(PALETTE[0]);
    setShowCreate(false);
  }

  // ---------------------------------------------------------------------------
  // Edit — patch local state with the values we sent; no refresh needed
  // ---------------------------------------------------------------------------

  function startEdit(role: Role) {
    setEditingId(role.id);
    setEditName(role.name);
    setEditColour(role.colour);
    setEditError(null);
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    setEditError(null);
    const result = await updateRole({ roleId: editingId, name: editName.trim(), colour: editColour });
    if ('error' in result) {
      setEditError(result.error);
      return;
    }
    setRoles((prev) =>
      prev.map((r) =>
        r.id === editingId ? { ...r, name: editName.trim(), colour: editColour } : r
      )
    );
    setEditingId(null);
  }

  // ---------------------------------------------------------------------------
  // Delete — remove from local state; role.id drives the sidebar user-count
  // badge so also refresh that page's server component in the background
  // ---------------------------------------------------------------------------

  async function handleDelete(role: Role) {
    if (!confirm(`Delete role "${role.name}"? This cannot be undone.`)) return;
    setActionError(null);
    const result = await deleteRole(role.id);
    if ('error' in result) {
      setActionError(result.error);
      return;
    }
    setRoles((prev) => prev.filter((r) => r.id !== role.id));
    // Refresh in background so users page role dropdown reflects the deletion
    startTransition(() => router.refresh());
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Roles</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Define the job titles in your firm. Assign them to team members from the Users page.
          </p>
        </div>
        <button
          onClick={() => { setShowCreate(true); setCreateError(null); }}
          className="rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors min-h-[44px] shrink-0"
        >
          Add role
        </button>
      </div>

      {actionError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
          <p className="text-sm text-destructive">{actionError}</p>
        </div>
      )}

      {showCreate && (
        <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-4">
          <p className="text-sm font-medium text-foreground">New role</p>
          <form onSubmit={handleCreate} className="space-y-4">
            {createError && <p className="text-sm text-destructive">{createError}</p>}
            <div className="flex flex-wrap gap-3 items-end">
              <div className="space-y-1.5 flex-1 min-w-[160px]">
                <label htmlFor="new-role-name" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Name
                </label>
                <input
                  id="new-role-name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Partner"
                  required
                  className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring min-h-[44px]"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Colour
                </label>
                <ColourPicker value={newColour} onChange={setNewColour} />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={isPending}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors min-h-[40px]"
              >
                Create
              </button>
              <button
                type="button"
                onClick={() => { setShowCreate(false); setNewName(''); setCreateError(null); }}
                className="rounded-md border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors min-h-[40px]"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {roles.length === 0 && !showCreate ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">No roles yet.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Add roles like Partner, Manager, Article Assistant to organise your team.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
          {roles.map((role) =>
            editingId === role.id ? (
              <div key={role.id} className="px-4 py-3 bg-muted/20">
                <form onSubmit={handleUpdate} className="flex flex-wrap gap-3 items-end">
                  {editError && <p className="w-full text-sm text-destructive">{editError}</p>}
                  <div className="flex-1 min-w-[160px]">
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      required
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring min-h-[40px]"
                    />
                  </div>
                  <ColourPicker value={editColour} onChange={setEditColour} />
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={isPending}
                      className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 min-h-[40px]"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="rounded-md border border-border px-3 py-2 text-sm text-muted-foreground hover:text-foreground min-h-[40px]"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              <div key={role.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors">
                <span className="w-3 h-3 rounded-full shrink-0 ring-1 ring-black/10" style={{ backgroundColor: role.colour }} />
                <span className="flex-1 text-sm font-medium text-foreground">{role.name}</span>
                <div className="flex gap-3">
                  <button onClick={() => startEdit(role)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(role)}
                    disabled={isPending}
                    className="text-xs text-destructive hover:underline disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

function ColourPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {PALETTE.map((colour) => (
        <button
          key={colour}
          type="button"
          onClick={() => onChange(colour)}
          title={colour}
          className="w-7 h-7 rounded-full transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
          style={{
            backgroundColor: colour,
            outline: value === colour ? `2px solid ${colour}` : undefined,
            outlineOffset: value === colour ? '2px' : undefined,
          }}
        />
      ))}
    </div>
  );
}
