const { contextBridge, ipcRenderer } = require('electron');
const RecordRTC = require('recordrtc');

// Expose a controlled API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // The function we'll call from renderer.js
  getSources: () => ipcRenderer.invoke('get-sources'),
  // Expose the RecordRTC module
  RecordRTC: RecordRTC,
  // Expose the function to set stealth mode
  setStealthMode: (enable) => ipcRenderer.send('set-stealth-mode', enable)
});
