import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Download, FileImage, FolderClock, Layers3 } from 'lucide-react';
import { apiBase } from '../api/client';
import type { DashboardData, QueueItem, WaitFile, WaitItem } from '../api/types';
import { FileThumbnail } from '../components/FileThumbnail';
import { DataTable } from '../components/DataTable';
import { FilterBar } from '../components/Filters';
import { MetricCard } from '../components/MetricCard';
import { Panel } from '../components/Panel';
import { PaginationBar, paginateItems } from '../components/Pagination';
import { StatusBadge } from '../components/StatusBadge';
import { SectionTitle } from '../components/utils';
import { QueueRow } from './shared';

function QueueSearchInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="flex h-12 min-w-[260px] items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-500">
      <FileImage className="h-4 w-4" />
      <input className="w-full outline-none" placeholder="Tìm theo tên file wait hoặc item" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function waitMatches(waitFile: WaitFile, query: string) {
  const lower = query.trim().toLowerCase();
  if (!lower) return true;
  if (waitFile.fileName.toLowerCase().includes(lower)) return true;
  return waitFile.itemList.some((item) => item.fileName.toLowerCase().includes(lower));
}

function waitItemPreview(waitFile: WaitFile, item: WaitItem) {
  return item.previewRelativePath ?? waitFile.relativePath ?? waitFile.fileName;
}

function QueueImageFallback({ item }: { item: QueueItem }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3">
      <FileThumbnail scope={item.previewScope} relativePath={item.previewRelativePath} fileName={item.fileName} className="h-16 w-16" />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-slate-900">{item.fileName}</div>
        <div className="mt-1 text-xs text-slate-500">{item.sizeInch}in • {item.side} • Qty {item.qty}</div>
      </div>
    </div>
  );
}

export function OverviewPage({ data }: { data: DashboardData }) {
  const done = data.done.slice(0, 5);
  const errors = data.errors.slice(0, 5);
  const [queuePage, setQueuePage] = useState(1);
  const [queuePageSize, setQueuePageSize] = useState(10);
  const queue = paginateItems(data.queue, queuePage, queuePageSize);
  return <div className="space-y-6"><SectionTitle title="Tổng quan" subtitle="Theo dõi nhanh số lượng ảnh và trạng thái xử lý."/><div className="grid gap-4 xl:grid-cols-4"><MetricCard icon={FileImage} label="Images" value={data.summary.kpi.queue} tone="blue"/><MetricCard icon={Layers3} label="Đang xử lý" value={data.summary.kpi.processing} tone="orange"/><MetricCard icon={FolderClock} label="Wait" value={data.summary.kpi.wait} tone="violet"/><MetricCard icon={AlertCircle} label="Lỗi" value={data.summary.kpi.errors} tone="red"/></div><div className="grid gap-6 xl:grid-cols-[1.45fr_0.85fr]"><Panel title="Hàng chờ" right={<StatusBadge label={`${data.queue.length} ảnh`} tone="blue"/>}><DataTable headers={['Ảnh', 'Ưu tiên', 'Tên file', 'Size', 'Side', 'Qty', 'Đã đặt', 'Còn lại', 'Trạng thái']}>{queue.items.map((item) => <QueueRow key={item.id} item={item}/>)}</DataTable><PaginationBar page={queue.currentPage} totalPages={queue.totalPages} totalItems={queue.total} pageSize={queuePageSize} onPageChange={setQueuePage} onPageSizeChange={(size) => { setQueuePageSize(size); setQueuePage(1); }}/></Panel><div className="space-y-6"><Panel title="Đã xong gần đây" right={<StatusBadge label={String(data.done.length)} tone="green"/>}><div className="space-y-3">{done.map((item) => <div key={item.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 p-3"><FileThumbnail scope={item.previewScope} relativePath={item.previewRelativePath} fileName={item.fileName} className="h-12 w-12"/><div className="min-w-0 flex-1"><div className="truncate font-medium">{item.fileName}</div><div className="text-sm text-slate-500">{item.completedAt}</div></div></div>)}</div></Panel><Panel title="Lỗi gần đây" right={<StatusBadge label={String(data.errors.length)} tone="red"/>}><div className="space-y-3">{errors.map((item) => <div key={item.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 p-3"><FileThumbnail scope={item.previewScope} relativePath={item.previewRelativePath} fileName={item.fileName} className="h-12 w-12"/><div className="min-w-0 flex-1"><div className="truncate font-medium">{item.fileName}</div><div className="text-sm text-slate-500">{item.reason}</div></div></div>)}</div></Panel></div></div></div>;
}

export function QueuePage({ data }: { data: DashboardData }) {
  const isSticker = apiBase.endsWith('/sticker');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const waitFiles = useMemo(() => data.sheet.waitFiles.filter((item) => waitMatches(item, search)), [data.sheet.waitFiles, search]);
  const [selectedWaitFile, setSelectedWaitFile] = useState<string | null>(null);
  const [waitAction, setWaitAction] = useState<'export' | 'printed' | null>(null);
  const [waitNotice, setWaitNotice] = useState('');
  const [waitBusy, setWaitBusy] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [stickerTransferModalOpen, setStickerTransferModalOpen] = useState(false);
  const [toolRunning, setToolRunning] = useState(false);

  useEffect(() => {
    const preferred = waitFiles.find((item) => item.fileName === data.sheet.currentWaitFile)?.fileName ?? waitFiles[0]?.fileName ?? null;
    if (!preferred) {
      setSelectedWaitFile(null);
      return;
    }
    if (!selectedWaitFile || !waitFiles.some((item) => item.fileName === selectedWaitFile)) {
      setSelectedWaitFile(preferred);
    }
  }, [data.sheet.currentWaitFile, selectedWaitFile, waitFiles]);

  const selectedWait = waitFiles.find((item) => item.fileName === selectedWaitFile) ?? waitFiles[0] ?? null;
  const pagedItems = useMemo(() => paginateItems(selectedWait?.itemList ?? [], page, pageSize), [selectedWait, page, pageSize]);

  useEffect(() => {
    let disposed = false;
    const readStatus = async () => {
      try {
        const response = await fetch(`${apiBase}/tool/status`, { cache: 'no-store' });
        if (!disposed && response.ok) {
          const payload = await response.json() as { running?: boolean };
          setToolRunning(Boolean(payload.running));
        }
      } catch {}
    };
    void readStatus();
    const events = new EventSource(`${apiBase}/tool/events`);
    events.addEventListener('tool', (event) => {
      if (!disposed) {
        const payload = JSON.parse((event as MessageEvent).data) as { running?: boolean };
        setToolRunning(Boolean(payload.running));
      }
    });
    return () => { disposed = true; events.close(); };
  }, []);

  const exportWait = async (assets: Array<'front' | 'back' | 'lazer'>) => {
    if (!selectedWait?.relativePath) return;
    setWaitBusy(true);
    setWaitNotice('');
    try {
      const response = await fetch(`${apiBase}/wait/export`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ waitRelativePath: selectedWait.relativePath, assets }) });
      const payload = await response.json() as { ok?: boolean; message?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.message || 'Không thể export file wait.');
      setWaitNotice('Đã sao chép file wait sang output_ai và bắt đầu export các mục đã chọn. File wait vẫn được giữ nguyên.');
      setExportModalOpen(false);
    } catch (error) {
      setWaitNotice(error instanceof Error ? error.message : 'Không thể export file wait.');
    } finally {
      setWaitBusy(false);
    }
  };

  const transferStickerWait = async () => {
    if (!selectedWait?.relativePath) return;
    setWaitBusy(true);
    setWaitNotice('');
    try {
      const response = await fetch(`${apiBase}/wait/export`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ waitRelativePath: selectedWait.relativePath }) });
      const payload = await response.json() as { ok?: boolean; message?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.message || 'Không thể chuyển file Sticker.');
      setWaitNotice(payload.message || 'Đã chuyển file Sticker vào output AI.');
      setStickerTransferModalOpen(false);
    } catch (error) {
      setWaitNotice(error instanceof Error ? error.message : 'Không thể chuyển file Sticker.');
    } finally {
      setWaitBusy(false);
    }
  };

  const markPrinted = async () => {
    if (!selectedWait?.relativePath) return;
    setWaitBusy(true);
    setWaitNotice('');
    try {
      const response = await fetch(`${apiBase}/wait/printed`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ waitRelativePath: selectedWait.relativePath }) });
      const payload = await response.json() as { ok?: boolean; message?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.message || 'Không thể đánh dấu Đã in.');
      setWaitNotice(payload.message || 'Đang mở file wait để xóa FRONT/BACK/LAZER.');
      setWaitAction(null);
    } catch (error) {
      setWaitNotice(error instanceof Error ? error.message : 'Không thể đánh dấu Đã in.');
    } finally {
      setWaitBusy(false);
    }
  };

  useEffect(() => { setPage(1); }, [selectedWaitFile, pageSize]);

  return (
    <div className="space-y-6">
      <SectionTitle title="Hàng chờ" subtitle="Ưu tiên xem file wait hiện tại, số item đã nằm trong wait và preview nhanh file đó." />
      <div className="grid gap-4 xl:grid-cols-4">
        <MetricCard icon={FolderClock} label="Số file wait" value={data.sheet.waitFiles.length} tone="violet" />
        <MetricCard icon={Layers3} label="Item trong wait đang chọn" value={selectedWait?.items ?? 0} tone="blue" />
        <MetricCard icon={FileImage} label="Ảnh chưa vào wait" value={data.queue.length} tone="orange" />
        <MetricCard icon={AlertCircle} label="Không hợp wait" value={data.queue.filter((item) => item.status === 'wait_mismatch').length} tone="red" />
      </div>

      <Panel>
        <div className="flex flex-wrap items-center gap-3">
          <FilterBar><QueueSearchInput value={search} onChange={setSearch} /></FilterBar>
          <div className="ml-auto flex flex-wrap gap-3">
            <button type="button" disabled={!selectedWait || waitBusy || toolRunning} onClick={() => isSticker ? setStickerTransferModalOpen(true) : setExportModalOpen(true)} className="inline-flex h-14 items-center gap-3 rounded-2xl border border-blue-300 bg-blue-50 px-5 text-left text-blue-700 shadow-sm transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-40"><Download className="h-6 w-6"/><span><b className="block">{isSticker ? 'Chuyển Output AI' : 'Export File'}</b><small className="text-xs text-blue-500">{isSticker ? 'Chuyển thẳng wait vào output AI theo ngày' : 'Sao chép wait và xuất thành phẩm'}</small></span></button>
            {!isSticker ? <button type="button" disabled={!selectedWait || waitBusy || toolRunning} onClick={() => setWaitAction('printed')} className="inline-flex h-14 items-center gap-3 rounded-2xl border border-emerald-300 bg-emerald-50 px-5 text-left text-emerald-700 shadow-sm transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"><CheckCircle2 className="h-6 w-6"/><span><b className="block">Đã in</b><small className="text-xs text-emerald-500">Đánh dấu file wait đã in</small></span></button> : null}
          </div>
        </div>
        {waitNotice ? <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">{waitNotice}</div> : null}
      </Panel>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr_1fr]">
        <Panel title="Danh sách file wait" right={<StatusBadge label={`${waitFiles.length} file`} tone="blue" />}>
          <div className="space-y-3">
            {waitFiles.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">Chưa có file wait.</div> : waitFiles.map((waitFile) => {
              const active = selectedWait?.fileName === waitFile.fileName;
              return (
                <button key={waitFile.fileName} type="button" onClick={() => setSelectedWaitFile(waitFile.fileName)} className={`w-full rounded-2xl border p-4 text-left transition ${active ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-slate-900">{waitFile.fileName}</div>
                      <div className="mt-1 text-xs text-slate-500">Cập nhật {waitFile.updatedAt}</div>
                    </div>
                    <StatusBadge label={`${waitFile.items} item`} tone={active ? 'blue' : 'slate'} />
                  </div>
                  <div className="mt-3 text-sm text-slate-600">Fit {waitFile.fitCapInch}in</div>
                </button>
              );
            })}
          </div>
        </Panel>

        <Panel title={selectedWait ? `Item trong ${selectedWait.fileName}` : 'Item trong wait'} right={selectedWait ? <StatusBadge label={`${selectedWait.items} item`} tone="blue" /> : undefined}>
          {!selectedWait ? <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">Chọn một file wait để xem chi tiết.</div> : <><div className="space-y-3">{pagedItems.items.map((item) => <div key={item.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3"><FileThumbnail scope={item.previewScope} relativePath={waitItemPreview(selectedWait, item)} fileName={item.fileName} className="h-20 w-20" /><div className="min-w-0 flex-1"><div className="truncate font-medium text-slate-900">{item.fileName}</div><div className="mt-1 text-xs text-slate-500">{item.sizeInch}in • {item.side}</div><div className="mt-2 text-sm text-slate-600">Đã đặt {item.qtyPlaced} • Còn lại {item.qtyRemaining}</div></div></div>)}</div><PaginationBar page={pagedItems.currentPage} totalPages={pagedItems.totalPages} totalItems={pagedItems.total} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} /></>}
        </Panel>

        <Panel title="Preview file wait">
          {!selectedWait ? <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">Chưa có file wait để preview.</div> : <div className="space-y-4"><div className="flex h-[560px] items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">{selectedWait.previewUrl ? <img src={selectedWait.previewUrl} alt={selectedWait.fileName} className="h-full w-full object-contain" /> : <span className="text-sm text-slate-500">Chưa có preview.</span>}</div><div className="rounded-2xl border border-slate-200 p-4 text-sm text-slate-700"><div className="flex justify-between gap-3"><span>File wait</span><b className="truncate text-right">{selectedWait.fileName}</b></div><div className="mt-3 flex justify-between gap-3"><span>Số item</span><b>{selectedWait.items}</b></div><div className="mt-3 flex justify-between gap-3"><span>Khả năng fit</span><b>{selectedWait.fitCapInch}in</b></div><div className="mt-3 flex justify-between gap-3"><span>Cập nhật</span><b>{selectedWait.updatedAt}</b></div><div className="mt-3 flex justify-between gap-3"><span>Trạng thái</span><b className={selectedWait.printedAt ? 'text-emerald-600' : 'text-slate-500'}>{selectedWait.printedAt ? 'Đã in' : 'Chưa in'}</b></div></div></div>}
        </Panel>
      </div>
      {waitAction === 'printed' && selectedWait ? <WaitPrintedModal fileName={selectedWait.fileName} busy={waitBusy} onClose={() => !waitBusy && setWaitAction(null)} onConfirm={() => void markPrinted()} /> : null}
      {exportModalOpen && selectedWait ? <WaitExportModal fileName={selectedWait.fileName} busy={waitBusy} onClose={() => !waitBusy && setExportModalOpen(false)} onSubmit={(assets) => void exportWait(assets)} /> : null}
      {stickerTransferModalOpen && selectedWait ? <StickerTransferModal fileName={selectedWait.fileName} busy={waitBusy} onClose={() => !waitBusy && setStickerTransferModalOpen(false)} onConfirm={() => void transferStickerWait()} /> : null}
    </div>
  );
}

function StickerTransferModal({ fileName, busy, onClose, onConfirm }: { fileName: string; busy: boolean; onClose: () => void; onConfirm: () => void }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true"><div className="w-full max-w-md rounded-[28px] bg-white p-6 shadow-2xl"><div className="text-xl font-semibold text-slate-900">Chuyển Sticker vào Output AI?</div><p className="mt-3 break-all text-sm leading-6 text-slate-600">File <b>{fileName}</b> sẽ được chuyển khỏi hàng chờ vào thư mục output AI của ngày hiện tại và tự đánh số tiếp theo (01, 02, 03...).</p><div className="mt-6 grid grid-cols-2 gap-3"><button type="button" disabled={busy} onClick={onClose} className="h-12 rounded-2xl border border-slate-300 text-sm font-semibold text-slate-700 disabled:opacity-40">Hủy</button><button type="button" disabled={busy} onClick={onConfirm} className="h-12 rounded-2xl bg-blue-600 text-sm font-semibold text-white disabled:opacity-40">{busy ? 'Đang chuyển...' : 'Xác nhận'}</button></div></div></div>;
}

function WaitPrintedModal({ fileName, busy, onClose, onConfirm }: { fileName: string; busy: boolean; onClose: () => void; onConfirm: () => void }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true"><div className="w-full max-w-md rounded-[28px] bg-white p-6 shadow-2xl"><div className="text-xl font-semibold text-slate-900">Chắc chắn bạn đã in?</div><p className="mt-3 break-all text-sm leading-6 text-slate-600">Sau khi xác nhận, app sẽ mở file wait <b>{fileName}</b> trong Adobe Illustrator, xóa toàn bộ nội dung <b>FRONT</b>, <b>BACK</b> và <b>LAZER</b>, rồi lưu lại file wait. Các layer khác vẫn giữ nguyên để Tool tiếp tục chạy wait.</p><div className="mt-6 grid grid-cols-2 gap-3"><button type="button" disabled={busy} onClick={onClose} className="h-12 rounded-2xl border border-slate-300 text-sm font-semibold text-slate-700 disabled:opacity-40">Hủy</button><button type="button" disabled={busy} onClick={onConfirm} className="h-12 rounded-2xl bg-emerald-600 text-sm font-semibold text-white disabled:opacity-40">{busy ? 'Đang lưu...' : 'Xác nhận'}</button></div></div></div>;
}




function WaitExportModal({ fileName, busy, onClose, onSubmit }: { fileName: string; busy: boolean; onClose: () => void; onSubmit: (assets: Array<'front' | 'back' | 'lazer'>) => void }) {
  const [selected, setSelected] = useState<Array<'front' | 'back' | 'lazer'>>(['front', 'back', 'lazer']);
  const toggle = (asset: 'front' | 'back' | 'lazer') => setSelected((current) => current.includes(asset) ? current.filter((item) => item !== asset) : [...current, asset]);
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true"><div className="w-full max-w-md rounded-[28px] bg-white p-6 shadow-2xl"><div className="text-xl font-semibold text-slate-900">Export file wait</div><div className="mt-2 break-all text-sm text-slate-500">{fileName}</div><div className="mt-5 space-y-3">{(['front', 'back', 'lazer'] as const).map((asset) => <label key={asset} className="flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3"><input type="checkbox" checked={selected.includes(asset)} onChange={() => toggle(asset)} /><span className="font-medium uppercase">{asset}</span></label>)}</div><div className="mt-6 grid grid-cols-2 gap-3"><button type="button" onClick={onClose} disabled={busy} className="h-12 rounded-2xl border border-slate-300 text-sm font-semibold text-slate-700 disabled:opacity-40">Đóng</button><button type="button" disabled={busy || selected.length === 0} onClick={() => onSubmit(selected)} className="h-12 rounded-2xl bg-blue-600 text-sm font-semibold text-white disabled:opacity-40">{busy ? 'Đang export...' : 'Export đã chọn'}</button></div></div></div>;
}
