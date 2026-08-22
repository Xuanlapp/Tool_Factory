import { useEffect, useMemo, useState } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import { previewUrl } from '../api/client';

export function FileThumbnail({ scope, relativePath, fileName, version, className = 'h-14 w-14', fit = 'cover' }: { scope?: string; relativePath?: string; fileName?: string; version?: string; className?: string; fit?: 'cover' | 'contain' }) {
  const fallbackSrc = useMemo(() => scope === 'images_error' && fileName ? previewUrl('Images', fileName, fileName, version) : undefined, [scope, fileName, version]);
  const initialSrc = previewUrl(scope, relativePath, fileName, version);
  const [src, setSrc] = useState(initialSrc);
  useEffect(() => { setSrc(initialSrc); }, [initialSrc]);
  if (!src) return <div className={`${className} flex items-center justify-center rounded-2xl bg-slate-100 text-slate-400`}><ImageIcon className="h-6 w-6" /></div>;
  return <button type="button" title={`Xem ảnh: ${fileName ?? 'preview'}`} onClick={(event) => { event.stopPropagation(); window.dispatchEvent(new CustomEvent('acrylic:preview-file', { detail: { src, fileName: fileName ?? 'Ảnh xem trước' } })); }} className={`${className} block overflow-hidden rounded-2xl border border-slate-200 transition hover:border-blue-500 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500`}>
    <img loading="lazy" decoding="async" src={src} alt={fileName ?? 'preview'} onError={() => { if (fallbackSrc && src !== fallbackSrc) setSrc(fallbackSrc); }} className={`h-full w-full ${fit === 'contain' ? 'object-contain bg-slate-50' : 'object-cover'}`} />
  </button>;
}
