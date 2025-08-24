const { contextBridge, ipcRenderer } = require('electron');

// Expose a controlled API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // The function we'll call from renderer.js
  getSources: () => ipcRenderer.invoke('get-sources')
});
