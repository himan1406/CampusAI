import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that renderer can use
contextBridge.exposeInMainWorld('electron, {
  store: {
    get: (key) => ipcRenderer.invoke('store:get', key).then(r => r.data),
    set: (key, value) => ipcRenderer.invoke('store:set', key, value).then(r => r.data)
  },
  auth: {
    login: (email, password) => ipcRenderer.invoke('auth:login', email, password),
    refresh: () => ipcRenderer.invoke('auth:refresh')
  },
  chat: {
    createSession: () => ipcRenderer.invoke('chat:create-session'),
    answer: (sessionId, message) => ipcRenderer.invoke('chat:answer', sessionId, message)
  },
  // Hotkey system
  hotkey: {
    on: (callback) => {
      const handleKeyDown = (e) => {
        const combo = buildHotkeyCombo(e);
        callback(combo);
        // Unregister after first press for toggle use
        ipcRenderer.removeListener('keydown', handleKeyDown);
      };
      ipcRenderer.on('keydown', handleKeyDown);
    },
    getCurrent: () => ipcRenderer.invoke('store:get', 'hotkey').then(r => r.combo)
  }
});

// Helper to build hotkey string from keydown event
function buildHotkeyCombo(e) {
  const parts = [];
  if (e.ctrlKey) parts.push('ctrl');
  if (e.shiftKey) parts.push('shift');
  if (e.altKey) parts.push('alt');
  parts.push(e.key.toLowerCase());
  return parts.join('+');
}

// Forward keydown events from renderer for hotkey handling
window.addEventListener('keydown', (e) => {
  ipcRenderer.send('keydown', e);
});