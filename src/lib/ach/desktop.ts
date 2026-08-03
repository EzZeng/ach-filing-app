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

/** Electron 優先用系統存檔對話框；瀏覽器則下載 */
export async function saveAchFile(filename: string, content: string): Promise<void> {
  if (typeof window !== "undefined" && window.achDesktop?.isElectron) {
    await window.achDesktop.saveTextFile(filename, content);
    return;
  }
  downloadTextFile(filename, content);
}
