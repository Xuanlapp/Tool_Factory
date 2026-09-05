import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, FileImage, FolderOpen, Link2, Loader2, Play, RefreshCw, TriangleAlert } from 'lucide-react';
import { apiBase, fileSize, vietnamDateTime } from '../api/client';
import { Panel } from '../components/Panel';
import { SectionTitle } from '../components/utils';
import { StatusBadge } from '../components/StatusBadge';

type TestFile = { name: string; sizeBytes: number; modifiedAt: string };
type TestFolder = { folderPath: string; templatePath: string; files: TestFile[] };
type ToolRun = { command: string; status: 'idle' | 'running' | 'error' | 'completed'; startedAt: string; exitCode?: number | null; logs: string[] };
type ToolStatus = { running: boolean; run: ToolRun | null };
declare global { interface Window { acrylicDesktop?: { selectFolder: () => Promise<string | null>; selectFile: () => Promise<string | null> } } }

async function readTestFolder() {
  const response = await fetch(`${apiBase}/test/images`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Không thể đọc folder test (${response.status}).`);
  return response.json() as Promise<TestFolder>;
}

async function readToolStatus() {
  const response = await fetch(`${apiBase}/tool/status`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Không thể đọc trạng thái Tool (${response.status}).`);
  return response.json() as Promise<ToolStatus>;
}

export function TestPage() {
  const [folder, setFolder] = useState<TestFolder | null>(null);
  const [status, setStatus] = useState<ToolStatus>({ running: false, run: null });
  const [message, setMessage] = useState('Thêm một file PNG vào folder test rồi bấm chạy.');
  const [loading, setLoading] = useState(true);
  const [launching, setLaunching] = useState(false);
  const [editingFolder, setEditingFolder] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState('');
  const [savingFolder, setSavingFolder] = useState(false);
  const [quickImagePath, setQuickImagePath] = useState('');
  const [quickSideCount, setQuickSideCount] = useState<1 | 2>(1);
  const [quickLaunching, setQuickLaunching] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try { setFolder(await readTestFolder()); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Không thể đọc folder test.'); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    void refresh();
    void readToolStatus().then(setStatus).catch(() => undefined);
    const events = new EventSource(`${apiBase}/tool/events`);
    events.addEventListener('tool', (event) => setStatus(JSON.parse((event as MessageEvent).data) as ToolStatus));
    return () => events.close();
  }, []);

  const candidate = folder?.files[0] ?? null;
  const logs = useMemo(() => status.run?.logs.slice(-40) ?? [], [status.run]);
  const canRun = Boolean(candidate) && !status.running && !launching;
  const runTest = async () => {
    if (!canRun) return;
    setLaunching(true);
    try {
      const response = await fetch(`${apiBase}/test/run`, { method: 'POST' });
      const result = await response.json() as { ok: boolean; message: string; run: ToolRun | null };
      setMessage(result.message);
      if (result.run) setStatus({ running: result.run.status === 'running', run: result.run });
      if (result.ok) await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Không thể chạy test.'); }
    finally { setLaunching(false); }
  };

  const openFolderEditor = () => {
    setSelectedFolder(folder?.folderPath ?? '');
    setEditingFolder(true);
  };
  const chooseFolder = async () => {
    const picked = await window.acrylicDesktop?.selectFolder?.();
    if (picked) setSelectedFolder(picked);
    if (!window.acrylicDesktop) setMessage('Chức năng chọn folder chỉ dùng trong app desktop; bạn vẫn có thể dán đường dẫn.');
  };
  const saveFolder = async () => {
    if (!selectedFolder.trim()) return;
    setSavingFolder(true);
    try {
      const response = await fetch(`${apiBase}/test/folder`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ folderPath: selectedFolder }) });
      const result = await response.json() as { ok: boolean; message: string };
      setMessage(result.message);
      if (result.ok) { setEditingFolder(false); await refresh(); }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Không thể lưu folder test.'); }
    finally { setSavingFolder(false); }
  };
  const chooseQuickImage = async () => {
    const picked = await window.acrylicDesktop?.selectFile?.();
    if (picked) setQuickImagePath(picked);
    if (!window.acrylicDesktop) setMessage('Chức năng chọn file chỉ dùng trong app desktop; bạn vẫn có thể dán đường dẫn PNG.');
  };
  const runQuickTest = async () => {
    if (!quickImagePath.trim() || status.running || quickLaunching) return;
    setQuickLaunching(true);
    try {
      const response = await fetch(`${apiBase}/test/quick-run`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imagePath: quickImagePath, sideCount: quickSideCount }) });
      const result = await response.json() as { ok: boolean; message: string; run: ToolRun | null };
      setMessage(result.message);
      if (result.run) setStatus({ running: result.run.status === 'running', run: result.run });
      if (result.ok) await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Không thể chạy test nhanh.'); }
    finally { setQuickLaunching(false); }
  };

  const statusLabel = status.running ? 'Đang chạy' : status.run?.status === 'completed' ? 'Đã xong' : status.run?.status === 'error' ? 'Có lỗi' : 'Sẵn sàng';
  const statusTone = status.running ? 'blue' : status.run?.status === 'completed' ? 'green' : status.run?.status === 'error' ? 'red' : 'slate';
  return <div className="space-y-6">
    <SectionTitle title="Test Acrylic" subtitle="Khu test riêng: không đọc, đổi tên hoặc di chuyển bất kỳ ảnh nào trong Images của Acrylic." action={<button type="button" onClick={() => void refresh()} className="inline-flex h-12 items-center gap-2 rounded-2xl border border-blue-300 px-4 font-semibold text-blue-700"><RefreshCw className={loading ? 'h-5 w-5 animate-spin' : 'h-5 w-5'} />Làm mới</button>} />
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
      <div className="space-y-6">
        <Panel title="Test nhanh bằng đường dẫn ảnh"><div className="space-y-4"><p className="text-sm text-slate-600">Dán đường dẫn PNG từ ổ máy/NAS <b>hoặc link Google Drive công khai</b>, rồi chọn số mặt. App chỉ tạo bản sao trong folder test để chạy; file gốc giữ nguyên. <b>Qty mặc định là 1.</b></p><div className="flex flex-col gap-3 sm:flex-row"><input value={quickImagePath} onChange={(event) => setQuickImagePath(event.target.value)} placeholder={'Ví dụ: D:\\Folder\\anh.png, \\NAS\\Folder\\anh.png hoặc link Google Drive'} className="h-12 min-w-0 flex-1 rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-blue-500" /><button type="button" onClick={() => void chooseQuickImage()} className="h-12 rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-700">Chọn ảnh</button></div><div className="flex flex-wrap items-center gap-3"><label className="text-sm font-semibold text-slate-700">Số mặt</label><button type="button" onClick={() => setQuickSideCount(1)} className={`rounded-xl px-4 py-2 text-sm font-semibold ${quickSideCount === 1 ? 'bg-blue-600 text-white' : 'border border-slate-300 text-slate-700'}`}>1 side</button><button type="button" onClick={() => setQuickSideCount(2)} className={`rounded-xl px-4 py-2 text-sm font-semibold ${quickSideCount === 2 ? 'bg-blue-600 text-white' : 'border border-slate-300 text-slate-700'}`}>2 side</button><span className="rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-600">qty_1</span><button type="button" disabled={!quickImagePath.trim() || status.running || quickLaunching} onClick={() => void runQuickTest()} className="ml-auto inline-flex h-12 items-center gap-2 rounded-xl bg-violet-600 px-5 text-sm font-semibold text-white disabled:opacity-40"><Link2 className="h-4 w-4" />{quickLaunching ? 'Đang chuẩn bị...' : 'Chạy từ đường dẫn'}</button></div></div></Panel>
        <Panel title="Nguồn test riêng"><div className="space-y-4 text-sm"><div className="rounded-2xl border border-blue-200 bg-blue-50 p-4"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2 font-semibold text-blue-950"><FolderOpen className="h-5 w-5" />Folder ảnh test</div><button type="button" disabled={status.running} onClick={openFolderEditor} className="rounded-xl border border-blue-300 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 disabled:opacity-40">Đổi folder</button></div><code className="mt-2 block break-all text-blue-800">{folder?.folderPath ?? 'Đang tạo folder...'}</code></div><div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><div className="flex items-center gap-2 font-semibold text-emerald-950"><CheckCircle2 className="h-5 w-5" />Template vẫn dùng chung với Acrylic</div><code className="mt-2 block break-all text-emerald-800">{folder?.templatePath ?? 'Đang đọc template...'}</code></div><p className="text-slate-600">Hệ thống chỉ lấy file PNG đầu tiên theo tên trong folder test. Ảnh trong <code>Images</code> chính sẽ không được đụng tới.</p></div></Panel>
        <Panel title={`Ảnh trong folder test${folder ? ` (${folder.files.length})` : ''}`}><div className="space-y-2">{loading ? <div className="p-6 text-center text-slate-500">Đang đọc folder...</div> : folder?.files.length ? folder.files.map((file, index) => <div key={file.name} className={`flex items-center gap-3 rounded-2xl border p-4 ${index === 0 ? 'border-violet-300 bg-violet-50' : 'border-slate-200'}`}><FileImage className={index === 0 ? 'h-6 w-6 text-violet-700' : 'h-6 w-6 text-slate-400'} /><div className="min-w-0 flex-1"><div className="truncate font-semibold text-slate-900">{file.name}</div><div className="mt-1 text-xs text-slate-500">{fileSize(file.sizeBytes)} · {vietnamDateTime(file.modifiedAt)}</div></div>{index === 0 ? <StatusBadge label="Ảnh sẽ test" tone="blue" /> : null}</div>) : <div className="rounded-2xl border border-dashed border-amber-300 bg-amber-50 p-7 text-center text-sm text-amber-800">Folder test chưa có PNG. Hãy chép một ảnh vào folder ở trên.</div>}</div></Panel>
      </div>
      <div className="space-y-6"><Panel title="Chạy test" right={<StatusBadge label={statusLabel} tone={statusTone} />}><div className="space-y-4"><p className="text-sm text-slate-600">Test chỉ import và check một ảnh riêng trong Illustrator, dùng template Acrylic hiện tại.</p><button type="button" disabled={!canRun} onClick={() => void runTest()} className="flex h-16 w-full items-center justify-center gap-3 rounded-2xl border border-violet-300 bg-violet-600 text-lg font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40"><Play className="h-6 w-6" />{launching || status.running ? <><Loader2 className="h-5 w-5 animate-spin" />Đang chạy test...</> : 'Chạy Test 1 ảnh'}</button><div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">{message}</div>{!candidate && !loading ? <div className="flex gap-2 text-sm text-amber-700"><TriangleAlert className="h-5 w-5 shrink-0" />Cần có ít nhất một file PNG để chạy.</div> : null}</div></Panel><Panel title="Log test"><pre className="max-h-[360px] overflow-auto whitespace-pre-wrap break-all rounded-2xl bg-slate-950 p-4 font-mono text-[11px] leading-5 text-slate-100">{logs.length ? logs.join('\n') : 'Chưa có log test.'}</pre>{status.run?.exitCode !== undefined ? <div className="mt-3 text-sm text-slate-600">Mã kết thúc: <b>{status.run.exitCode}</b></div> : null}</Panel></div>
    </div>
    {editingFolder ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4"><div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl"><div className="text-lg font-bold text-slate-900">Đổi folder ảnh test</div><p className="mt-2 text-sm text-slate-500">Chỉ đổi nguồn ảnh của trang Test. Không chuyển dữ liệu và không ảnh hưởng folder Images sản xuất.</p><label className="mt-5 block text-sm font-semibold text-slate-700">Đường dẫn folder</label><input value={selectedFolder} onChange={(event) => setSelectedFolder(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-slate-300 px-3 text-sm text-slate-800 outline-none focus:border-blue-500" /><div className="mt-4 flex flex-wrap gap-3"><button type="button" onClick={() => void chooseFolder()} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">Chọn thư mục</button><button type="button" disabled={savingFolder || !selectedFolder.trim()} onClick={() => void saveFolder()} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{savingFolder ? 'Đang lưu...' : 'Lưu folder test'}</button><button type="button" disabled={savingFolder} onClick={() => setEditingFolder(false)} className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-500">Hủy</button></div></div></div> : null}
  </div>;
}
