import { ChevronLeft, ChevronRight } from 'lucide-react';

export function paginateItems<T>(items: T[], page: number, pageSize: number) {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const start = (currentPage - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), total, totalPages, currentPage, start };
}

export function PaginationBar({ page, totalPages, totalItems, pageSize, onPageChange, onPageSizeChange }: { page: number; totalPages: number; totalItems: number; pageSize: number; onPageChange: (page: number) => void; onPageSizeChange?: (pageSize: number) => void }) {
  if (totalItems <= pageSize) return null;
  return <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
    <div className="flex flex-wrap items-center gap-2"><span>Trang {page} / {totalPages} • {totalItems} mục</span>{onPageSizeChange ? <label className="flex items-center gap-2">Hiện <select value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-slate-700">{[5, 10, 20, 30].map((size) => <option key={size} value={size}>{size}</option>)}</select><span>/ trang</span></label> : null}</div>
    <div className="flex items-center gap-2"><button type="button" onClick={() => onPageChange(page - 1)} disabled={page <= 1} className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 disabled:cursor-not-allowed disabled:opacity-50"><ChevronLeft className="h-4 w-4" /> Trước</button><button type="button" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages} className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 disabled:cursor-not-allowed disabled:opacity-50">Sau <ChevronRight className="h-4 w-4" /></button></div>
  </div>;
}