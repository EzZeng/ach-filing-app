import { downloadBlob, downloadTextFile } from "./utils";
import { createZipBlob, suggestBundleZipName } from "./zip";

export type AchSaveFile = {
  filename: string;
  content: string;
  mime?: string;
};

export type SaveAchFilesResult = {
  method: "single" | "directory" | "zip" | "canceled";
  /** ZIP 或單檔檔名；目錄模式為資料夾路徑（Electron） */
  target?: string;
  fileCount: number;
};

type DesktopApi = {
  isElectron: boolean;
  saveTextFile: (
    filename: string,
    content: string,
  ) => Promise<{ ok: boolean; canceled?: boolean; filePath?: string }>;
  /** 選一次資料夾，寫入多檔（免逐檔存檔對話框） */
  saveTextFilesToDir?: (
    files: { filename: string; content: string }[],
  ) => Promise<{
    ok: boolean;
    canceled?: boolean;
    dirPath?: string;
    count?: number;
  }>;
  /** 存二進位（ZIP）一次對話框 */
  saveBinaryFile?: (
    filename: string,
    base64: string,
  ) => Promise<{ ok: boolean; canceled?: boolean; filePath?: string }>;
};

declare global {
  interface Window {
    achDesktop?: DesktopApi;
    showDirectoryPicker?: (options?: {
      mode?: "read" | "readwrite";
    }) => Promise<FileSystemDirectoryHandle>;
  }
}

function mimeForFilename(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".html") || lower.endsWith(".htm")) {
    return "text/html;charset=utf-8";
  }
  if (lower.endsWith(".js") || lower.endsWith(".mjs")) {
    return "text/javascript;charset=utf-8";
  }
  if (lower.endsWith(".json")) {
    return "application/json;charset=utf-8";
  }
  if (lower.endsWith(".zip")) {
    return "application/zip";
  }
  return "text/plain;charset=utf-8";
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** Electron 優先用系統存檔對話框；瀏覽器則下載 */
export async function saveAchFile(
  filename: string,
  content: string,
  mime?: string,
): Promise<void> {
  if (typeof window !== "undefined" && window.achDesktop?.isElectron) {
    await window.achDesktop.saveTextFile(filename, content);
    return;
  }
  downloadTextFile(filename, content, mime ?? mimeForFilename(filename));
}

async function saveZipBundle(
  files: AchSaveFile[],
  zipName: string,
): Promise<SaveAchFilesResult> {
  const blob = createZipBlob(
    files.map((f) => ({ filename: f.filename, content: f.content })),
  );

  if (typeof window !== "undefined" && window.achDesktop?.saveBinaryFile) {
    const base64 = await blobToBase64(blob);
    const r = await window.achDesktop.saveBinaryFile(zipName, base64);
    if (r.canceled) return { method: "canceled", fileCount: files.length };
    return {
      method: "zip",
      target: r.filePath ?? zipName,
      fileCount: files.length,
    };
  }

  if (typeof window !== "undefined" && window.achDesktop?.isElectron) {
    // 舊 preload：退回 base64 data URL 不可行；改以文字 API 無法存 zip
    // 仍走瀏覽器式下載（Electron 內也可觸發）
  }

  downloadBlob(zipName, blob);
  return { method: "zip", target: zipName, fileCount: files.length };
}

async function saveToDirectoryPicker(
  files: AchSaveFile[],
): Promise<SaveAchFilesResult | null> {
  if (typeof window === "undefined" || !window.showDirectoryPicker) {
    return null;
  }
  try {
    const dir = await window.showDirectoryPicker({ mode: "readwrite" });
    for (const f of files) {
      const handle = await dir.getFileHandle(f.filename, { create: true });
      const writable = await handle.createWritable();
      const mime = f.mime ?? mimeForFilename(f.filename);
      await writable.write(new Blob([f.content], { type: mime }));
      await writable.close();
    }
    return {
      method: "directory",
      target: dir.name,
      fileCount: files.length,
    };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      return { method: "canceled", fileCount: files.length };
    }
    // 權限／不支援 → 交給 ZIP
    return null;
  }
}

export type SaveAchFilesOptions = {
  /**
   * auto（預設）：多檔一次選資料夾，否則打成 ZIP（只選／下載一次）
   * zip：強制單一 ZIP
   * each：舊行為，逐檔下載（可能多次選儲存）
   * directory：僅嘗試資料夾（失敗則 zip）
   */
  mode?: "auto" | "zip" | "each" | "directory";
  /** ZIP 檔名（mode=zip／auto 後備時） */
  zipName?: string;
};

/**
 * 儲存多個成品。
 * 預設避免「每檔都要選儲存位置」：Electron／Chromium 選一次資料夾，否則打包 ZIP。
 */
export async function saveAchFiles(
  files: AchSaveFile[],
  opts?: SaveAchFilesOptions,
): Promise<SaveAchFilesResult> {
  if (files.length === 0) {
    return { method: "canceled", fileCount: 0 };
  }

  const mode = opts?.mode ?? "auto";

  if (files.length === 1 || mode === "each") {
    for (let i = 0; i < files.length; i++) {
      const f = files[i]!;
      await saveAchFile(f.filename, f.content, f.mime);
      if (mode === "each" && i < files.length - 1) {
        await new Promise((r) => setTimeout(r, 250));
      }
    }
    return {
      method: "single",
      target: files[0]?.filename,
      fileCount: files.length,
    };
  }

  const zipName = opts?.zipName ?? suggestBundleZipName(files);

  if (mode === "zip") {
    return saveZipBundle(files, zipName);
  }

  // Electron：選一次資料夾
  if (
    typeof window !== "undefined" &&
    window.achDesktop?.saveTextFilesToDir &&
    (mode === "auto" || mode === "directory")
  ) {
    const r = await window.achDesktop.saveTextFilesToDir(
      files.map((f) => ({ filename: f.filename, content: f.content })),
    );
    if (r.canceled) return { method: "canceled", fileCount: files.length };
    if (r.ok) {
      return {
        method: "directory",
        target: r.dirPath,
        fileCount: r.count ?? files.length,
      };
    }
  }

  // Chromium File System Access：選一次資料夾
  if (mode === "auto" || mode === "directory") {
    const dirResult = await saveToDirectoryPicker(files);
    if (dirResult) return dirResult;
  }

  // 後備：單一 ZIP（瀏覽器預設下載資料夾／一次另存）
  return saveZipBundle(files, zipName);
}

/** 給 UI 顯示的簡短說明 */
export function describeSaveResult(r: SaveAchFilesResult): string {
  if (r.method === "canceled") return "已取消儲存";
  if (r.method === "directory") {
    return r.target
      ? `已寫入資料夾「${r.target}」（${r.fileCount} 檔）`
      : `已寫入資料夾（${r.fileCount} 檔）`;
  }
  if (r.method === "zip") {
    return `已打包 ${r.fileCount} 檔為 ${r.target ?? "ZIP"}（一次下載）`;
  }
  return `已儲存 ${r.target ?? "檔案"}`;
}
