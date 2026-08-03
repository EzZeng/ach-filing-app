const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("achDesktop", {
  isElectron: true,
  saveTextFile: (filename, content) =>
    ipcRenderer.invoke("save-text-file", { filename, content }),
});
