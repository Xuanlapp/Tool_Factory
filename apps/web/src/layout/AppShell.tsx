import { useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, FileText, FolderOpen, History, LayoutDashboard, Layers3, ListTodo, Package, PanelLeftOpen, Settings, Shirt, Sparkles, Sticker } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { cn } from '../components/utils';

type NavItem = { path: string; label: string; icon: typeof LayoutDashboard; disabled?: boolean };
type ProductGroup = { title: string; label: string; icon: typeof LayoutDashboard; items: NavItem[]; disabled?: boolean; defaultOpen?: boolean };

const productGroups: ProductGroup[] = [
  {
    title: 'Acrylic',
    label: 'Acrylic',
    icon: Layers3,
    defaultOpen: true,
    items: [
      { path: '/', label: 'Tổng quan', icon: LayoutDashboard },
      { path: '/queue', label: 'Hàng chờ', icon: ListTodo },
      { path: '/tool', label: 'Tool', icon: Layers3 },
      { path: '/done', label: 'Đã xong', icon: CheckCircle2 },
      { path: '/processed', label: 'Processed', icon: CheckCircle2 },
      { path: '/errors', label: 'Ảnh lỗi', icon: AlertTriangle },
      { path: '/outputs', label: 'Thành phẩm', icon: Package },
      { path: '/history', label: 'Lịch sử', icon: History },
      { path: '/settings', label: 'Cấu hình', icon: Settings },
    ],
  },
  { title: 'Sticker', label: 'Sticker', icon: Sticker, disabled: true, defaultOpen: false, items: [{ path: '/sticker', label: 'Tổng quan', icon: LayoutDashboard, disabled: true }] },
  { title: 'DTF', label: 'DTF', icon: Shirt, disabled: true, defaultOpen: false, items: [{ path: '/dtf', label: 'Tổng quan', icon: LayoutDashboard, disabled: true }] },
  { title: 'UV DTF', label: 'UV DTF', icon: Sparkles, disabled: true, defaultOpen: false, items: [{ path: '/uvdtf', label: 'Tổng quan', icon: LayoutDashboard, disabled: true }] },
];

function State({ label, value, good }: { label: string; value: string; good: boolean }) { return <div className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[15px] text-slate-700"><span className={cn('h-3 w-3 rounded-full', good ? 'bg-emerald-500' : 'bg-rose-500')} />{label} · {value}</div>; }

function SidebarItem({ item }: { item: NavItem }) {
  const Icon = item.icon;
  if (item.disabled) return <div title={item.label} className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-[15px] text-slate-400"><Icon className="h-4 w-4 shrink-0"/><span className="whitespace-nowrap opacity-0 group-hover/sidebar:opacity-100">{item.label}</span><span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase opacity-0 group-hover/sidebar:opacity-100">Soon</span></div>;
  return <NavLink to={item.path} end={item.path === '/'} title={item.label} className={({ isActive }) => cn('flex items-center gap-3 rounded-2xl px-3 py-2.5 text-[15px] font-medium', isActive ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-slate-100')}><Icon className="h-4 w-4 shrink-0"/><span className="whitespace-nowrap opacity-0 group-hover/sidebar:opacity-100">{item.label}</span></NavLink>;
}

function ProductSection({ group }: { group: ProductGroup }) {
  const Icon = group.icon;
  const [open, setOpen] = useState(group.defaultOpen ?? true);
  return <section className="space-y-2"><button type="button" onClick={() => setOpen((value) => !value)} title={group.label} className={cn('flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left ', group.disabled ? 'border-slate-100 bg-slate-50 text-slate-400' : 'border-blue-100 bg-blue-50 text-blue-800 hover:bg-blue-100')}><Icon className="h-5 w-5 shrink-0"/><span className="whitespace-nowrap font-semibold opacity-0 group-hover/sidebar:opacity-100">{group.label}</span><ChevronDown className={cn('ml-auto h-4 w-4 opacity-0 group-hover/sidebar:opacity-100', open ? 'rotate-180' : 'rotate-0')} /></button><div className={cn('overflow-hidden pl-4 ', open ? 'max-h-[1000px] opacity-100' : 'max-h-0 opacity-0')}><div className="space-y-1 pt-1">{group.items.map((item) => <SidebarItem key={item.path} item={item} />)}</div></div></section>;
}

function Sidebar() {
  return <aside className="group/sidebar fixed inset-y-0 left-0 z-40 w-[72px] overflow-hidden border-r border-slate-200 bg-white shadow-[0_12px_40px_rgba(15,23,42,0.04)] hover:w-[292px]"><div className="flex h-full w-[292px] flex-col"><div className="flex h-[92px] items-center gap-4 border-b border-slate-200 px-4"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-600"><PanelLeftOpen className="h-5 w-5" /></div><div className="min-w-0 whitespace-nowrap opacity-0 group-hover/sidebar:opacity-100"><div className="text-[24px] font-semibold tracking-[-0.04em] text-slate-900">Factory Hub</div><div className="mt-1 text-sm text-slate-500">v0.2.7</div></div></div><nav className="flex-1 space-y-5 overflow-y-auto px-2 py-5 group-hover/sidebar:px-4">{productGroups.map((group) => <ProductSection key={group.title} group={group} />)}</nav></div></aside>;
}

export function AppShell({ currentFile, runnerStatus, illustratorConnected, children }: { currentFile: string; runnerStatus: string; illustratorConnected: boolean; children: ReactNode }) {
  return <div className="min-h-screen bg-[#f8faff] text-slate-800"><Sidebar /><div className="min-h-screen pl-[72px]"><div className="mx-auto flex min-h-screen max-w-[1680px] flex-col gap-6 px-4 py-4 lg:px-6"><header className="sticky top-4 z-30 rounded-[28px] border border-slate-200 bg-white shadow-[0_12px_40px_rgba(15,23,42,0.04)]"><div className="flex flex-wrap items-start justify-between gap-4 px-6 py-5 lg:px-8"><div><div className="text-[34px] font-semibold tracking-[-0.04em] text-slate-900">Acrylic Production</div><div className="text-[17px] text-slate-500">Factory Control Dashboard</div></div><div className="flex flex-wrap items-center gap-3"><State label="Tool" value={runnerStatus === 'running' ? 'Đang chạy' : 'Đang chờ'} good={runnerStatus !== 'error'} /><State label="Illustrator" value={illustratorConnected ? 'Đã kết nối' : 'Mất kết nối'} good={illustratorConnected} /><button className="inline-flex h-14 max-w-[340px] items-center gap-3 rounded-2xl border border-slate-200 px-5 text-left text-[16px] text-slate-800"><FileText className="h-5 w-5 shrink-0 text-blue-700"/><span className="truncate">{currentFile}</span></button><button className="inline-flex h-14 items-center gap-3 rounded-2xl border border-blue-300 px-5 text-[16px] font-medium text-blue-700"><FolderOpen className="h-5 w-5"/>Mở thư mục</button></div></div></header><main className="px-1 py-2">{children}</main></div></div></div>;
}


