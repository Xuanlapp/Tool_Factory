const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('acrylicDesktop', {
  selectFolder: () => ipcRenderer.invoke('acrylic:select-folder'),
  selectFile: () => ipcRenderer.invoke('acrylic:select-file'),
});
