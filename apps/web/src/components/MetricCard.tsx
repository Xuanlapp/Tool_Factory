import type { LucideIcon } from 'lucide-react';
import { cn } from './utils';

const toneMap = {
  blue: 'text-blue-600 border-blue-100 bg-blue-50',
  green: 'text-emerald-600 border-emerald-100 bg-emerald-50',
  orange: 'text-amber-600 border-amber-100 bg-amber-50',
  red: 'text-rose-600 border-rose-100 bg-rose-50',
  violet: 'text-violet-600 border-violet-100 bg-violet-50',
};

export function MetricCard({ icon: Icon, label, value, tone = 'blue', hint }: { icon: LucideIcon; label: string; value: string | number; tone?: keyof typeof toneMap; hint?: string }) {
  return (
    <article className="rounded-[26px] border border-slate-200 bg-white px-5 py-4 shadow-[0_12px_40px_rgba(15,23,42,0.04)]">
      <div className="flex items-start gap-4">
        <div className={cn('flex h-16 w-16 items-center justify-center rounded-2xl border', toneMap[tone])}>
          <Icon className="h-8 w-8" strokeWidth={1.8} />
        </div>
        <div>
          <div className="text-[15px] text-slate-500">{label}</div>
          <div className={cn('mt-1 text-[26px] font-semibold tracking-[-0.02em]', tone === 'red' ? 'text-rose-500' : tone === 'green' ? 'text-emerald-600' : tone === 'orange' ? 'text-amber-500' : tone === 'violet' ? 'text-violet-600' : 'text-blue-600')}>{value}</div>
          {hint ? <div className="mt-1 text-sm text-slate-400">{hint}</div> : null}
        </div>
      </div>
    </article>
  );
}
