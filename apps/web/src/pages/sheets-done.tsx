import { useMemo, useState } from 'react';
import { CircleCheckBig } from 'lucide-react';
import type { DashboardData } from '../api/types';
import { DataTable } from '../components/DataTable';
import { DetailPanel } from '../components/DetailPanel';
import { MetricCard } from '../components/MetricCard';
import { Panel } from '../components/Panel';
import { PaginationBar, paginateItems } from '../components/Pagination';
import { ProgressBar } from '../components/ProgressBar';
import { SectionTitle } from '../components/utils';
import { FileThumbnail } from '../components/FileThumbnail';
import { StatusBadge } from '../components/StatusBadge';
import { DoneRow, SheetRow } from './shared';

export function SheetsPage({ data }: { data: DashboardData }) {
  const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(10);
  const paged = useMemo(() => paginateItems(data.sheet.items, page, pageSize), [data.sheet.items, page, pageSize]); const selected = paged.items[0] ?? data.sheet.items[0];
  return <div className="grid gap-6 xl:grid-cols-[1.45fr_0.95fr]"><div className="space-y-6"><SectionTitle title="Sheets" subtitle="Theo dõi item đang được đặt lên sheet hiện tại."/><Panel><DataTable headers={['#','Ảnh','Tên file','Turn','Size','Xoay','Vị trí','Trạng thái']}>{paged.items.map((item) => <SheetRow key={`${item.index}-${item.fileName}`} item={item}/>)}</DataTable><PaginationBar page={paged.currentPage} totalPages={paged.totalPages} totalItems={paged.total} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} /></Panel></div><DetailPanel title="Chi tiết sheet">{selected ? <FileThumbnail scope={selected.previewScope} relativePath={selected.previewRelativePath} fileName={selected.fileName} className="h-[520px] w-full" fit="contain"/> : null}</DetailPanel></div>;
}

export function DonePage({ data }: { data: DashboardData }) {
  const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(10); const [selectedId, setSelectedId] = useState<string | null>(null); const [search, setSearch] = useState('');
  const filtered = useMemo(() => data.done.filter((item) => item.fileName.toLowerCase().includes(search.trim().toLowerCase())), [data.done, search]);
  const paged = useMemo(() => paginateItems(filtered, page, pageSize), [filtered, page, pageSize]);
  const selected = filtered.find((item) => item.id === selectedId) ?? paged.items[0] ?? filtered[0];
  return <div className="grid gap-6 xl:grid-cols-[1.45fr_0.95fr]"><div className="space-y-6"><SectionTitle title="Đã xong" subtitle="Tìm theo tên file, click hàng để xem chi tiết; click ảnh để mở preview."/><div className="grid gap-4 xl:grid-cols-4"><MetricCard icon={CircleCheckBig} label="Tổng hoàn thành" value={filtered.length} tone="green"/><MetricCard icon={CircleCheckBig} label="Đủ qty" value={filtered.filter((item) => item.status === 'complete').length} tone="blue"/><MetricCard icon={CircleCheckBig} label="Còn qty" value={filtered.filter((item) => item.status === 'partial').length} tone="orange"/><MetricCard icon={CircleCheckBig} label="Hôm nay" value={filtered.filter((item) => item.completedDate === filtered[0]?.completedDate).length} tone="violet"/></div><Panel><div className="mb-4"><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); setSelectedId(null); }} placeholder="Tìm theo tên file..." className="h-12 w-full rounded-2xl border border-slate-200 px-4 outline-none focus:border-blue-500 xl:max-w-md" /></div><DataTable headers={['Ảnh','Tên file','Size','Side','Qty','Đã đặt','Sheet','Ngày hoàn thành','Trạng thái']}>{paged.items.map((item) => <DoneRow key={item.id} item={item} selected={item.id === selected?.id} onSelect={(row) => setSelectedId(row.id)} />)}</DataTable><PaginationBar page={paged.currentPage} totalPages={paged.totalPages} totalItems={paged.total} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} /></Panel></div><DetailPanel title="Chi tiết hoàn thành">{selected ? <div className="space-y-4"><FileThumbnail scope={selected.previewScope} relativePath={selected.previewRelativePath} fileName={selected.fileName} className="h-[520px] w-full" fit="contain"/><div className="flex gap-2"><StatusBadge label={`${selected.sizeInch}in`} tone="blue"/><StatusBadge label={selected.side} tone="blue"/><StatusBadge label={`Qty ${selected.requestedQty}`} tone="blue"/></div><div className="rounded-2xl border border-slate-200 p-4 text-sm"><div className="flex justify-between"><span>Tên file</span><b>{selected.fileName}</b></div><div className="mt-3 flex justify-between"><span>Ngày hoàn thành</span><b>{selected.completedDate}</b></div><div className="mt-3 flex justify-between"><span>Giờ hoàn thành</span><b>{selected.completedAt}</b></div><div className="mt-3 flex justify-between"><span>Sheet</span><b>{selected.sheet}</b></div><div className="mt-3 flex justify-between"><span>Tiến độ</span><b>{selected.placedQty} / {selected.requestedQty}</b></div><div className="mt-3"><ProgressBar value={selected.placedQty} max={selected.requestedQty} color="green"/></div><div className="mt-4 flex justify-between"><span>Nhóm nguồn</span><b>{selected.sourceGroup}</b></div></div></div> : <div className="flex min-h-[320px] items-center justify-center text-center text-sm font-medium text-slate-500">Chưa có dữ liệu hoàn thành để hiển thị.</div>}</DetailPanel></div>;
}
export function ProcessedPage({ data }: { data: DashboardData }) { return <DonePage data={{ ...data, done: data.processed }} />; }
