import { useEffect, useMemo, useState } from 'react';
import { Activity, CheckCircle2, CircleAlert, CircleCheckBig, Clock3, Loader2, Play, TerminalSquare, XCircle } from 'lucide-react';
import { apiBase, vietnamDateTime } from '../api/client';
import { Panel } from '../components/Panel';
import { SectionTitle } from '../components/utils';
import { StatusBadge } from '../components/StatusBadge';

type Command = 'start' | 'check' | 'test';
type StepStatus = 'running' | 'success' | 'error';
type ToolStep = { index: number; total: number; step: string; fileName: string; status: StepStatus; message: string };
type ToolRun = { id: string; kind?: 'tool' | 'export'; command: Command; exportAssets?: Array<'front' | 'back' | 'lazer'>; outputAiRelativePath?: string; status: 'idle' | 'running' | 'error' | 'completed'; startedAt: string; endedAt?: string; exitCode?: number | null; logs: string[]; steps?: ToolStep[]; currentStep?: ToolStep | null };
type ToolStatus = { running: boolean; run: ToolRun | null };
type SnapshotEvent = { kpi?: { queue?: number } };


function fixVietnameseLog(value: string) {
  let text = String(value ?? '');
  const replacements: Array<[string, string]> = [
    ['kh?ng', 'kh?ng'], ['c?n', 'c?n'], ['tr?i', 'tr?i'], ['ph?i', 'ph?i'], ['l?ch', 'l?ch'],
    ['Kh?ng', 'Kh?ng'], ['Lazer kh?ng c?n tr?i/ph?i', 'Lazer kh?ng c?n tr?i/ph?i'],
    ['kh?ng', 'kh?ng'], ['c?n', 'c?n'], ['tr?i', 'tr?i'], ['ph?i', 'ph?i'], ['l?ch', 'l?ch'],
  ];
  for (const [from, to] of replacements) text = text.split(from).join(to);
  return text;
}

const commandInfo: Array<{ command: Command; title: string; description: string; tone: string }> = [
  { command: 'start', title: 'Chạy Tool', description: 'npm run start · chạy theo cấu hình check trong Cài đặt', tone: 'border-blue-300 bg-blue-600 text-white hover:bg-blue-700' },
  { command: 'check', title: '\u0058em s\u1eafp x\u1ebfp m\u1ed9t item', description: 'npm run check \u00b7 b\u1ecf qua check l\u1ed7i, trace v\u00e0 s\u1eafp x\u1ebfp th\u1eed 1 item', tone: 'border-amber-300 bg-amber-500 text-white hover:bg-amber-600' },
  { command: 'test', title: 'Test import 1 ảnh', description: 'npm run test · chỉ import một PNG vào Illustrator', tone: 'border-violet-300 bg-violet-600 text-white hover:bg-violet-700' },
];

const stepLabel: Record<string, string> = {
  TRACE_LAZER: 'Đang trace lazer',
  LAZER_READY: 'Lazer đã sẵn sàng',
  PRINT_READY: 'Print đã sẵn sàng',
  PACKING: 'Đã sắp xếp',
  CHECK_COMPARE_TRUE: 'Check đúng',
  CHECK_COMPARE_FALSE: 'Check sai',
  ERROR: 'Có lỗi',
};

async function readToolStatus(): Promise<ToolStatus> {
  const response = await fetch(`${apiBase}/tool/status`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Không thể đọc trạng thái Tool (${response.status}).`);
  return response.json() as Promise<ToolStatus>;
}

function StepIcon({ status }: { status: StepStatus }) {
  if (status === 'success') return <CheckCircle2 className="h-5 w-5 text-emerald-600" />;
  if (status === 'error') return <XCircle className="h-5 w-5 text-rose-600" />;
  return <Loader2 className="h-5 w-5 animate-spin text-blue-600" />;
}

function StepCard({ step }: { step: ToolStep }) {
  if (step.step === 'PACKING') return <div className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-4"><div className="mt-0.5"><StepIcon status={step.status} /></div><div className="min-w-0 flex-1 truncate font-semibold text-slate-900">Đã sắp xếp: <span className="font-medium text-slate-700">{step.fileName}</span></div></div>;
  return <div className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-4"><div className="mt-0.5"><StepIcon status={step.status} /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><div className="font-semibold text-slate-900">{stepLabel[step.step] ?? step.step}</div><StatusBadge label={`${step.index}`} tone={step.status === 'error' ? 'red' : step.status === 'success' ? 'green' : 'blue'} /></div><div className="mt-1 truncate text-sm text-slate-600">{step.fileName}</div>{step.status === 'error' ? <div className="mt-2 text-sm text-rose-600">{step.message}</div> : null}</div></div>;
}

export function ToolPage() {
  const [status, setStatus] = useState<ToolStatus>(() => {
    try { return JSON.parse(window.localStorage.getItem('acrylic:tool-status') ?? '') as ToolStatus; } catch { return { running: false, run: null }; }
  });
  const [message, setMessage] = useState('Sẵn sàng chạy Tool trên máy local.');
  const [isLaunching, setIsLaunching] = useState(false);
  const [imagesCount, setImagesCount] = useState<number | null>(null);

  useEffect(() => {
    void readToolStatus().then(setStatus).catch((error: Error) => setMessage(error.message));
    const events = new EventSource(`${apiBase}/tool/events`);
    events.addEventListener('tool', (event) => setStatus(JSON.parse((event as MessageEvent).data) as ToolStatus));
    events.onerror = () => setMessage('Đang kết nối lại luồng realtime của Tool...');
    const snapshotEvents = new EventSource(`${apiBase}/events`);
    snapshotEvents.addEventListener('snapshot', (event) => {
      const snapshot = JSON.parse((event as MessageEvent).data) as SnapshotEvent;
      setImagesCount(Number(snapshot.kpi?.queue ?? 0));
    });
    const refreshImagesCount = () => {
      void fetch(`${apiBase}/queue`, { cache: 'no-store' })
        .then((response) => response.ok ? response.json() : [])
        .then((files: unknown[]) => setImagesCount(Array.isArray(files) ? files.length : 0))
        .catch(() => undefined);
    };
    window.addEventListener('acrylic:folders-changed', refreshImagesCount);
    return () => { events.close(); snapshotEvents.close(); window.removeEventListener('acrylic:folders-changed', refreshImagesCount); };
  }, []);

  useEffect(() => {
    window.localStorage.setItem('acrylic:tool-status', JSON.stringify(status));
  }, [status]);

  const run = async (command: Command) => {
    if (status.running || isLaunching || imagesCount === 0) {
      if (imagesCount === 0) setMessage('Không thể chạy Tool vì folder Images hiện không có ảnh.');
      return;
    }
    setIsLaunching(true);
    try {
      setMessage(`Đang gửi lệnh npm run ${command}...`);
      const response = await fetch(`${apiBase}/tool/run`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command }) });
      const contentType = response.headers.get('content-type') ?? '';
      const result = contentType.includes('application/json')
        ? await response.json() as { ok: boolean; message: string; run: ToolRun | null }
        : { ok: false, message: await response.text(), run: null };
      setMessage(result.message || `Không thể chạy Tool (${response.status}).`);
      if (result.run) setStatus({ running: result.run.status === 'running', run: result.run });
      if (!response.ok || !result.ok) return;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không thể chạy Tool.');
    } finally {
      setIsLaunching(false);
    }
  };

  const postToolAction = async (action: 'stop' | 'reset') => {
    try {
      setMessage(action === 'stop' ? 'Đang dừng Tool...' : 'Đang khôi phục trạng thái...');
      const response = await fetch(`${apiBase}/tool/${action}`, { method: 'POST' });
      if (!response.ok) throw new Error(`Không thể ${action === 'stop' ? 'dừng Tool' : 'khôi phục trạng thái'} (${response.status}).`);
      setStatus(await response.json() as ToolStatus);
      setMessage(action === 'stop' ? 'Đã gửi lệnh dừng Tool.' : 'Đã khôi phục trạng thái về bình thường.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không thể thao tác với Tool.');
    }
  };

  const imagesEmpty = imagesCount === 0;
  const buttonsDisabled = status.running || isLaunching || imagesEmpty;
  const isExporting = status.running && status.run?.kind === 'export';
  const steps = status.run?.steps ?? [];
  const sessionSteps = steps.filter((step) => step.step === 'PACKING').slice(-120);
  const current = sessionSteps.at(-1) ?? null;
  const currentStepOnly = current ? 'Đã sắp xếp' : null;
  const rawLogs = (status.run?.logs?.slice(-80) ?? []).map(fixVietnameseLog);
  const statusLabel = status.running ? `Đang chạy npm run ${status.run?.command}` : status.run?.status === 'completed' ? 'Đã chạy xong' : status.run?.status === 'error' ? 'Tool có lỗi' : 'Chưa chạy';
  const statusTone = status.running ? 'blue' : status.run?.status === 'completed' ? 'green' : status.run?.status === 'error' ? 'red' : 'slate';
  const startedAt = useMemo(() => status.run?.startedAt ? new Date(status.run.startedAt).toLocaleString('vi-VN') : '—', [status.run?.startedAt]);

  return <div className="space-y-6"><SectionTitle title="Tool" subtitle="Chạy trực tiếp Tool Acrylic trên máy local và xem tiến trình đẹp theo thời gian thực."/>{imagesEmpty ? <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Folder Images hiện có 0 ảnh. Hãy thêm ảnh trước khi chạy Tool.</div> : null}<div className="grid gap-4 xl:grid-cols-3">{commandInfo.map(({ command, title, description, tone }) => <button key={command} type="button" disabled={buttonsDisabled} aria-disabled={buttonsDisabled} onClick={() => void run(command)} className={`rounded-[28px] border p-6 text-left shadow-[0_12px_40px_rgba(15,23,42,0.04)] transition disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40 disabled:grayscale ${tone}`}><div className="flex items-center justify-between"><Play className="h-7 w-7"/><span className="text-sm font-semibold uppercase tracking-wide">npm run {command}</span></div><div className="mt-8 text-xl font-semibold">{title}</div><div className="mt-2 text-sm opacity-90">{description}</div></button>)}</div><div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.95fr)]"><div className="min-w-0"><Panel title="Tiến trình xử lý" right={<StatusBadge label={statusLabel} tone={statusTone} />}>{current ? <div className="mb-4 rounded-[24px] border border-emerald-200 bg-emerald-50 p-5"><div className="flex items-center gap-3"><CheckCircle2 className="h-6 w-6 text-emerald-600"/><div><div className="text-lg font-semibold text-emerald-900">{currentStepOnly}</div><div className="mt-1 break-all text-sm text-emerald-700">{current.fileName}</div></div><StatusBadge label={`${current.index}`} tone="green" /></div></div> : <div className="mb-4 rounded-[24px] border border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">Chưa có bước xử lý. Hãy bấm một lệnh để chạy Tool.</div>}<div className="max-h-[560px] space-y-3 overflow-auto pr-1">{sessionSteps.length ? sessionSteps.map((step, index) => <StepCard key={`${status.run?.id ?? 'run'}-${step.index}-${step.step}-${step.fileName}-${index}`} step={{ ...step, status: step.step === 'PACKING' ? 'success' : step.status }} />) : <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">Timeline sẽ hiện ở đây khi Tool bắt đầu chạy.</div>}</div></Panel></div><div className="min-w-0 space-y-6"><Panel title="Trạng thái xử lý"><div className="space-y-4 text-sm"><div className="flex items-center gap-3"><Activity className={status.running ? 'h-6 w-6 text-blue-600' : 'h-6 w-6 text-slate-400'} /><div><div className="font-semibold">{isExporting ? 'Đang export thành phẩm' : status.running ? 'Tool đang xử lý' : 'Tool đang chờ'}</div><div className="text-slate-500">{message}</div></div></div><div className="rounded-2xl border border-slate-200 p-4"><div className="flex justify-between"><span>Tiến trình</span><b>{status.run ? status.run.kind === 'export' ? `Export ${(status.run.exportAssets ?? []).join(', ').toUpperCase()}` : `npm run ${status.run.command}` : '—'}</b></div><div className="mt-3 flex justify-between"><span>Bắt đầu</span><b>{startedAt}</b></div><div className="mt-3 flex justify-between"><span>Item hiện tại</span><b className="max-w-[220px] truncate text-right">{current?.fileName ?? '—'}</b></div><div className="mt-3 flex justify-between"><span>Mã kết thúc</span><b>{status.run?.exitCode ?? '—'}</b></div></div><div className="grid grid-cols-2 gap-3"><button type="button" disabled={!status.running} onClick={() => void postToolAction('stop')} className="h-12 rounded-2xl border border-rose-300 text-sm font-semibold text-rose-600 disabled:cursor-not-allowed disabled:opacity-40">Dừng Tool</button><button type="button" onClick={() => void postToolAction('reset')} className="h-12 rounded-2xl border border-blue-300 text-sm font-semibold text-blue-700">Khôi phục trạng thái</button></div></div></Panel><Panel title="Log kỹ thuật"><details className="text-sm"><summary className="cursor-pointer font-semibold text-slate-700">Mở log CMD gốc khi cần debug</summary><pre className="mt-3 max-h-[140px] max-w-full overflow-auto whitespace-pre-wrap break-all rounded-2xl bg-slate-950 p-3 font-mono text-[10px] leading-4 text-slate-100">{rawLogs.length ? rawLogs.join('\n') : 'Chưa có log.'}</pre></details></Panel><Panel title="Cách hoạt động"><div className="space-y-3 text-sm text-slate-600"><div className="flex gap-3"><TerminalSquare className="h-5 w-5 shrink-0 text-blue-600"/><span>Lệnh vẫn chạy trong `D:\\FFACTORY\\Arcylic\\Tool` như CMD bình thường.</span></div><div className="flex gap-3"><CircleCheckBig className="h-5 w-5 shrink-0 text-emerald-600"/><span>Timeline tự đổi theo log thật; khi process kết thúc sẽ cập nhật lỗi hoặc hoàn thành trên toàn bộ dashboard.</span></div><div className="flex gap-3"><CircleAlert className="h-5 w-5 shrink-0 text-amber-600"/><span>Chỉ chạy một lệnh một lúc để tránh Illustrator bị xung đột.</span></div></div></Panel></div></div></div>;
}
