import type { ReactNode } from 'react';

export function Panel({ title, right, children, className = '' }: { title?: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_12px_40px_rgba(15,23,42,0.04)] ${className}`}>
      {title || right ? (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title ? <h3 className="text-[18px] font-semibold text-slate-900">{title}</h3> : <div />}
          {right}
        </div>
      ) : null}
      {children}
    </section>
  );
}
