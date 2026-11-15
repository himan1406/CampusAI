const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that renderer can use
contextBridge.exposeInMainWorld('electron', {
  store: {
    get: (key) => ipcRenderer.invoke('store:get', key),
    set: (key, value) => ipcRenderer.invoke('store:set', key, value)
  },
  auth: {
    login: (credentials) => ipcRenderer.invoke('auth:login', credentials),
    signup: (account) => ipcRenderer.invoke('auth:signup', account),
    refresh: () => ipcRenderer.invoke('auth:refresh'),
    me: () => ipcRenderer.invoke('auth:me')
  },
  chat: {
    createSession: () => ipcRenderer.invoke('chat:create-session'),
    answer: (sessionId, message) => ipcRenderer.invoke('chat:answer', sessionId, message)
  }
});
