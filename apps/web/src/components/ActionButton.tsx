export function ActionButton({ label, primary = false, danger = false }: { label: string; primary?: boolean; danger?: boolean }) {
  const base = primary ? 'bg-blue-600 text-white border-blue-600' : danger ? 'bg-white text-rose-600 border-rose-300' : 'bg-white text-blue-600 border-blue-300';
  return <button className={`inline-flex h-14 items-center justify-center rounded-2xl border px-6 text-[16px] font-medium ${base}`}>{label}</button>;
}
