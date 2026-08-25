import { memo } from 'react';
import type { DoneItem, ErrorItem, QueueItem, SheetItem } from '../api/types';
import { FileThumbnail } from '../components/FileThumbnail';
import { StatusBadge } from '../components/StatusBadge';

const selectedStyle = (selected: boolean) => ({
  backgroundColor: selected ? '#dbeafe' : '#ffffff',
  boxShadow: selected ? 'inset 5px 0 0 #2563eb' : 'none',
});

function QueueRowBase({ item, selected = false, onSelect }: { item: QueueItem; selected?: boolean; onSelect?: (item: QueueItem) => void }) {
  const state =
    item.status === 'running'
      ? ['Đang xử lý', 'blue']
      : item.status === 'placed'
        ? ['Đã đặt', 'green']
        : item.status === 'wait_mismatch'
          ? ['Không hợp wait', 'red']
          : ['Chờ', 'orange'];

  return <tr aria-selected={selected} style={selectedStyle(selected)} className="cursor-pointer transition hover:bg-slate-50" onMouseDown={() => onSelect?.(item)}><td className="px-4 py-4"><FileThumbnail scope={item.previewScope} relativePath={item.previewRelativePath} fileName={item.fileName} className="h-14 w-14" /></td><td className="px-4 py-4 text-[17px] font-medium text-rose-500">{String(item.priority).padStart(2, '0')}</td><td className="px-4 py-4">{item.fileName}</td><td className="px-4 py-4">{item.sizeInch}in</td><td className="px-4 py-4">{item.side}</td><td className="px-4 py-4">{item.qty}</td><td className="px-4 py-4">{item.placed}/{item.qty}</td><td className="px-4 py-4 text-rose-500">{item.remaining}</td><td className="px-4 py-4"><StatusBadge label={state[0]} tone={state[1] as 'blue' | 'green' | 'red' | 'orange'} /></td></tr>;
}
export const QueueRow = memo(QueueRowBase);

function DoneRowBase({ item, selected = false, onSelect }: { item: DoneItem; selected?: boolean; onSelect?: (item: DoneItem) => void }) {
  return <tr aria-selected={selected} style={selectedStyle(selected)} className="cursor-pointer transition hover:bg-slate-50" onMouseDown={() => onSelect?.(item)}><td className="px-4 py-4"><FileThumbnail scope={item.previewScope} relativePath={item.previewRelativePath} fileName={item.fileName} className="h-14 w-14" /></td><td className="px-4 py-4">{item.fileName}</td><td className="px-4 py-4">{item.sizeInch}in</td><td className="px-4 py-4">{item.side}</td><td className="px-4 py-4">{item.requestedQty}</td><td className="px-4 py-4">{item.placedQty}/{item.requestedQty}</td><td className="px-4 py-4">{item.sheet}</td><td className="px-4 py-4"><div>{item.completedDate}</div><div className="text-xs text-slate-500">{item.completedAt}</div></td><td className="px-4 py-4"><StatusBadge label={item.status === 'partial' ? 'Còn qty' : 'Hoàn thành'} tone={item.status === 'partial' ? 'orange' : 'green'} /></td></tr>;
}
export const DoneRow = memo(DoneRowBase);

export function ErrorRow({ item, onProcessed, onApprove }: { item: ErrorItem; onProcessed?: (item: ErrorItem) => void; onApprove?: (item: ErrorItem) => void }) {
  return <tr className={item.step === 'LAZER' ? 'bg-rose-50/60' : 'bg-white'}><td className="px-4 py-4"><FileThumbnail scope={item.previewScope} relativePath={item.previewRelativePath} fileName={item.fileName} className="h-14 w-14" /></td><td className="px-4 py-4">{item.fileName}</td><td className="px-4 py-4">{item.sizeInch}in</td><td className="px-4 py-4">{item.side}</td><td className="px-4 py-4">{item.qty}</td><td className="px-4 py-4"><StatusBadge label={item.step} tone={item.step === 'LAZER' ? 'red' : item.step === 'FRONT_BACK' ? 'blue' : 'orange'} /></td><td className="px-4 py-4">{item.reason}</td><td className="px-4 py-4">{item.time}</td><td className="px-4 py-4"><div className="flex gap-2"><button type="button" onClick={() => onProcessed?.(item)} className="h-10 rounded-xl border border-emerald-300 px-3 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50">Processed</button><button type="button" onClick={() => onApprove?.(item)} className="h-10 rounded-xl border border-amber-300 px-3 text-sm font-semibold text-amber-700 transition hover:bg-amber-50">Approve</button></div></td></tr>;
}

export function SheetRow({ item }: { item: SheetItem }) {
  return <tr className={item.status === 'running' ? 'bg-sky-50/70' : 'bg-white'}><td className="px-4 py-4">{item.index}</td><td className="px-4 py-4"><FileThumbnail scope={item.previewScope} relativePath={item.previewRelativePath} fileName={item.fileName} className="h-12 w-12" /></td><td className="px-4 py-4">{item.fileName}</td><td className="px-4 py-4">{item.turn}</td><td className="px-4 py-4">{item.sizeInch}in</td><td className="px-4 py-4">{item.rotation}</td><td className="px-4 py-4">{item.position}</td><td className="px-4 py-4"><StatusBadge label={item.status === 'placed' ? 'Đã đặt' : item.status === 'error' ? 'Không fit' : 'Đang reclip'} tone={item.status === 'error' ? 'red' : item.status === 'placed' ? 'green' : 'blue'} /></td></tr>;
}
