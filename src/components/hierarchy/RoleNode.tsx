'use client';

import { GripVertical, Pencil, Trash2 } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Role } from '@/types';

interface Props {
  role: Role;
  depth: number;
  onEdit: (role: Role) => void;
  onDelete: (id: string) => void;
}

export function RoleNode({ role, depth, onEdit, onDelete }: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: role.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, paddingLeft: `${depth * 24 + 12}px` }}
      className="flex items-center gap-3 pr-3 py-2.5 rounded-lg border bg-card hover:bg-accent/40 group transition-colors"
    >
      <button
        {...attributes}
        {...listeners}
        className="text-muted-foreground cursor-grab active:cursor-grabbing flex-shrink-0"
        type="button"
        aria-label="Drag to reorder"
      >
        <GripVertical className="w-4 h-4" />
      </button>

      <div
        className="w-3 h-3 rounded-full flex-shrink-0 ring-1 ring-black/10"
        style={{ backgroundColor: role.color }}
      />

      <span className="flex-1 text-sm font-medium truncate">{role.name}</span>

      {/* Always visible on mobile (touch has no hover state); fades on desktop unless hovered */}
      <div className="flex gap-1 flex-shrink-0 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={() => onEdit(role)}
          className="p-2 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
          aria-label={`Edit ${role.name}`}
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onDelete(role.id)}
          className="p-2 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
          aria-label={`Delete ${role.name}`}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
