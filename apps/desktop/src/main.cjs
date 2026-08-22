const { app, BrowserWindow, shell, dialog, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const webUrl = process.env.ACRYLIC_WEB_URL || 'http://127.0.0.1:5173';
const debug = /^(1|true|yes)$/i.test(process.env.ACRYLIC_DEBUG || '');
let webProcess = null;
let updateDownloaded = false;

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

function setupAutoUpdater() {
  if (!app.isPackaged || debug || process.env.ACRYLIC_DISABLE_AUTO_UPDATE === '1') return;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.on('error', (error) => console.error('Kh?ng th? ki?m tra b?n c?p nh?t:', error.message));
  autoUpdater.on('update-available', async (info) => {
    const result = await dialog.showMessageBox({ type: 'info', buttons: ['T?i b?n m?i', '?? sau'], defaultId: 0, cancelId: 1, title: 'C? b?n c?p nh?t m?i', message: `Acrylic Factory ${info.version} ?? c? s?n.`, detail: 'B?n c?p nh?t s? ???c t?i n?n v? ch? c?i khi b?n x?c nh?n.' });
    if (result.response === 0) { try { await autoUpdater.downloadUpdate(); } catch (error) { console.error('Kh?ng th? t?i b?n c?p nh?t:', error); } }
  });
  autoUpdater.on('update-downloaded', async () => {
    updateDownloaded = true;
    const result = await dialog.showMessageBox({ type: 'info', buttons: ['Kh?i ??ng l?i v? c?p nh?t', '?? sau'], defaultId: 0, cancelId: 1, title: '?? t?i xong b?n c?p nh?t', message: 'B?n c?p nh?t ?? s?n s?ng.', detail: 'H?y d?ng Tool/Export tr??c khi kh?i ??ng l?i ?ng d?ng.' });
    if (result.response === 0) {
      if (await isToolBusy()) {
        await dialog.showMessageBox({ type: 'warning', buttons: ['OK'], title: 'Ch?a th? c?p nh?t', message: 'Tool ho?c Export v?n ?ang ch?y.', detail: 'Vui l?ng d?ng ti?n tr?nh hi?n t?i r?i m? l?i th?ng b?o c?p nh?t.' });
        return;
      }
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
