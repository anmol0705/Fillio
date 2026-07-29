'use client';

import { useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { StatusBadge } from './StatusBadge';
import { PriorityBadge } from './PriorityBadge';
import { TaskTypeChip } from './TaskTypeChip';
import { format, isPast } from 'date-fns';
import { useRouter } from 'next/navigation';
import type { TaskWithRelations } from '@/types';
import { cn } from '@/lib/utils';

// Columns defined outside component for stable reference (CLAUDE.md rule)
const columns: ColumnDef<TaskWithRelations>[] = [
  {
    accessorKey: 'title',
    header: 'Task',
    cell: ({ row }) => (
      <div className="min-w-0">
        <p className="font-medium truncate max-w-[200px] sm:max-w-xs">{row.original.title}</p>
        <div className="mt-0.5">
          <TaskTypeChip type={row.original.task_type} />
        </div>
      </div>
    ),
  },
  {
    accessorKey: 'client',
    header: 'Client',
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground whitespace-nowrap">
        {row.original.client?.name ?? '—'}
      </span>
    ),
  },
  {
    accessorKey: 'assignee',
    header: 'Assignee',
    cell: ({ row }) => {
      const a = row.original.assignee;
      if (!a) return <span className="text-sm text-muted-foreground whitespace-nowrap">Unassigned</span>;
      const initials = a.full_name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();
      return (
        <div className="flex items-center gap-2 whitespace-nowrap">
          <Avatar size="sm">
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <span className="text-sm">{a.full_name}</span>
        </div>
      );
    },
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
  {
    accessorKey: 'priority',
    header: 'Priority',
    cell: ({ row }) => <PriorityBadge priority={row.original.priority} />,
  },
  {
    accessorKey: 'due_at',
    header: 'Due',
    cell: ({ row }) => {
      const due = row.original.due_at;
      if (!due) return <span className="text-sm text-muted-foreground whitespace-nowrap">—</span>;
      const isOverdue =
        isPast(new Date(due)) && row.original.status !== 'completed';
      return (
        <span
          className={cn(
            'text-sm whitespace-nowrap',
            isOverdue ? 'text-red-600 font-medium' : 'text-muted-foreground',
          )}
        >
          {format(new Date(due), 'dd MMM yy')}
          {isOverdue && ' ⚠'}
        </span>
      );
    },
  },
];

interface Props {
  data: TaskWithRelations[];
}

export function TaskTable({ data }: Props) {
  const router = useRouter();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
  });

  return (
    <div className="space-y-3">
      <input
        placeholder="Search tasks…"
        value={globalFilter}
        onChange={(e) => setGlobalFilter(e.target.value)}
        className="w-full sm:max-w-sm rounded-md border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring min-h-[44px]"
      />
      {/* Horizontal scroll wrapper prevents page-level overflow on mobile */}
      <div className="rounded-lg border overflow-x-auto">
        <Table className="min-w-[640px]">
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((h) => (
                  <TableHead
                    key={h.id}
                    className="cursor-pointer select-none whitespace-nowrap"
                    onClick={h.column.getToggleSortingHandler()}
                  >
                    {flexRender(h.column.columnDef.header, h.getContext())}
                    {h.column.getIsSorted() === 'asc'
                      ? ' ↑'
                      : h.column.getIsSorted() === 'desc'
                        ? ' ↓'
                        : ''}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="text-center text-muted-foreground py-12"
                >
                  No tasks found. Create your first task using the button above.
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer hover:bg-accent/50"
                  onClick={() => router.push(`/dashboard/tasks/${row.original.id}`)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
