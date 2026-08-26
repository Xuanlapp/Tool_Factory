import { memo, useEffect, useMemo, useState } from 'react';
import { CalendarDays, CircleCheckBig, FileImage, FolderOpen, LoaderCircle, PlayCircle, Search, Shapes, TriangleAlert } from 'lucide-react';
import { apiBase } from '../api/client';
import type { DashboardData } from '../api/types';
import { DataTable } from '../components/DataTable';
import { DetailPanel } from '../components/DetailPanel';
import { FileThumbnail } from '../components/FileThumbnail';
import { FilterBar, FilterInput } from '../components/Filters';
import { MetricCard } from '../components/MetricCard';
import { PaginationBar, paginateItems } from '../components/Pagination';
import { Panel } from '../components/Panel';
import { StatusBadge } from '../components/StatusBadge';
import { SectionTitle } from '../components/utils';

function toIsoDateFromDone(item: DashboardData['done'][number]) {
  const raw = item.dateFolder;
  if (!raw) return null;
  const match = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{2})$/);
  if (!match) return null;
  return `20${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
}

declare global { interface Window { acrylicDesktop?: { selectFolder: () => Promise<string | null> } } }

type CheckSettings = { checkImageSize: boolean; checkTwoSideFaceOffset: boolean; faceToleranceCm: number; cutToleranceCm: number; jsxBatchSize: number; itemGapCm: number };

function CheckSettingsPanel() {
  const [settings, setSettings] = useState<CheckSettings>({ checkImageSize: true, checkTwoSideFaceOffset: false, faceToleranceCm: 0.034, cutToleranceCm: 0.05, jsxBatchSize: 2, itemGapCm: 0.2 });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  useEffect(() => { void fetch(apiBase + '/settings/folders', { cache: 'no-store' }).then((response) => response.json()).then((payload: { checkSettings?: CheckSettings }) => { if (payload.checkSettings) setSettings(payload.checkSettings); }).catch(() => {}); }, []);
  const toggle = (key: 'checkImageSize' | 'checkTwoSideFaceOffset') => setSettings((current) => ({ ...current, [key]: !current[key] }));
  const save = async () => {
    setSaving(true); setNotice('');
    try {
      const response = await fetch(apiBase + '/settings/checks/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) });
      const payload = await response.json() as { ok?: boolean; message?: string };
      setNotice(payload.ok ? 'Đã lưu cấu hình check. Lần chạy npm run start tiếp theo sẽ áp dụng cấu hình này.' : (payload.message ?? 'Không thể lưu cấu hình check.'));
    } catch { setNotice('Không thể kết nối đến app local để lưu cấu hình check.'); }
    finally { setSaving(false); }
  };
  const items: Array<{ key: 'checkImageSize' | 'checkTwoSideFaceOffset'; title: string; description: string }> = [
    { key: 'checkImageSize', title: 'Check kích thước W và H', description: 'Kiểm tra kích thước ảnh đầu vào đúng chuẩn. Sai sẽ chuyển vào images_error.' },
    { key: 'checkTwoSideFaceOffset', title: 'Check hai mặt 2-side trùng nhau', description: 'So sánh hai thanh đo Front và Back để phát hiện mặt sau bị lệch hoặc lật sai.' },
  ];
  return <Panel title="Cấu hình kiểm tra lỗi"><div className="space-y-3">{items.map((item) => <button key={item.key} type="button" onClick={() => toggle(item.key)} className="flex w-full items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-left"><div><div className="font-semibold text-slate-900">{item.title}</div><div className="mt-1 text-sm text-slate-500">{item.description}</div></div><span className={`relative h-7 w-12 shrink-0 rounded-full transition ${settings[item.key] ? 'bg-blue-600' : 'bg-slate-300'}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${settings[item.key] ? 'left-6' : 'left-1'}`} /></span></button>)}</div><div className="mt-4 grid gap-4 md:grid-cols-4"><label className="text-sm"><div className="mb-2 font-semibold text-slate-700">Sai số 2-side (cm)</div><input type="number" step="0.001" value={settings.faceToleranceCm} onChange={(event) => setSettings((current) => ({ ...current, faceToleranceCm: Number(event.target.value || 0) }))} className="h-11 w-full rounded-xl border border-slate-300 px-3" /></label><label className="text-sm"><div className="mb-2 font-semibold text-slate-700">Sai số đường cắt (cm)</div><input type="number" step="0.001" value={settings.cutToleranceCm} onChange={(event) => setSettings((current) => ({ ...current, cutToleranceCm: Number(event.target.value || 0) }))} className="h-11 w-full rounded-xl border border-slate-300 px-3" /></label><label className="text-sm"><div className="mb-2 font-semibold text-slate-700">JSX batch</div><input type="number" min="1" max="90" step="1" value={settings.jsxBatchSize} onChange={(event) => setSettings((current) => ({ ...current, jsxBatchSize: Math.max(1, Math.min(90, Math.round(Number(event.target.value || 1)))) }))} className="h-11 w-full rounded-xl border border-slate-300 px-3" /><div className="mt-1 text-xs text-slate-500">Số item chạy trong một batch Start. Mặc định 2.</div></label><label className="text-sm"><div className="mb-2 font-semibold text-slate-700">Khoảng cách giữa các item (cm)</div><input type="number" min="0" step="0.01" value={settings.itemGapCm} onChange={(event) => setSettings((current) => ({ ...current, itemGapCm: Math.max(0, Number(event.target.value || 0)) }))} className="h-11 w-full rounded-xl border border-slate-300 px-3" /><div className="mt-1 text-xs text-slate-500">Áp dụng cho khoảng hở khi sắp xếp item. Mặc định 0.2cm.</div></label></div><div className="mt-4 flex items-center gap-3"><button type="button" disabled={saving} onClick={() => void save()} className="h-11 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Đang lưu...' : 'Lưu cấu hình check'}</button>{notice ? <div className="text-sm text-slate-600">{notice}</div> : null}</div></Panel>;
}
function FolderPathEditor({ folders }: { folders: DashboardData['settings']['folders'] }) {
  const [editing, setEditing] = useState<DashboardData['settings']['folders'][number] | null>(null);
  const [selectedPath, setSelectedPath] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const saveFolder = async (moveData: boolean) => {
    if (!editing) return; const nextPath = selectedPath.trim(); if (!nextPath) { setNotice('Vui lòng chọn thư mục mới.'); return; } setSaving(true); setNotice('');
    try { const response = await fetch(apiBase + '/settings/folders/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ folderPaths: { [editing.key]: nextPath }, moveData }) }); const payload = await response.json() as { ok?: boolean; message?: string; moveData?: boolean; normalizedPaths?: Record<string, { inputPath: string; normalizedPath: string; mappedDrive?: string; uncResolved: boolean }> }; if (!payload.ok) { setNotice(payload.message ?? 'Không thể lưu đường dẫn.'); return; } setNotice(payload.moveData === false ? 'Đã lưu đường dẫn mới, không chuyển dữ liệu cũ.' : 'Đã lưu đường dẫn và chuyển dữ liệu cũ sang thư mục mới.'); window.setTimeout(() => { setEditing(null); window.location.reload(); }, 700); }
    catch { setNotice('Không thể kết nối đến app local để lưu đường dẫn.'); } finally { setSaving(false); }
  };
  const openModal = (folder: DashboardData['settings']['folders'][number]) => { setEditing(folder); setSelectedPath(folder.path); setNotice(''); };
  const chooseFolder = async () => { const picked = await window.acrylicDesktop?.selectFolder?.(); if (picked) setSelectedPath(picked); if (!window.acrylicDesktop) setNotice("Chức năng chọn thư mục chỉ dùng trong app desktop."); };
  return <>
    <Panel title="Đổi thư mục lưu dữ liệu"><div className="mb-4 text-sm text-slate-600">Bấm Đổi thư mục để mở hộp thoại chọn folder trong máy. Bạn có thể chỉ lưu đường dẫn mới hoặc lưu và chuyển toàn bộ dữ liệu cũ sang thư mục mới.</div><DataTable headers={["Thư mục","Đường dẫn hiện tại","Số file","Thao tác"]}>{folders.map((folder) => <tr key={folder.key} className="bg-white"><td className="px-4 py-4"><div className="font-semibold text-slate-900">{folder.label}</div><div className="text-xs text-slate-500">{folder.key}</div></td><td className="px-4 py-4"><code className="break-all rounded-xl bg-slate-100 px-2 py-1 text-xs text-slate-700">{folder.path}</code></td><td className="px-4 py-4 font-semibold">{folder.files}</td><td className="px-4 py-4"><button type="button" onClick={() => openModal(folder)} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">Đổi thư mục</button></td></tr>)}</DataTable></Panel>
    {editing ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4"><div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl"><div className="text-lg font-bold text-slate-900">Đổi thư mục: {editing.label}</div><div className="mt-2 text-sm text-slate-500">Bạn có thể chỉ đổi đường dẫn hoặc chuyển toàn bộ dữ liệu hiện tại sang thư mục mới.</div><div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="text-xs font-semibold uppercase text-slate-500">Đường dẫn đang chọn</div><code className="mt-2 block break-all rounded-xl bg-white p-3 text-sm text-slate-700">{selectedPath}</code></div><div className="mt-4 flex flex-wrap gap-3"><button type="button" onClick={() => void chooseFolder()} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Chọn thư mục</button><button type="button" disabled={saving || !selectedPath || selectedPath === editing.path} onClick={() => void saveFolder(false)} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">{saving ? 'Đang lưu...' : 'Lưu thôi'}</button><button type="button" disabled={saving || !selectedPath || selectedPath === editing.path} onClick={() => void saveFolder(true)} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">{saving ? 'Đang chuyển...' : 'Lưu & chuyển'}</button><button type="button" disabled={saving} onClick={() => setEditing(null)} className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100">Hủy</button></div>{notice ? <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">{notice}</div> : null}</div></div> : null}
  </>;
}

function HistoryPageView({ data }: { data: DashboardData }) {
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(() => data.done.filter((item) => {
    const q = search.trim().toLowerCase();
    const itemDate = toIsoDateFromDone(item);
    const startOk = !startDate || !itemDate || itemDate >= startDate;
    const endOk = !endDate || !itemDate || itemDate <= endDate;
    const searchOk = !q || [item.fileName, item.sourceGroup, item.sheet, item.completedDate, item.dateFolder, item.monthFolder].some((value) => String(value).toLowerCase().includes(q));
    return startOk && endOk && searchOk;
  }), [data.done, endDate, search, startDate]);

  const paged = useMemo(() => paginateItems(filtered, page, pageSize), [filtered, page, pageSize]);
  const selected = filtered.find((item) => item.id === selectedId) ?? paged.items[0] ?? filtered[0] ?? null;
  const totalPlaced = filtered.reduce((sum, item) => sum + item.placedQty, 0);
  const totalGroups = new Set(filtered.map((item) => item.sourceGroup)).size;
  const totalDates = new Set(filtered.map((item) => item.dateFolder ?? item.completedDate)).size;
  const resetSelection = () => setSelectedId(null);
  const openDatePicker = (event: React.MouseEvent<HTMLInputElement>) => {
    const input = event.currentTarget as HTMLInputElement & { showPicker?: () => void };
    input.showPicker?.();
  };

  return <div className="grid gap-6 xl:grid-cols-[1.45fr_0.95fr]"><div className="space-y-6"><SectionTitle title="Lịch sử" subtitle="Toàn bộ ảnh đã chạy xong, lọc theo khoảng ngày; click hàng để xem chi tiết, click ảnh để preview."/><div className="grid gap-4 xl:grid-cols-4"><MetricCard icon={CircleCheckBig} label="Ảnh đã xong" value={filtered.length} tone="green"/><MetricCard icon={FileImage} label="Tổng số lượng" value={totalPlaced} tone="blue"/><MetricCard icon={Shapes} label="Nhóm thiết kế" value={totalGroups} tone="orange"/><MetricCard icon={CalendarDays} label="Số ngày có dữ liệu" value={totalDates} tone="violet"/></div><Panel><FilterBar><label className="flex h-14 min-w-[200px] cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-500"><span className="whitespace-nowrap">Start Date</span><input type="date" value={startDate} onClick={openDatePicker} onChange={(event) => { setStartDate(event.target.value); setPage(1); resetSelection(); }} className="w-full cursor-pointer bg-transparent text-slate-700 outline-none" /></label><label className="flex h-14 min-w-[200px] cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-500"><span className="whitespace-nowrap">End Date</span><input type="date" value={endDate} onClick={openDatePicker} onChange={(event) => { setEndDate(event.target.value); setPage(1); resetSelection(); }} className="w-full cursor-pointer bg-transparent text-slate-700 outline-none" /></label><div className="flex h-14 min-w-[260px] items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 text-[16px] text-slate-500"><Search className="h-4 w-4"/><FilterInput placeholder="Tìm tên file, nhóm, ngày" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); resetSelection(); }} /></div><button type="button" onClick={() => { setStartDate(''); setEndDate(''); setSearch(''); setPage(1); resetSelection(); }} className="h-14 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-medium text-slate-700">Xóa lọc</button></FilterBar></Panel><Panel><DataTable headers={['Ảnh','Tên file','Ngày','Tháng','Size','Side','Qty','Trạng thái']}>{paged.items.map((item) => <tr key={item.id} onClick={() => setSelectedId(item.id)} className={`cursor-pointer ${item.id === selected?.id ? 'bg-sky-50/60' : 'bg-white hover:bg-slate-50'}`}><td className="px-4 py-3"><FileThumbnail scope={item.previewScope} relativePath={item.previewRelativePath} fileName={item.fileName} className="h-14 w-14" /></td><td className="px-4 py-3"><div className="max-w-[360px] truncate font-medium">{item.fileName}</div><div className="text-xs text-slate-500">{item.sourceGroup}</div></td><td className="px-4 py-3">{item.dateFolder ?? item.completedDate}</td><td className="px-4 py-3">{item.monthFolder ?? '—'}</td><td className="px-4 py-3">{item.sizeInch}in</td><td className="px-4 py-3">{item.side}</td><td className="px-4 py-3">{item.placedQty}</td><td className="px-4 py-3"><StatusBadge label="Đã xong" tone="green" /></td></tr>)}</DataTable><PaginationBar page={paged.currentPage} totalPages={paged.totalPages} totalItems={paged.total} pageSize={pageSize} onPageChange={(nextPage) => { setPage(nextPage); resetSelection(); }} onPageSizeChange={(size) => { setPageSize(size); setPage(1); resetSelection(); }} /></Panel></div><DetailPanel title="Chi tiết ảnh đã xong">{selected ? <div className="space-y-4"><FileThumbnail scope={selected.previewScope} relativePath={selected.previewRelativePath} fileName={selected.fileName} className="h-[520px] w-full" fit="contain"/><div className="flex gap-2"><StatusBadge label={`${selected.sizeInch}in`} tone="blue"/><StatusBadge label={selected.side} tone="blue"/><StatusBadge label={`Qty ${selected.placedQty}`} tone="blue"/></div><div className="rounded-2xl border border-slate-200 p-4 text-sm"><div className="flex justify-between"><span>Tên file</span><b className="max-w-[60%] break-all text-right">{selected.fileName}</b></div><div className="mt-3 flex justify-between"><span>Ngày hoàn thành</span><b>{selected.dateFolder ?? selected.completedDate}</b></div><div className="mt-3 flex justify-between"><span>Giờ hoàn thành</span><b>{selected.completedAt}</b></div><div className="mt-3 flex justify-between"><span>Tháng</span><b>{selected.monthFolder ?? '—'}</b></div><div className="mt-3 flex justify-between"><span>Size</span><b>{selected.sizeInch}in</b></div><div className="mt-3 flex justify-between"><span>Side</span><b>{selected.side}</b></div><div className="mt-3 flex justify-between"><span>Số lượng đã chạy</span><b>{selected.placedQty}</b></div><div className="mt-4 flex justify-between"><span>Nhóm nguồn</span><b className="max-w-[60%] break-all text-right">{selected.sourceGroup}</b></div></div></div> : <div className="flex min-h-[320px] items-center justify-center text-center text-sm font-medium text-slate-500">Chưa có ảnh phù hợp bộ lọc.</div>}</DetailPanel></div>;
}

export const HistoryPage = memo(HistoryPageView, (previous, next) => previous.data.done === next.data.done);

export function SettingsPage({ data }: { data: DashboardData }) {
  const [setup, setSetup] = useState<{ status: string; steps?: Array<{ name: string; ok: boolean; message: string }>; message?: string; updatedAt?: string | null; setupVersion?: string | null; currentSetupVersion?: string | null; setupRequired?: boolean }>({ status: 'idle', steps: [] });
  const loadSetup = async () => { try { setSetup(await (await fetch(apiBase + '/setup/status')).json()); } catch {} };
  const runSetup = async () => { const response = await fetch(apiBase + '/setup/run', { method: 'POST' }); const payload = await response.json() as { ok?: boolean; message?: string }; if (payload.ok) setSetup((current) => ({ ...current, status: 'running', steps: [], setupRequired: false, message: 'Đang thiết lập máy này. Có thể mất vài phút khi cài package.' })); else setSetup((current) => ({ ...current, status: 'error', message: payload.message ?? 'Không thể bắt đầu setup.' })); };
  useEffect(() => { void loadSetup(); const timer = window.setInterval(loadSetup, 2000); return () => window.clearInterval(timer); }, []);

  const folderLabels: Record<string, string> = {
    Images: 'Images - ảnh đầu vào',
    wait: 'Wait - file AI đang chờ',
    imgaes_done: 'Done - ảnh đã chạy xong',
    images_error: 'Images Error - ảnh lỗi',
    images_processed: 'Images Processed - ảnh đã xử lý',
    output_ai: 'Output AI',
    output_front: 'Output Front',
    output_back: 'Output Back',
    output_lazer: 'Output Lazer',
  };
  const folders = data.settings.folders.map((folder) => ({ ...folder, label: folderLabels[folder.key] ?? folder.label }));
  const setupDone = setup.status === 'completed' && setup.setupRequired === false;
  const setupButtonDisabled = setup.status === 'running' || setupDone;
  const setupBadgeLabel = setup.status === 'running' ? 'Đang chạy' : setupDone ? 'Đã thiết lập' : setup.status === 'error' ? 'Có lỗi' : 'Chưa thiết lập';
  const setupBadgeTone = setup.status === 'running' ? 'blue' : setupDone ? 'green' : setup.status === 'error' ? 'red' : 'blue';
  return <div className="space-y-6"><SectionTitle title="Cài đặt" subtitle="Các thư mục Tool Acrylic đang sử dụng trên máy local."/><Panel title="Thiết lập máy này" right={<StatusBadge label={setupBadgeLabel} tone={setupBadgeTone} />}><div className="grid gap-4 xl:grid-cols-[1fr_auto]"><div className="text-sm text-slate-600">Dùng khi cài app sang máy mới: tạo folder, kiểm tra/cài Node, Python, Pillow, npm install và build Tool. Adobe Illustrator vẫn cần cài và đăng nhập license riêng.<div className="mt-2 text-xs text-slate-500">Bản setup hiện tại: {setup.currentSetupVersion ?? 'N/A'} · Máy này: {setup.setupVersion ?? 'Chưa có'}</div></div><button type="button" disabled={setupButtonDisabled} onClick={() => void runSetup()} className="h-12 rounded-2xl bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">{setup.status === 'running' ? <><LoaderCircle className="mr-2 inline h-4 w-4 animate-spin"/>Đang thiết lập...</> : setupDone ? <><CircleCheckBig className="mr-2 inline h-4 w-4"/>Đã thiết lập</> : <><PlayCircle className="mr-2 inline h-4 w-4"/>Thiết lập máy này</>}</button></div><div className="mt-4 grid gap-2">{(setup.steps ?? []).map((step) => <div key={step.name} className="flex items-center justify-between rounded-2xl border border-slate-200 p-3 text-sm"><span>{step.name}</span><StatusBadge label={step.ok ? 'OK' : 'Lỗi'} tone={step.ok ? 'green' : 'red'} /></div>)}{setup.message ? <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{setup.message}</div> : null}{setupDone ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">Máy này đã thiết lập đúng bản hiện tại, nên nút setup đang được khóa.</div> : null}</div></Panel><div className="grid gap-4 xl:grid-cols-4"><MetricCard icon={FolderOpen} label="Tổng thư mục" value={folders.length} tone="blue"/><MetricCard icon={CircleCheckBig} label="Đọc được" value={folders.filter((folder) => folder.valid).length} tone="green"/><MetricCard icon={FileImage} label="Tổng file" value={folders.reduce((sum, folder) => sum + folder.files, 0)} tone="orange"/><MetricCard icon={TriangleAlert} label="Cần kiểm tra" value={folders.filter((folder) => !folder.valid).length} tone="red"/></div><CheckSettingsPanel/><FolderPathEditor folders={folders}/><Panel title="Thư mục liên quan"><DataTable headers={['Thư mục','Đường dẫn','Số file','Quyền ghi','Trạng thái']}>{folders.map((folder) => <tr key={folder.key} className="bg-white"><td className="px-4 py-4"><div className="font-semibold text-slate-900">{folder.label}</div><div className="text-xs text-slate-500">{folder.key}</div></td><td className="px-4 py-4"><code className="break-all rounded-xl bg-slate-100 px-2 py-1 text-xs text-slate-700">{folder.path}</code></td><td className="px-4 py-4 font-semibold">{folder.files}</td><td className="px-4 py-4"><StatusBadge label={folder.writable ? 'Có' : 'Không'} tone={folder.writable ? 'green' : 'red'} /></td><td className="px-4 py-4"><StatusBadge label={folder.valid ? 'OK' : 'Lỗi'} tone={folder.valid ? 'green' : 'red'} /></td></tr>)}</DataTable></Panel><Panel title="Trạng thái hệ thống"><div className="grid gap-4 text-sm xl:grid-cols-3"><div className="rounded-2xl border border-slate-200 p-4"><div className="text-slate-500">Illustrator</div><div className="mt-2 font-semibold">{data.settings.illustrator === 'connected' ? 'Đã kết nối' : 'Mất kết nối'}</div></div><div className="rounded-2xl border border-slate-200 p-4"><div className="text-slate-500">SQLite</div><div className="mt-2 font-semibold">{data.settings.sqlite}</div></div><div className="rounded-2xl border border-slate-200 p-4"><div className="text-slate-500">Cập nhật lần cuối</div><div className="mt-2 font-semibold">{data.settings.lastCheck}</div></div></div></Panel></div>;
}
