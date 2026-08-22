const { app, BrowserWindow, shell, dialog, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const webUrl = process.env.ACRYLIC_WEB_URL || 'http://127.0.0.1:5173';
const debug = /^(1|true|yes)$/i.test(process.env.ACRYLIC_DEBUG || '');
let webProcess = null;
let updateDownloaded = false;
let updateProgressWindow = null;

async function isToolBusy() {
  try {
    const response = await fetch('http://127.0.0.1:5173/api/v1/tool/status', { signal: AbortSignal.timeout(1500) });
    if (!response.ok) return false;
    const payload = await response.json();
    return Boolean(payload?.running);
  } catch {
    return false;
  }
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function closeUpdateProgressWindow() {
  if (updateProgressWindow && !updateProgressWindow.isDestroyed()) updateProgressWindow.close();
  updateProgressWindow = null;
}

function showUpdateProgressWindow() {
  closeUpdateProgressWindow();
  updateProgressWindow = new BrowserWindow({
    width: 460, height: 210, resizable: false, minimizable: false, maximizable: false,
    title: 'Đang tải bản cập nhật', alwaysOnTop: true,
    parent: BrowserWindow.getFocusedWindow() || undefined,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  updateProgressWindow.setMenuBarVisibility(false);
  const html = `<!doctype html><html lang="vi"><meta charset="utf-8"><style>body{font-family:Segoe UI,sans-serif;margin:0;padding:28px;background:#f8faff;color:#172033}h3{margin:0 0 12px;font-size:18px}p{margin:0 0 16px;color:#526078}progress{width:100%;height:16px;accent-color:#2563eb}#detail{margin-top:10px;font-size:13px;color:#526078}</style><h3>Đang tải bản cập nhật…</h3><p>Vui lòng chờ, không cần mở lại ứng dụng.</p><progress id="progress" max="100" value="0"></progress><div id="detail">Đang kết nối…</div></html>`;
  updateProgressWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}

function updateProgress(percent, transferred, total) {
  if (!updateProgressWindow || updateProgressWindow.isDestroyed()) return;
  const safePercent = Math.max(0, Math.min(100, Number(percent) || 0));
  const detail = total > 0 ? `${safePercent.toFixed(0)}% · ${formatBytes(transferred)} / ${formatBytes(total)}` : `${safePercent.toFixed(0)}% · Đang tải…`;
  updateProgressWindow.webContents.executeJavaScript(`document.getElementById('progress').value=${safePercent};document.getElementById('detail').textContent=${JSON.stringify(detail)};`).catch(() => {});
}

function setupAutoUpdater() {
  if (!app.isPackaged || debug || process.env.ACRYLIC_DISABLE_AUTO_UPDATE === '1') return;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.on('error', (error) => { closeUpdateProgressWindow(); console.error('Không thể cập nhật:', error.message); });
  autoUpdater.on('update-available', async (info) => {
    const result = await dialog.showMessageBox({ type: 'info', buttons: ['Tải bản mới', 'Để sau'], defaultId: 0, cancelId: 1, title: 'Có bản cập nhật mới', message: `Acrylic Factory ${info.version} đã có sẵn.`, detail: 'Bản cập nhật sẽ được tải nền và chỉ cài khi bạn xác nhận.' });
    if (result.response !== 0) return;
    try { showUpdateProgressWindow(); await autoUpdater.downloadUpdate(); }
    catch (error) { closeUpdateProgressWindow(); await dialog.showMessageBox({ type: 'error', buttons: ['OK'], title: 'Tải cập nhật thất bại', message: 'Không thể tải bản cập nhật.', detail: error.message }); }
  });
  autoUpdater.on('download-progress', (progress) => updateProgress(progress.percent, progress.transferred, progress.total));
  autoUpdater.on('update-downloaded', async () => {
    closeUpdateProgressWindow();
    updateDownloaded = true;
    const result = await dialog.showMessageBox({ type: 'info', buttons: ['Khởi động lại và cập nhật', 'Để sau'], defaultId: 0, cancelId: 1, title: 'Đã tải xong bản cập nhật', message: 'Bản cập nhật đã sẵn sàng.', detail: 'Hãy dừng Tool/Export trước khi khởi động lại ứng dụng.' });
    if (result.response === 0) {
      if (await isToolBusy()) { await dialog.showMessageBox({ type: 'warning', buttons: ['OK'], title: 'Chưa thể cập nhật', message: 'Tool hoặc Export vẫn đang chạy.', detail: 'Vui lòng dừng tiến trình hiện tại rồi mở lại thông báo cập nhật.' }); return; }
      autoUpdater.quitAndInstall(false, true);
    }
  });
  void autoUpdater.checkForUpdates().catch(() => {});
  setInterval(() => { void autoUpdater.checkForUpdates().catch(() => {}); }, 6 * 60 * 60 * 1000);
}
function bundleRoot() {
  if (app.isPackaged) return path.join(process.resourcesPath, 'bundle');
  return path.resolve(__dirname, '../../..');
}

function startBundledWeb() {
  if (process.env.ACRYLIC_WEB_URL) return null;
  const root = bundleRoot();
  const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
  const webRoot = path.join(root, 'apps', 'web');
  if (!fs.existsSync(viteBin) || !fs.existsSync(webRoot)) throw new Error('Thiếu tài nguyên giao diện trong bộ cài.');
  const factoryRoot = process.env.ACRYLIC_FACTORY_ROOT || path.join(app.getPath('documents'), 'AcrylicFactory');
  webProcess = spawn(process.execPath, [viteBin, '--host', '127.0.0.1', '--port', '5173', '--strictPort'], {
    cwd: webRoot,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', ACRYLIC_APP_ROOT: root, ACRYLIC_FACTORY_ROOT: factoryRoot },
    windowsHide: true,
    stdio: debug ? 'inherit' : 'ignore',
  });
  webProcess.once('error', (error) => console.error('Không thể khởi động server giao diện:', error));
  return webProcess;
}

async function waitForWeb() {
  if (process.env.ACRYLIC_WEB_URL) return;
  const started = Date.now();
  while (Date.now() - started < 30_000) {
    try {
      const response = await fetch(webUrl, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Không thể khởi động giao diện Acrylic.');
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 900,
    minHeight: 600,
    autoHideMenuBar: true,
    backgroundColor: '#f8faff',
    webPreferences: { contextIsolation: true, nodeIntegration: false, preload: path.join(__dirname, 'preload.cjs') },
  });
  window.loadURL(webUrl);
  if (debug) window.webContents.openDevTools({ mode: 'detach' });
  window.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
}


ipcMain.handle('acrylic:select-folder', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
  if (result.canceled || !result.filePaths[0]) return null;
  return result.filePaths[0];
});

app.whenReady().then(async () => {
  startBundledWeb();
  await waitForWeb();
  createWindow();
  setupAutoUpdater();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
}).catch((error) => {
  console.error(error);
  app.quit();
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('will-quit', () => { if (webProcess?.pid) webProcess.kill(); });





