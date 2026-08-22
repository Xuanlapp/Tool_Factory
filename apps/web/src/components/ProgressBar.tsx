import { cn } from './utils';

export function ProgressBar({ value, max, color = 'blue' }: { value: number; max: number; color?: 'blue' | 'green' | 'orange' }) {
  const width = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
      <div className={cn('h-full rounded-full', color === 'green' ? 'bg-emerald-500' : color === 'orange' ? 'bg-amber-500' : 'bg-blue-600')} style={{ width: `${width}%` }} />
    </div>
  );
}
