import { downloadTextFile } from "./utils";

type DesktopApi = {
  isElectron: boolean;
  saveTextFile: (
    filename: string,
    content: string,
  ) => Promise<{ ok: boolean; canceled?: boolean; filePath?: string }>;
};

declare global {
  interface Window {
    achDesktop?: DesktopApi;
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
  return "text/plain;charset=utf-8";
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

/** 連續下載多個成品（瀏覽器會連續觸發下載） */
export async function saveAchFiles(
  files: { filename: string; content: string; mime?: string }[],
): Promise<void> {
  for (let i = 0; i < files.length; i++) {
    const f = files[i]!;
    await saveAchFile(f.filename, f.content, f.mime);
    // 避免瀏覽器擋多檔下載
    if (i < files.length - 1) {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
}
