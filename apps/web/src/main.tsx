import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { AppShell } from './layout/AppShell';
import { ImagePreviewModal } from './components/ImagePreviewModal';
import { getDashboardData, subscribeDashboard } from './api/repository';
import type { DashboardData, DashboardSummary } from './api/types';
import { DonePage, ErrorsPage, HistoryPage, OverviewPage, OutputsPage, ProcessedPage, QueuePage, SettingsPage, SheetsPage, ToolPage } from './pages';
import './styles.css';

const queryClient = new QueryClient();

function ResponsiveAppScale() {
  useEffect(() => {
    let frame = 0;
    let previousScale = 1;
    const updateScale = () => {
      frame = 0;
      const widthScale = window.innerWidth / 1440;
      const heightScale = window.innerHeight / 960;
      const rawScale = Math.max(0.8, Math.min(1.15, Math.min(widthScale, heightScale)));
      const scale = Math.round(rawScale * 20) / 20;
      if (Math.abs(scale - previousScale) < 0.049) return;
      previousScale = scale;
      document.documentElement.style.setProperty('--app-scale', String(scale));
    };
    const scheduleScale = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(updateScale);
    };
    updateScale();
    window.addEventListener('resize', scheduleScale, { passive: true });
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', scheduleScale);
    };
  }, []);
  return null;
}

function Loading() { return <div className="flex min-h-screen items-center justify-center bg-[#f8faff] text-lg text-slate-500">Đang tải Acrylic Production...</div>; }

function DashboardRoutes() {
  const dashboard = useQuery({ queryKey: ['dashboard'], queryFn: getDashboardData, refetchInterval: 30_000, staleTime: 10_000 });
  const [live, setLive] = useState<Partial<DashboardSummary> | null>(null);
  const lastFolderFingerprint = useRef('');
  const [preview, setPreview] = useState<{ src: string; fileName: string } | null>(null);
  useEffect(() => subscribeDashboard((summary) => {
    setLive(summary);
    const kpi = summary.kpi;
    const fingerprint = [kpi?.queue, kpi?.done, kpi?.errors, kpi?.wait, kpi?.outputAi, kpi?.outputFront, kpi?.outputBack, kpi?.outputLazer].join('|');
    if (fingerprint && lastFolderFingerprint.current && fingerprint !== lastFolderFingerprint.current) {
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    }
    if (fingerprint) lastFolderFingerprint.current = fingerprint;
  }), []);
  useEffect(() => {
    const refreshFolders = () => { void queryClient.invalidateQueries({ queryKey: ['dashboard'] }); };
    window.addEventListener('acrylic:folders-changed', refreshFolders);
    return () => window.removeEventListener('acrylic:folders-changed', refreshFolders);
  }, []);
  useEffect(() => {
    const openPreview = (event: Event) => setPreview((event as CustomEvent<{ src: string; fileName: string }>).detail);
    window.addEventListener('acrylic:preview-file', openPreview);
    return () => window.removeEventListener('acrylic:preview-file', openPreview);
  }, []);
  if (!dashboard.data) return <Loading />;
  const data: DashboardData = live ? { ...dashboard.data, summary: { ...dashboard.data.summary, ...live, kpi: { ...dashboard.data.summary.kpi, ...live.kpi } } } : dashboard.data;
  return <> <ResponsiveAppScale />{preview ? <ImagePreviewModal src={preview.src} fileName={preview.fileName} onClose={() => setPreview(null)} /> : null}<AppShell currentFile={data.summary.currentFile} runnerStatus={data.summary.runnerStatus} illustratorConnected={data.summary.illustratorConnected}>
    <Routes>
      <Route path="/" element={<OverviewPage data={data} />} />
      <Route path="/queue" element={<QueuePage data={data} />} />
      <Route path="/tool" element={<ToolPage />} />
      <Route path="/sheets" element={<ToolPage />} />
      <Route path="/done" element={<DonePage data={data} />} />
      <Route path="/processed" element={<ProcessedPage data={data} />} />
      <Route path="/errors" element={<ErrorsPage data={data} />} />
      <Route path="/outputs" element={<OutputsPage data={data} />} />
      <Route path="/history" element={<HistoryPage data={data} />} />
      <Route path="/settings" element={<SettingsPage data={data} />} />
      <Route path="*" element={<OverviewPage data={data} />} />
    </Routes>
  </AppShell></>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><QueryClientProvider client={queryClient}><BrowserRouter><DashboardRoutes /></BrowserRouter></QueryClientProvider></StrictMode>);
