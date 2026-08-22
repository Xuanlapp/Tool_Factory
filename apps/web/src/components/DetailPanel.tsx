import type { ReactNode } from 'react';

export function DetailPanel({ title, children }: { title: string; children: ReactNode }) {
  return <aside className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_12px_40px_rgba(15,23,42,0.04)]"><h3 className="mb-4 text-[18px] font-semibold text-slate-900">{title}</h3>{children}</aside>;
}
