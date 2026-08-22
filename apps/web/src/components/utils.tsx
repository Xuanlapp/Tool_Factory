import type { ReactNode } from 'react';

export function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

export function formatDateTime(value?: string | null) {
  if (!value) return '--';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '?' : date.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
}

export function formatPercent(current: number, total: number) {
  if (!total) return '0%';
  return `${Math.round((current / total) * 100)}%`;
}

export function SectionTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
      <div>
        <h1 className="text-[44px] font-semibold leading-tight tracking-[-0.03em] text-slate-900">{title}</h1>
        {subtitle ? <p className="mt-2 text-lg text-slate-500">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}
