'use client';

import { useState, useTransition } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { RoleNode } from './RoleNode';
import { RoleEditor } from './RoleEditor';
import { createRole, updateRole, deleteRole, reorderRoles } from '@/actions/hierarchy';
import type { Role } from '@/types';

interface Props {
  initialRoles: Role[];
}

function getRoleDepth(role: Role, allRoles: Role[]): number {
  let depth = 0;
  let current: Role | undefined = role;
  const visited = new Set<string>();
  while (current?.parent_role_id) {
    if (visited.has(current.id)) break;
    visited.add(current.id);
    current = allRoles.find((r) => r.id === current!.parent_role_id);
    depth++;
  }
  return depth;
}

export function OrgTree({ initialRoles }: Props) {
  const [roles, setRoles] = useState<Role[]>(initialRoles);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = roles.findIndex((r) => r.id === active.id);
    const newIndex = roles.findIndex((r) => r.id === over.id);
    const reordered = arrayMove(roles, oldIndex, newIndex).map((r, i) => ({
      ...r,
      sort_order: i,
    }));

    setRoles(reordered);

    startTransition(async () => {
      const result = await reorderRoles(
        reordered.map((r) => ({ id: r.id, sort_order: r.sort_order })),
      );
      if ('error' in result) {
        toast.error(result.error);
        // Revert to old order
        setRoles(roles);
      }
    });
  }

  function handleEdit(role: Role) {
    setEditingRole(role);
    setEditorOpen(true);
  }

  async function handleDelete(id: string) {
    const role = roles.find((r) => r.id === id);
    if (
      !confirm(
        `Delete "${role?.name ?? 'this role'}"? Users assigned to it will lose their role.`,
      )
    )
      return;

    // Optimistic remove
    const prev = roles;
    setRoles((r) => r.filter((x) => x.id !== id));

    const result = await deleteRole(id);
    if ('error' in result) {
      toast.error(result.error);
      setRoles(prev);
    } else {
      toast.success('Role deleted');
    }
  }

  async function handleSave(data: { name: string; color: string }) {
    if (editingRole) {
      const result = await updateRole({ id: editingRole.id, ...data });
      if ('error' in result) throw new Error(result.error);
      setRoles((prev) =>
        prev.map((r) => (r.id === result.data.id ? result.data : r)),
      );
      toast.success('Role updated');
    } else {
      const result = await createRole({ ...data, parent_role_id: null });
      if ('error' in result) throw new Error(result.error);
      setRoles((prev) => [...prev, result.data]);
      toast.success('Role created');
    }
    setEditingRole(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Organisation Hierarchy</h2>
          <p className="text-sm text-muted-foreground">
            Drag to reorder. Hierarchy determines task assignment permissions.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setEditingRole(null);
            setEditorOpen(true);
          }}
          className="min-h-[44px]"
        >
          <Plus className="w-4 h-4 mr-1.5" />
          Add Role
        </Button>
      </div>

      {roles.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <p className="text-sm font-medium text-muted-foreground mb-1">No roles yet</p>
          <p className="text-xs text-muted-foreground mb-4">
            Create your first role to define your firm structure.
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setEditingRole(null);
              setEditorOpen(true);
            }}
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Add First Role
          </Button>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={roles.map((r) => r.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-1.5">
              {roles.map((role) => (
                <RoleNode
                  key={role.id}
                  role={role}
                  depth={getRoleDepth(role, roles)}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <RoleEditor
        open={editorOpen}
        onClose={() => {
          setEditorOpen(false);
          setEditingRole(null);
        }}
        role={editingRole}
        onSave={handleSave}
      />
    </div>
  );
}
