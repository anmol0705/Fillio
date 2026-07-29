'use client';

import { useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
} from '@tanstack/react-table';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Plus } from 'lucide-react';
import { createClient } from '@/actions/clients';
import type { Client } from '@/types';

// Columns defined outside component for stable reference (TanStack Table rule)
const columns: ColumnDef<Client>[] = [
  {
    accessorKey: 'name',
    header: 'Client Name',
    cell: ({ row }) => (
      <span className="font-medium">{row.getValue<string>('name')}</span>
    ),
  },
  {
    accessorKey: 'pan',
    header: 'PAN',
    cell: ({ row }) => (
      <span className="font-mono text-xs text-muted-foreground">
        {row.getValue<string | null>('pan') ?? '—'}
      </span>
    ),
  },
  {
    accessorKey: 'gstin',
    header: 'GSTIN',
    cell: ({ row }) => (
      <span className="font-mono text-xs text-muted-foreground">
        {row.getValue<string | null>('gstin') ?? '—'}
      </span>
    ),
  },
  {
    accessorKey: 'contact_email',
    header: 'Email',
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">
        {row.getValue<string | null>('contact_email') ?? '—'}
      </span>
    ),
  },
  {
    accessorKey: 'contact_phone',
    header: 'Phone',
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">
        {row.getValue<string | null>('contact_phone') ?? '—'}
      </span>
    ),
  },
];

// Form schema — all optional fields are strings so native inputs work cleanly
const clientFormSchema = z.object({
  name: z.string().min(1, 'Client name is required').max(200),
  pan: z.string().max(10).optional(),
  gstin: z.string().max(15).optional(),
  contact_email: z.string().email('Invalid email').optional().or(z.literal('')),
  contact_phone: z.string().max(15).optional(),
});

type FormData = z.infer<typeof clientFormSchema>;

interface Props {
  initialClients: Client[];
}

export function ClientsClient({ initialClients }: Props) {
  const [data, setData] = useState<Client[]>(initialClients);
  const [createOpen, setCreateOpen] = useState(false);
  const [globalFilter, setGlobalFilter] = useState('');
  const [serverError, setServerError] = useState('');

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    state: { globalFilter },
    onGlobalFilterChange: setGlobalFilter,
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(clientFormSchema),
  });

  async function onSubmit(formData: FormData) {
    setServerError('');
    const result = await createClient({
      name: formData.name,
      pan: formData.pan || null,
      gstin: formData.gstin || null,
      contact_email: formData.contact_email || null,
      contact_phone: formData.contact_phone || null,
    });

    if ('error' in result) {
      setServerError(result.error);
      return;
    }

    setData((prev) => [...prev, result.data]);
    toast.success(`Client "${result.data.name}" added`);
    reset();
    setCreateOpen(false);
  }

  function handleClose() {
    reset();
    setServerError('');
    setCreateOpen(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Clients</h2>
          <p className="text-sm text-muted-foreground">
            {data.length} client{data.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)} className="min-h-[44px]">
          <Plus className="w-4 h-4 mr-1.5" />
          Add Client
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <Input
          placeholder="Search by name, PAN or GSTIN..."
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          className="w-full sm:max-w-sm min-h-[44px]"
        />
      </div>

      {/* overflow-x-auto prevents page-level horizontal scroll on mobile */}
      <div className="rounded-lg border overflow-x-auto">
        <Table className="min-w-[560px]">
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((h) => (
                  <TableHead key={h.id}>
                    {flexRender(h.column.columnDef.header, h.getContext())}
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
                  {globalFilter
                    ? `No clients match "${globalFilter}"`
                    : 'No clients yet — add your first client above'}
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

      <Dialog open={createOpen} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Client</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-1">
            {serverError && (
              <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
                {serverError}
              </p>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="client-name">Client Name *</Label>
              <Input
                id="client-name"
                {...register('name')}
                placeholder="Rajesh Textiles Pvt Ltd"
                autoFocus
              />
              {errors.name && (
                <p className="text-xs text-destructive">{errors.name.message}</p>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="client-pan">PAN</Label>
                <Input
                  id="client-pan"
                  {...register('pan')}
                  placeholder="AABCT1234F"
                  className="font-mono uppercase"
                />
                {errors.pan && (
                  <p className="text-xs text-destructive">{errors.pan.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="client-gstin">GSTIN</Label>
                <Input
                  id="client-gstin"
                  {...register('gstin')}
                  placeholder="27AABCT1234F1Z5"
                  className="font-mono uppercase"
                />
                {errors.gstin && (
                  <p className="text-xs text-destructive">{errors.gstin.message}</p>
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="client-email">Contact Email</Label>
              <Input
                id="client-email"
                {...register('contact_email')}
                type="email"
                placeholder="contact@client.com"
              />
              {errors.contact_email && (
                <p className="text-xs text-destructive">{errors.contact_email.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="client-phone">Contact Phone</Label>
              <Input
                id="client-phone"
                {...register('contact_phone')}
                placeholder="+91 98765 43210"
              />
              {errors.contact_phone && (
                <p className="text-xs text-destructive">{errors.contact_phone.message}</p>
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
                {isSubmitting ? 'Adding...' : 'Add Client'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
