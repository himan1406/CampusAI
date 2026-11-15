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
    resizable: true,
    minWidth: 360,
    minHeight: 520,
    backgroundColor: '#0d0f13',
    movable: true,
    alwaysOnTop: true,
    frame: false,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
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

// Parse a JSON body defensively so a non-JSON error page doesn't throw.
async function readJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

// Desktop uses the token transport endpoints: the refresh token is returned in
// the body and kept in electron-store instead of an HTTP-only cookie.
async function authenticate(path, payload) {
  const res = await fetch(`${store.get('serverUrl')}/api/v1/auth/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await readJson(res);
  if (res.ok && data) {
    store.set('accessToken', data.access_token);
    store.set('refreshToken', data.refresh_token);
  }
  return { ok: res.ok, status: res.status, data };
}

ipcMain.handle('auth:login', (e, credentials) => authenticate('mobile/login', credentials));

ipcMain.handle('auth:signup', (e, account) => authenticate('mobile/signup', account));

ipcMain.handle('auth:me', async () => {
  const res = await fetch(`${store.get('serverUrl')}/api/v1/auth/me`, {
    headers: { Authorization: `Bearer ${store.get('accessToken')}` }
  });
  return { ok: res.ok, status: res.status, data: await readJson(res) };
});

ipcMain.handle('auth:refresh', async () => {
  const refreshToken = store.get('refreshToken');
  if (!refreshToken) return { ok: false, status: 401, data: null };
  const res = await fetch(`${store.get('serverUrl')}/api/v1/auth/mobile/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken })
  });
  const data = await readJson(res);
  if (res.ok && data) {
    store.set('accessToken', data.access_token);
    store.set('refreshToken', data.refresh_token);
  }
  return { ok: res.ok, status: res.status, data };
});

ipcMain.handle('chat:create-session', async () => {
  const token = store.get('accessToken');
  const res = await fetch(`${store.get('serverUrl')}/api/v1/chat/sessions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` }
  });
  return { ok: res.ok, status: res.status, data: await readJson(res) };
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
  return { ok: res.ok, status: res.status, data: await readJson(res) };
});

console.log('Electron main process ready');