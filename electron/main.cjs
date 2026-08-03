const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const http = require("http");
const { pathToFileURL } = require("url");

const isDev = !app.isPackaged;
let mainWindow = null;
let localServer = null;
let localPort = 0;

function getRendererDir() {
  if (isDev) {
    // 開發時可用 ELECTRON_START_URL 指向 vite；否則用 build 產物
    return path.join(__dirname, "..", "dist-electron", "renderer");
  }
  return path.join(process.resourcesPath, "renderer");
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".map": "application/json",
  };
  return map[ext] || "application/octet-stream";
}

function startStaticServer(rootDir) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
        let rel = urlPath === "/" ? "/index.html" : urlPath;
        // prevent path traversal
        rel = path.normalize(rel).replace(/^(\.\.[/\\])+/, "");
        let filePath = path.join(rootDir, rel);
        if (!filePath.startsWith(rootDir)) {
          res.writeHead(403);
          res.end("Forbidden");
          return;
        }
        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
          // SPA fallback
          filePath = path.join(rootDir, "index.html");
        }
        const data = fs.readFileSync(filePath);
        res.writeHead(200, { "Content-Type": contentType(filePath) });
        res.end(data);
      } catch (err) {
        res.writeHead(500);
        res.end(String(err));
      }
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      localPort = addr.port;
      localServer = server;
      resolve(localPort);
    });
    server.on("error", reject);
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: "代收建檔小程式",
    backgroundColor: "#f4f1ea",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (isDev && process.env.ELECTRON_START_URL) {
    await mainWindow.loadURL(process.env.ELECTRON_START_URL);
  } else {
    const rendererDir = getRendererDir();
    if (!fs.existsSync(path.join(rendererDir, "index.html"))) {
      const msg = `找不到介面檔案：${rendererDir}\\index.html\n請先執行 npm run electron:pack`;
      dialog.showErrorBox("啟動失敗", msg);
      app.quit();
      return;
    }
    const port = await startStaticServer(rendererDir);
    await mainWindow.loadURL(`http://127.0.0.1:${port}/`);
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  await createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on("window-all-closed", () => {
  if (localServer) {
    localServer.close();
    localServer = null;
  }
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("save-text-file", async (_event, { filename, content }) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: "儲存 ACH 檔案",
    defaultPath: filename || "ACH.txt",
    filters: [{ name: "文字檔", extensions: ["txt"] }],
  });
  if (canceled || !filePath) return { ok: false, canceled: true };
  fs.writeFileSync(filePath, content, "utf8");
  return { ok: true, filePath };
});
