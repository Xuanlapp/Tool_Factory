import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Crosshair, FileImage, Package, TriangleAlert } from 'lucide-react';
import type { DashboardData, ErrorItem } from '../api/types';
import { apiBase } from '../api/client';
import { ActionButton } from '../components/ActionButton';
import { DataTable } from '../components/DataTable';
import { DetailPanel } from '../components/DetailPanel';
import { FileThumbnail } from '../components/FileThumbnail';
import { FilterBar, FilterInput, FilterSelect } from '../components/Filters';
import { MetricCard } from '../components/MetricCard';
import { PaginationBar, paginateItems } from '../components/Pagination';
import { Panel } from '../components/Panel';
import { SectionTitle } from '../components/utils';
import { StatusBadge } from '../components/StatusBadge';
import { ErrorRow } from './shared';

type RunKind = 'tool' | 'export';
type ToolRun = { id: string; kind?: RunKind; command: 'start' | 'error' | 'check'; status: 'idle' | 'running' | 'error' | 'completed'; outputAiRelativePath?: string; exportAssets?: Array<'front' | 'back' | 'lazer'>; logs?: string[] };
type ToolStatus = { running: boolean; run: ToolRun | null };

export function ErrorsPage({ data }: { data: DashboardData }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [processedItem, setProcessedItem] = useState<ErrorItem | null>(null);
  const [processing, setProcessing] = useState(false);
  const [processedIds, setProcessedIds] = useState<Set<string>>(() => new Set());
  const [notice, setNotice] = useState('');

  const errorsWithImage = useMemo(
    () => data.errors.filter((item) => !processedIds.has(item.id) && Boolean(item.previewScope && (item.previewRelativePath || item.fileName))),
    [data.errors, processedIds],
  );
  const paged = useMemo(() => paginateItems(errorsWithImage, page, pageSize), [errorsWithImage, page, pageSize]);
  const selected = paged.items[0] ?? errorsWithImage[0];
  const sizeErrors = errorsWithImage.filter((item) => item.step === 'IMPORT_SIZE').length;
  const frontBackErrors = errorsWithImage.filter((item) => item.step === 'FRONT_BACK').length;
  const lazerErrors = errorsWithImage.filter((item) => item.step === 'LAZER').length;

  const confirmProcessed = async () => {
    if (!processedItem) return;
    setProcessing(true);
    setNotice('');
    try {
      const response = await fetch(`${apiBase}/errors/processed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ relativePath: processedItem.previewRelativePath ?? processedItem.fileName }),
      });
      const payload = await response.json() as { ok?: boolean; message?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.message || 'Không thể chuyển ảnh đã xử lý.');
      setProcessedIds((current) => new Set(current).add(processedItem.id));
      setNotice(payload.message ?? 'Đã chuyển ảnh sang images_processed.');
      setProcessedItem(null);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Không thể chuyển ảnh đã xử lý.');
    } finally {
      setProcessing(false);
    }
  };

  return <><div className="grid gap-6 xl:grid-cols-[1.45fr_0.95fr]"><div className="space-y-6"><SectionTitle title="Ảnh lỗi" subtitle="Tập hợp mọi lỗi để xử lý nhanh và rõ ràng."/>{notice ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div> : null}<div className="grid gap-4 xl:grid-cols-4"><MetricCard icon={TriangleAlert} label="Tổng lỗi" value={errorsWithImage.length} tone="red"/><MetricCard icon={AlertCircle} label="Sai kích thước" value={sizeErrors} tone="blue"/><MetricCard icon={Package} label="Front / Back" value={frontBackErrors} tone="violet"/><MetricCard icon={Crosshair} label="Lazer lệch" value={lazerErrors} tone="orange"/></div><Panel><FilterBar><FilterSelect label="Tất cả lỗi"/><FilterSelect label="Bước lỗi"/><FilterInput placeholder="Tìm tên file"/></FilterBar></Panel>{errorsWithImage.length > 0 ? <DataTable headers={['Ảnh', 'Tên file', 'Size', 'Side', 'Qty', 'Bước lỗi', 'Nguyên nhân', 'Thời gian', 'Thao tác']}>{paged.items.map((item) => <ErrorRow key={item.id} item={item} onProcessed={setProcessedItem}/>)}</DataTable> : <Panel><div className="py-10 text-center text-sm font-medium text-slate-500">Hiện không có ảnh lỗi thật trong folder images_error.</div></Panel>}<PaginationBar page={paged.currentPage} totalPages={paged.totalPages} totalItems={paged.total} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} /></div><DetailPanel title="Chi tiết lỗi">{selected ? <div className="space-y-4"><div className="flex justify-between"><div className="text-[18px] font-semibold">{selected.fileName}</div><StatusBadge label="FAIL" tone="red"/></div><div className="grid grid-cols-3 gap-2 rounded-2xl border border-slate-200 p-3 text-center"><div><div className="text-xs text-slate-500">Thực tế</div><div className="mt-2 text-xl font-semibold text-rose-600">{selected.actual}</div></div><div><div className="text-xs text-slate-500">Yêu cầu</div><div className="mt-2 text-xl font-semibold">{selected.expected}</div></div><div><div className="text-xs text-slate-500">Sai lệch</div><div className="mt-2 text-xl font-semibold text-rose-600">{selected.delta}</div></div></div><div className="grid grid-cols-3 gap-2"><FileThumbnail scope={selected.previewScope} relativePath={selected.previewRelativePath} fileName={selected.fileName} className="h-44 w-full"/><FileThumbnail scope={selected.previewScope} relativePath={selected.previewRelativePath} fileName={selected.fileName} className="h-44 w-full"/><div className="flex h-44 items-center justify-center rounded-2xl border border-slate-200 text-slate-300"><Crosshair className="h-24 w-24"/></div></div><div className="rounded-2xl border border-slate-200 p-4 text-sm"><div className="flex justify-between"><span>Sheet</span><b>{selected.sheet}</b></div><div className="mt-3 flex justify-between"><span>Lần chạy</span><b>{selected.runId}</b></div><div className="mt-3 text-rose-600">Bước lỗi: {selected.step} · {selected.reason}</div></div><div className="grid grid-cols-2 gap-3"><button type="button" onClick={() => setProcessedItem(selected)} className="inline-flex h-14 items-center justify-center rounded-2xl border border-emerald-300 bg-white px-6 text-[16px] font-medium text-emerald-700 hover:bg-emerald-50">Processed</button><ActionButton label="Về Images"/></div></div> : null}</DetailPanel></div>{processedItem ? <ProcessedModal fileName={processedItem.fileName} processing={processing} onClose={() => !processing && setProcessedItem(null)} onConfirm={() => void confirmProcessed()} /> : null}</>;
}

function ProcessedModal({ fileName, processing, onClose, onConfirm }: { fileName: string; processing: boolean; onClose: () => void; onConfirm: () => void }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-label="Xác nhận chuyển ảnh đã xử lý"><div className="w-full max-w-md rounded-[28px] bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.25)]"><div className="text-xl font-semibold text-slate-900">Đánh dấu đã xử lý?</div><p className="mt-3 break-all text-sm leading-6 text-slate-600">Ảnh <b>{fileName}</b> sẽ được chuyển từ <code>images_error</code> sang <code>images_processed</code>.</p><p className="mt-2 text-sm text-slate-500">Ảnh sẽ không còn hiển thị trong danh sách Ảnh lỗi.</p><div className="mt-6 grid grid-cols-2 gap-3"><button type="button" disabled={processing} onClick={onClose} className="h-12 rounded-2xl border border-slate-300 text-sm font-semibold text-slate-700 disabled:opacity-40">Hủy</button><button type="button" disabled={processing} onClick={onConfirm} className="h-12 rounded-2xl bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40">{processing ? 'Đang chuyển...' : 'OK, chuyển ảnh'}</button></div></div></div>;
}

function OutputAssetCell({ asset, isExporting = false }: { asset: DashboardData['outputs'][number]['assets'][number]; isExporting?: boolean }) {
  const badgeLabel = asset.status === 'exported' ? 'Đã xuất' : isExporting ? 'Đang xử lý' : 'Chưa export';
  const badgeTone = asset.status === 'exported' ? 'green' : isExporting ? 'orange' : 'blue';
  return <div className="min-w-[180px] space-y-2 rounded-2xl border border-slate-200 bg-white p-3">{asset.previewScope && asset.previewRelativePath ? <FileThumbnail scope={asset.previewScope} relativePath={asset.previewRelativePath} fileName={asset.fileName} version={asset.previewVersion} className="h-28 w-full" fit="contain" /> : <div className="flex h-28 items-center justify-center rounded-xl bg-slate-100 text-sm font-semibold text-slate-400">{asset.kind}</div>}<div className="break-all text-sm font-medium text-slate-800">{asset.fileName}</div><div className="text-xs text-slate-500">{asset.format} · {asset.size}</div><StatusBadge label={badgeLabel} tone={badgeTone} /></div>;
}

function ExportModal({ fileName, onClose, onSubmit }: { fileName: string; onClose: () => void; onSubmit: (assets: Array<'front' | 'back' | 'lazer'>) => Promise<void> }) {
  const [selected, setSelected] = useState<Array<'front' | 'back' | 'lazer'>>(['front', 'back', 'lazer']);
  const [submitting, setSubmitting] = useState(false);
  const toggle = (asset: 'front' | 'back' | 'lazer') => setSelected((current) => current.includes(asset) ? current.filter((item) => item !== asset) : [...current, asset]);
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"><div className="w-full max-w-md rounded-[28px] bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.25)]"><div className="text-xl font-semibold text-slate-900">Export thành phẩm</div><div className="mt-2 text-sm text-slate-500 break-all">{fileName}</div><div className="mt-5 space-y-3">{(['front', 'back', 'lazer'] as const).map((asset) => <label key={asset} className="flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3"><input type="checkbox" checked={selected.includes(asset)} onChange={() => toggle(asset)} /><span className="font-medium uppercase">{asset}</span></label>)}</div><div className="mt-6 grid grid-cols-2 gap-3"><button type="button" onClick={onClose} className="h-12 rounded-2xl border border-slate-300 text-sm font-semibold text-slate-700">Đóng</button><button type="button" disabled={submitting || selected.length === 0} onClick={async () => { setSubmitting(true); try { await onSubmit(selected); onClose(); } finally { setSubmitting(false); } }} className="h-12 rounded-2xl bg-blue-600 text-sm font-semibold text-white disabled:opacity-40">{submitting ? 'Đang export...' : 'Export đã chọn'}</button></div><button type="button" onClick={async () => { setSubmitting(true); try { await onSubmit(['front', 'back', 'lazer']); onClose(); } finally { setSubmitting(false); } }} className="mt-3 h-12 w-full rounded-2xl border border-emerald-300 text-sm font-semibold text-emerald-700 disabled:opacity-40">Export tất cả</button></div></div>;
}

export function OutputsPage({ data }: { data: DashboardData }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [modalGroupId, setModalGroupId] = useState<string | null>(null);
  const [toolStatus, setToolStatus] = useState<ToolStatus>({ running: false, run: null });
  const [exportMessage, setExportMessage] = useState('');

  useEffect(() => {
    let disposed = false;
    const readStatus = async () => {
      try {
        const response = await fetch(`${apiBase}/tool/status`, { cache: 'no-store' });
        if (response.ok && !disposed) setToolStatus(await response.json() as ToolStatus);
      } catch { /* SSE sẽ tự kết nối lại */ }
    };
    void readStatus();
    const events = new EventSource(`${apiBase}/tool/events`);
    events.addEventListener('tool', (event) => {
      if (!disposed) setToolStatus(JSON.parse((event as MessageEvent).data) as ToolStatus);
    });
    return () => { disposed = true; events.close(); };
  }, []);

  useEffect(() => {
    const run = toolStatus.run;
    if (!run || run.kind !== 'export') return;
    if (run.status === 'running') {
      setExportMessage(`Đang export ${(run.exportAssets ?? []).join(', ').toUpperCase() || 'thành phẩm'}...`);
      return;
    }
    setExportingId(null);
    setExportMessage(run.status === 'completed' ? 'Export đã hoàn tất.' : (run.logs?.at(-1) ?? 'Export thất bại.'));
  }, [toolStatus]);

  const operationLocked = toolStatus.running || exportingId !== null;

  const filtered = useMemo(() => data.outputs.filter((group) => group.fileName.toLowerCase().includes(search.trim().toLowerCase())), [data.outputs, search]);
  const paged = useMemo(() => paginateItems(filtered, page, pageSize), [filtered, page, pageSize]);
  const asset = (group: DashboardData['outputs'][number], kind: 'AI' | 'BACK' | 'FRONT' | 'LAZER') => group.assets.find((item) => item.kind === kind)!;
  const modalGroup = filtered.find((group) => group.id === modalGroupId) ?? null;

  const runExport = async (group: DashboardData['outputs'][number], assets: Array<'front' | 'back' | 'lazer'>) => {
    setExportingId(group.id);
    try {
      const response = await fetch(`${apiBase}/export/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outputAiRelativePath: group.outputAiRelativePath ?? group.fileName, assets }),
      });
      const payload = await response.json() as { ok: boolean; message: string; run?: ToolRun | null };
      if (!response.ok || !payload.ok) throw new Error(payload.message || 'Export thất bại.');
      if (payload.run) setToolStatus({ running: payload.run.status === 'running', run: payload.run });
      setExportMessage('Đang khởi động export...');
    } catch (error) {
      setExportingId(null);
      setExportMessage(error instanceof Error ? error.message : 'Export thất bại.');
    }
  };

  return <div className="space-y-6"><SectionTitle title="Thành phẩm" subtitle="Mỗi dòng là một bộ output gồm AI, BACK, FRONT và LAZER."/>{exportMessage ? <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">{exportMessage}</div> : null}{toolStatus.running ? <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{toolStatus.run?.kind === 'export' ? 'Đang export. Không thể chạy thêm export hoặc Tool cho đến khi hoàn tất.' : 'Tool đang chạy. Không thể export để tránh xung đột với Illustrator.'}</div> : null}<div className="grid gap-4 xl:grid-cols-4"><MetricCard icon={FileImage} label="File AI" value={data.summary.kpi.outputAi} tone="orange"/><MetricCard icon={FileImage} label="BACK" value={data.summary.kpi.outputBack} tone="green"/><MetricCard icon={FileImage} label="FRONT" value={data.summary.kpi.outputFront} tone="blue"/><MetricCard icon={Crosshair} label="LAZER" value={data.summary.kpi.outputLazer} tone="red"/></div><Panel><div className="mb-4"><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Tìm theo tên file AI..." className="h-12 w-full rounded-2xl border border-slate-200 px-4 outline-none focus:border-blue-500 xl:max-w-md" /></div><DataTable headers={['Ngày / Sheet', 'AI', 'BACK', 'FRONT', 'LAZER', 'Export']}>{paged.items.map((group) => { const frontAsset = asset(group, 'FRONT'); const backAsset = asset(group, 'BACK'); const lazerAsset = asset(group, 'LAZER'); const missingAny = [frontAsset, backAsset, lazerAsset].some((item) => item.status !== 'exported'); const isCurrentExportGroup = toolStatus.running && toolStatus.run?.kind === 'export' && (toolStatus.run.outputAiRelativePath === (group.outputAiRelativePath ?? group.fileName)); return <tr key={group.id} className="align-top bg-white"><td className="px-4 py-4"><div className="font-semibold">{group.date}</div><div className="mt-1 text-sm text-slate-500">Sheet {group.sheet}</div><div className="mt-1 text-xs text-slate-400">{group.completedAt}</div></td><td className="px-3 py-4"><OutputAssetCell asset={asset(group, 'AI')} isExporting={isCurrentExportGroup} /></td><td className="px-3 py-4"><OutputAssetCell asset={backAsset} isExporting={isCurrentExportGroup} /></td><td className="px-3 py-4"><OutputAssetCell asset={frontAsset} isExporting={isCurrentExportGroup} /></td><td className="px-3 py-4"><OutputAssetCell asset={lazerAsset} isExporting={isCurrentExportGroup} /></td><td className="px-4 py-4"><button type="button" disabled={operationLocked} onClick={() => setModalGroupId(group.id)} className="inline-flex h-12 w-[150px] items-center justify-center rounded-2xl border border-blue-300 text-sm font-semibold text-blue-700 disabled:opacity-40">{toolStatus.running && toolStatus.run?.kind === 'tool' ? 'Tool đang chạy' : toolStatus.running ? 'Đang export...' : exportingId === group.id ? 'Đang gửi...' : missingAny ? 'Export file' : 'Chọn export'}</button></td></tr>;})}</DataTable><PaginationBar page={paged.currentPage} totalPages={paged.totalPages} totalItems={paged.total} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} /></Panel>{modalGroup ? <ExportModal fileName={modalGroup.fileName} onClose={() => setModalGroupId(null)} onSubmit={(assets) => runExport(modalGroup, assets)} /> : null}</div>;
}


