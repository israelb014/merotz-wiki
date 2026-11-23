// Minimal, safe bridge (contextIsolation on, nodeIntegration off).
const { contextBridge, ipcRenderer } = require('electron');
const arg = (k) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=')[1];

contextBridge.exposeInMainWorld('merotzDesktop', {
  platform: process.platform,
  version: arg('mw-version'),
  isDeb: arg('mw-deb') === '1',
  openExternal: (url) => ipcRenderer.send('mw:open-external', String(url)),
  setTheme: (t) => ipcRenderer.send('mw:set-theme', t === 'dark' ? 'dark' : 'light'),
  quitAndInstall: () => ipcRenderer.send('mw:quit-and-install'),
  onUpdateStatus: (cb) => {
    ipcRenderer.invoke('mw:update-status').then((s) => s && cb(s));
    ipcRenderer.on('mw:update-status', (_e, s) => cb(s));
  },
});
