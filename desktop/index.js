const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const Store = require('electron-store');

const defaultStore = {
  serverUrl: 'http://localhost:5000',
  accessToken: null,
  refreshToken: null,
  hotkey: 'F12'
};

const store = new Store(defaultStore);

// Check for --debug flag
const debug = process.argv.includes('--debug');

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 400,
    height: 600,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    frame: false,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      nodeIntegration: false,
      contextBridge: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC handlers
ipcMain.handle('store:get', (key) => store.get(key));
ipcMain.handle('store:set', async (key, value) => store.set(key, value));

ipcMain.handle('auth:login', async (e, email, password) => {
  const res = await fetch(`${store.get('serverUrl')}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json();
  if (res.ok) {
    store.set('accessToken', data.access_token);
    store.set('refreshToken', data.refresh_token);
  }
  return { res, data };
});

ipcMain.handle('auth:refresh', async () => {
  const token = store.get('accessToken');
  if (!token) return { ok: false, error: 'no token' };
  const res = await fetch(`${store.get('serverUrl')}/api/v1/auth/refresh`, {
    method: 'POST',
    credentials: 'include'
  });
  const data = await res.json();
  if (res.ok) {
    store.set('accessToken', data.access_token);
    store.set('refreshToken', data.refresh_token);
  }
  return { res, data };
});

ipcMain.handle('chat:create-session', async () => {
  const token = store.get('accessToken');
  const res = await fetch(`${store.get('serverUrl')}/api/v1/chat/sessions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  return { res, data };
});

ipcMain.handle('chat:answer', async (e, sessionId, message) => {
  const token = store.get('accessToken');
  const res = await fetch(`${store.get('serverUrl')}/api/v1/chat/sessions/${sessionId}/answer`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ message })
  });
  return { res, data: null };
});

console.log('Electron main process ready');