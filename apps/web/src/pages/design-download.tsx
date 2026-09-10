import { useRef, useState } from 'react';
import { CheckCircle2, Download, FileSpreadsheet, Loader2, TriangleAlert, Upload } from 'lucide-react';
import { apiBase } from '../api/client';
import { Panel } from '../components/Panel';
import { SectionTitle } from '../components/utils';

type PreviewRow = { row: number; fileName: string; designUrl: string };
type DownloadResult = { row: number; fileName: string; ok: boolean; message: string };
type ImportResult = { ok: boolean; message?: string; total: number; downloaded: number; failed: number; results: DownloadResult[] };

const defaultPattern = '{{flow}}_{{orderId}}_{{item}}_{{productName}}-{{size}}-st_qty_{{quantity}}';

function DesignThumbnail({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);
  const fileId = url.match(/\/d\/([\w-]+)/)?.[1] ?? url.match(/[?&]id=([\w-]+)/)?.[1];
  if (failed || !fileId) return <span className="text-xs text-slate-400">Không có preview</span>;
  return <img src={'https://drive.google.com/thumbnail?id=' + encodeURIComponent(fileId) + '&sz=w160'} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} alt="Preview thiết kế" className="h-16 w-16 rounded-lg border object-contain" />;
}

export function DesignDownloadPage() {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const pattern = defaultPattern;
  const [running, setRunning] = useState(false);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [message, setMessage] = useState('Chọn file Excel để đọc danh sách Link Design.');
  const [result, setResult] = useState<ImportResult | null>(null);

  const chooseFile = (next: File | null) => {
    if (running) return;
    setFile(next);
    setRows([]);
    setResult(null);
    setMessage(next ? `Đã chọn ${next.name}.` : 'Chọn file Excel để đọc danh sách Link Design.');
    if (next) void upload(true, next);
  };

  const upload = async (previewOnly = false, selectedFile = file) => {
    if (!selectedFile || running) return;
    setRunning(true);
    if (previewOnly) setResult(null);
    setMessage(previewOnly ? 'Đang đọc Excel để xem trước...' : 'Đang tải toàn bộ ảnh...');
    try {
      const buffer = await selectedFile.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
      const response = await fetch(`${apiBase}/design-download/${previewOnly ? 'preview' : 'import'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: selectedFile.name, fileBase64: btoa(binary), namingPattern: pattern, selectedRows: previewOnly ? undefined : rows.map(row => row.row) }),
      });
      const data = await response.json() as ImportResult & { rows?: PreviewRow[] };
      if (previewOnly) {
        if (!response.ok) throw new Error(data.message || 'Không thể đọc Excel.');
        if (!data.rows?.length) throw new Error('Không tìm thấy dòng có Link Design trong sheet đầu tiên.');
        setRows(data.rows);
        setMessage('Kiểm tra ảnh và tên trong bảng, rồi bấm Download All.');
        return;
      }
      if (!response.ok && !data.results) throw new Error(data.message || 'Không thể tải ảnh.');
      const succeeded = new Set(data.results.filter(item => item.ok).map(item => item.row));
      setRows(current => current.filter(row => !succeeded.has(row.row)));
      setResult(data);
      setMessage(`Đã tải ${data.downloaded}/${data.total} ảnh.${data.failed ? ` Có ${data.failed} ảnh lỗi.` : ''}`);
      if (data.downloaded) window.dispatchEvent(new Event('acrylic:folders-changed'));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không thể tải ảnh.');
    } finally {
      setRunning(false);
    }
  };

  return <div className="space-y-6">
    <SectionTitle title="Tải ảnh thiết kế" subtitle="Đọc file Excel, tải từng Link Design và đưa ảnh vào hàng chờ của sản phẩm đang mở." />
    <Panel className="p-6">
      <div className="space-y-4">
        <div className="rounded-2xl border border-dashed border-blue-300 bg-blue-50/40 p-6">
          <FileSpreadsheet className="h-10 w-10 text-blue-700" />
          <div className="mt-4 text-lg font-semibold text-slate-900">File Excel đơn hàng</div>
          <p className="mt-2 text-sm leading-6 text-slate-600">Cần các cột: <code>FBM/FBA</code>, <code>Product Name</code>, <code>Order ID</code>, <code>Size</code>, <code>Quantity</code>, <code>Link Design</code>.</p>
          <input ref={input} type="file" disabled={running} accept=".xlsx,.xls,.csv" className="hidden" onChange={(event) => chooseFile(event.target.files?.[0] ?? null)} />
          <button type="button" disabled={running} onClick={() => input.current?.click()} className="mt-5 inline-flex h-11 items-center gap-2 rounded-xl border border-blue-300 bg-white px-4 font-semibold text-blue-700 hover:bg-blue-50"><Upload className="h-4 w-4" />Chọn Excel</button>
          <div className="mt-4 truncate text-sm font-medium text-slate-700">{file?.name ?? 'Chưa chọn file'}</div>
        </div>
        <div className="flex items-center">
          <button type="button" disabled={!file || running || result !== null} onClick={() => void upload(true)} className="mt-5 inline-flex h-12 items-center gap-2 rounded-xl bg-blue-600 px-5 font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300 hover:bg-blue-700">{running ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}{running ? 'Đang tải ảnh...' : 'Import Excel / Xem preview'}</button>
        </div>
      </div>
      <div className="mt-5 flex items-center gap-2 text-sm text-slate-600">{result?.failed ? <TriangleAlert className="h-4 w-4 text-amber-500" /> : <CheckCircle2 className="h-4 w-4 text-emerald-600" />}{message}</div>
    </Panel>
    {rows.length > 0 ? <Panel className="p-6"><div className="mb-4 flex items-center justify-between"><h2 className="font-semibold">Preview — {rows.length} ảnh</h2><button disabled={running} onClick={() => void upload(false)} className="rounded-xl bg-blue-600 px-5 py-3 text-white disabled:bg-slate-300">{running ? 'Đang tải...' : result ? 'Tải lại ảnh lỗi' : 'Download All'}</button></div><div className="max-h-[600px] overflow-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-3">Ảnh</th><th className="p-3">Tên sau khi tải</th><th className="p-3">Lỗi</th></tr></thead><tbody>{rows.map((row) => <tr key={row.row} className="border-t"><td className="p-3"><DesignThumbnail url={row.designUrl} /></td><td className="p-3 break-all font-mono">{row.fileName}</td><td className="p-3 text-rose-600">{result?.results.find(item => item.row === row.row && !item.ok)?.message ?? '—'}</td></tr>)}</tbody></table></div></Panel> : null}
    {result?.failed ? <Panel className="overflow-hidden"><div className="border-b border-slate-200 px-6 py-4 text-lg font-semibold">Kết quả tải ảnh</div><div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-slate-500"><tr><th className="px-5 py-3">Dòng</th><th className="px-5 py-3">Tên ảnh</th><th className="px-5 py-3">Trạng thái</th><th className="px-5 py-3">Chi tiết</th></tr></thead><tbody>{result.results.filter(item => !item.ok).map((item) => <tr key={`${item.row}-${item.fileName}`} className="border-t border-slate-100"><td className="px-5 py-3">{item.row}</td><td className="px-5 py-3 font-mono text-xs">{item.fileName}</td><td className={`px-5 py-3 font-semibold ${item.ok ? 'text-emerald-700' : 'text-rose-600'}`}>{item.ok ? 'Đã tải' : 'Lỗi'}</td><td className="px-5 py-3 text-slate-600">{item.message}</td></tr>)}</tbody></table></div></Panel> : null}
  </div>;
}
