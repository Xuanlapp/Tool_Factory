import { X } from 'lucide-react';
import { useEffect } from 'react';

export function ImagePreviewModal({ src, fileName, onClose }: { src: string; fileName: string; onClose: () => void }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4" role="dialog" aria-modal="true" aria-label={`Xem ảnh ${fileName}`} onMouseDown={onClose}>
    <div className="relative flex max-h-[92vh] w-full max-w-5xl flex-col rounded-2xl bg-white p-3 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
      <div className="mb-3 flex min-w-0 items-center justify-between gap-4 px-1"><div className="truncate text-sm font-medium text-slate-800">{fileName}</div><button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900" aria-label="Đóng xem ảnh"><X className="h-5 w-5" /></button></div>
      <div className="min-h-0 flex-1 overflow-auto rounded-xl bg-slate-100"><img src={src} alt={fileName} className="mx-auto block max-h-[80vh] max-w-full object-contain" /></div>
    </div>
  </div>;
}