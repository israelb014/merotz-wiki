// Electron shell for מרוץ ויקי – loads the live site so game updates arrive instantly.
const { app, BrowserWindow, shell, ipcMain, nativeTheme, Menu } = require('electron');
const path = require('node:path');

const { SITE, isSiteUrl, isExternalHttp, updateMode } = require('./lib.cjs');
const crash = require('./crash-reporter.cjs');

// crash reports: only in packaged builds, never in automated smoke tests
crash.install(app, { version: app.getVersion(), enabled: app.isPackaged && !process.env.MW_HIDDEN && !process.env.MW_NO_CRASH_REPORT });

const isDeb = updateMode({ isPackaged: true, platform: process.platform, appImage: process.env.APPIMAGE }) === 'deb-banner';
let win = null;
let updateInfo = null;

if (!app.requestSingleInstanceLock()) { app.quit(); }
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

function createWindow() {
  win = new BrowserWindow({
    width: 1200, height: 860, minWidth: 380, minHeight: 600,
    title: 'מרוץ ויקי',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0E1424' : '#F6F3EC',
    icon: path.join(__dirname, 'build', 'icon.png'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      additionalArguments: [`--mw-version=${app.getVersion()}`, `--mw-deb=${isDeb ? 1 : 0}`],
    },
  });
  Menu.setApplicationMenu(null);
  if (!process.env.MW_HIDDEN) win.once('ready-to-show', () => win.show()); // MW_HIDDEN: automated smoke tests

  win.webContents.on('did-fail-load', (_e, code, _desc, url, isMainFrame) => {
    if (isMainFrame && code !== -3 /* aborted */ && !url.startsWith('file:')) win.loadFile(path.join(__dirname, 'offline.html'));
  });
  // external links → system browser
  win.webContents.setWindowOpenHandler(({ url }) => { if (isExternalHttp(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => {
    if (url.startsWith('file:') || isSiteUrl(url)) return;
    e.preventDefault();
    if (isExternalHttp(url)) shell.openExternal(url);
  });
  // mouse back button / Alt+Left handled by the web app (with the click rule)
  win.on('app-command', (_e, cmd) => { if (cmd === 'browser-backward') win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'BrowserBack' }); });
  win.loadURL(SITE);
}

ipcMain.on('mw:open-external', (_e, url) => { if (isExternalHttp(url)) shell.openExternal(url); });
ipcMain.on('mw:set-theme', (_e, t) => { if (win) win.setBackgroundColor(t === 'dark' ? '#0E1424' : '#F6F3EC'); });
ipcMain.on('mw:quit-and-install', () => { try { require('electron-updater').autoUpdater.quitAndInstall(true, true); } catch {} });
ipcMain.handle('mw:update-status', () => updateInfo);

function initAutoUpdate() {
  if (updateMode({ isPackaged: app.isPackaged, platform: process.platform, appImage: process.env.APPIMAGE }) !== 'auto') return; // .deb: in-app banner with download link instead
  let autoUpdater;
  try { ({ autoUpdater } = require('electron-updater')); } catch { return; }
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true; // silent, applied on restart
  autoUpdater.on('update-downloaded', (info) => {
    updateInfo = { type: 'downloaded', version: info.version };
    win?.webContents.send('mw:update-status', updateInfo);
  });
  autoUpdater.on('error', (e) => console.warn('updater:', e?.message));
  autoUpdater.checkForUpdates().catch(() => {});
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 6 * 3600 * 1000);
}

app.whenReady().then(() => {
  createWindow();
  initAutoUpdate();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
