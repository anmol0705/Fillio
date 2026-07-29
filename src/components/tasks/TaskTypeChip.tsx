import type { Task } from '@/types';

const TYPE_CONFIG: Record<Task['task_type'], { label: string; color: string }> = {
  gst: { label: 'GST', color: '#0D9488' },
  tds: { label: 'TDS', color: '#2563EB' },
  income_tax: { label: 'Income Tax', color: '#4338CA' },
  audit: { label: 'Audit', color: '#D97706' },
  roc_mca: { label: 'ROC/MCA', color: '#7C3AED' },
  accounting: { label: 'Accounting', color: '#6B7280' },
  payroll: { label: 'Payroll', color: '#EA580C' },
  notice: { label: 'Notice', color: '#DC2626' },
  advisory: { label: 'Advisory', color: '#0284C7' },
  other: { label: 'Other', color: '#64748B' },
};

export function TaskTypeChip({ type }: { type: Task['task_type'] }) {
  const config = TYPE_CONFIG[type];
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium text-white"
      style={{ backgroundColor: config.color }}
    >
      {config.label}
    </span>
  );
}
