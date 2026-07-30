import type { TaskType } from '@/types';

const TYPE_LABELS: Record<TaskType, string> = {
  gst:        'GST',
  tds:        'TDS',
  income_tax: 'Income Tax',
  audit:      'Audit',
  roc_mca:    'ROC / MCA',
  accounting: 'Accounting',
  payroll:    'Payroll',
  notice:     'Notice',
  advisory:   'Advisory',
  other:      'Other',
};

export function TaskTypeChip({ type }: { type: TaskType }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200">
      {TYPE_LABELS[type]}
    </span>
  );
}
