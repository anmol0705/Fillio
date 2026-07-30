'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
} from '@tanstack/react-table';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { StatusBadge } from './StatusBadge';
import { PriorityBadge } from './PriorityBadge';
import { TaskTypeChip } from './TaskTypeChip';
import { deleteTask } from '@/actions/tasks';
import type { TaskListItem } from '@/types';

interface Props {
  tasks:    TaskListItem[];
  onRemove: (id: string) => void;
}

export function TasksTable({ tasks, onRemove }: Props) {
  const [globalFilter, setGlobalFilter] = useState('');
  const [isPending, startTransition]    = useTransition();

  const columns: ColumnDef<TaskListItem>[] = [
    {
      accessorKey: 'title',
      header: 'Title',
      cell: ({ row }) => (
        <Link href={`/dashboard/tasks/${row.original.id}`} className="font-medium text-primary hover:underline line-clamp-1">
          {row.original.title}
        </Link>
      ),
    },
    {
      accessorKey: 'type',
      header: 'Type',
      cell: ({ getValue }) => <TaskTypeChip type={getValue() as TaskListItem['type']} />,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ getValue }) => <StatusBadge status={getValue() as TaskListItem['status']} />,
    },
    {
      accessorKey: 'priority',
      header: 'Priority',
      cell: ({ getValue }) => <PriorityBadge priority={getValue() as TaskListItem['priority']} />,
    },
    {
      accessorKey: 'assignee',
      header: 'Assignee',
      cell: ({ getValue }) => {
        const a = getValue() as TaskListItem['assignee'];
        return <span className="text-sm">{a?.full_name ?? '—'}</span>;
      },
    },
    {
      accessorKey: 'client',
      header: 'Client',
      cell: ({ getValue }) => {
        const c = getValue() as TaskListItem['client'];
        return <span className="text-sm text-muted-foreground">{c?.name ?? '—'}</span>;
      },
    },
    {
      accessorKey: 'due_at',
      header: 'Due',
      cell: ({ getValue }) => {
        const d = getValue() as Date | null;
        if (!d) return <span className="text-muted-foreground text-sm">—</span>;
        const past = new Date(d) < new Date();
        return (
          <span className={`text-sm ${past ? 'text-red-600 font-medium' : ''}`}>
            {new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
          </span>
        );
      },
    },
    {
      id: 'actions',
      cell: ({ row }) => {
        const task = row.original;
        if (task.my_access !== 'owner') return null;
        return (
          <Button
            variant="ghost"
            size="sm"
            className="text-red-600 hover:text-red-700"
            disabled={isPending}
            onClick={() => {
              if (!confirm('Delete this task?')) return;
              // Remove from UI immediately, then call server
              onRemove(task.id);
              startTransition(async () => {
                const res = await deleteTask(task.id);
                if ('error' in res) {
                  // Can't easily un-remove from list here since parent owns state.
                  // A toast would be ideal, but for now alert is fine.
                  alert(res.error);
                }
              });
            }}
          >
            Delete
          </Button>
        );
      },
    },
  ];

  const table = useReactTable({
    data:                 tasks,
    columns,
    state:                { globalFilter },
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel:      getCoreRowModel(),
    getFilteredRowModel:  getFilteredRowModel(),
    getSortedRowModel:    getSortedRowModel(),
  });

  return (
    <div className="space-y-3">
      <Input
        placeholder="Search tasks…"
        value={globalFilter}
        onChange={(e) => setGlobalFilter(e.target.value)}
        className="max-w-xs"
      />

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((h) => (
                  <TableHead key={h.id}>
                    {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center text-muted-foreground py-8">
                  No tasks found.
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
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
