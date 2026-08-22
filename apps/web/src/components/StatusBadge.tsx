import { cn } from './utils';

const toneMap = {
  blue: 'border-blue-200 bg-blue-50 text-blue-700',
  green: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  orange: 'border-amber-200 bg-amber-50 text-amber-700',
  red: 'border-rose-200 bg-rose-50 text-rose-700',
  slate: 'border-slate-200 bg-slate-50 text-slate-600',
};

export function StatusBadge({ label, tone = 'slate' }: { label: string; tone?: keyof typeof toneMap }) {
  return <span className={cn('inline-flex items-center rounded-xl border px-3 py-1 text-sm font-medium', toneMap[tone])}>{label}</span>;
}
