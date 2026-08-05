const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("achDesktop", {
  isElectron: true,
  saveTextFile: (filename, content) =>
    ipcRenderer.invoke("save-text-file", { filename, content }),
  saveTextFilesToDir: (files) =>
    ipcRenderer.invoke("save-text-files-to-dir", { files }),
  saveBinaryFile: (filename, base64) =>
    ipcRenderer.invoke("save-binary-file", { filename, base64 }),
});
