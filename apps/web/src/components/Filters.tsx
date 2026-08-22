import type { ChangeEventHandler, ReactNode } from 'react';

export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-3">{children}</div>;
}

export function FilterInput({ placeholder, value, onChange }: { placeholder: string; value?: string; onChange?: ChangeEventHandler<HTMLInputElement> }) {
  return <input value={value ?? ''} onChange={onChange} placeholder={placeholder} className="h-14 min-w-[220px] rounded-2xl border border-slate-200 bg-white px-4 text-[16px] text-slate-700 outline-none" />;
}

export function FilterSelect({ label }: { label: string }) {
  return <button className="h-14 min-w-[124px] rounded-2xl border border-slate-200 bg-white px-4 text-[16px] text-slate-700">{label}</button>;
}
