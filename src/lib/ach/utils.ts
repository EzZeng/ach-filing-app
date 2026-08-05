/** 只保留數字 (SafeCHR mode 1) */
export function safeDigits(text: string): string {
  return String(text ?? "").replace(/[^0-9]/g, "");
}

/** 只保留英數字 (SafeCHR mode 2) */
export function safeAlnum(text: string): string {
  return String(text ?? "").replace(/[^0-9a-zA-Z]/g, "");
}

export function padLeft(value: string | number, len: number, ch = "0"): string {
  const s = String(value ?? "");
  if (s.length >= len) return s.slice(-len);
  return ch.repeat(len - s.length) + s;
}

export function padRight(value: string, len: number, ch = " "): string {
  const s = String(value ?? "");
  if (s.length >= len) return s.slice(0, len);
  return s + ch.repeat(len - s.length);
}

export function spaces(n: number): string {
  return " ".repeat(n);
}

/**
 * 正規化提出日期：
 * - 西元 8 碼 YYYYMMDD（年>2000）→ 民國 8 碼
 * - 民國 7 碼 YYYMMDD → 左補 0 成 8 碼
 */
export function normalizeSubmitDate(raw: string): {
  value: string;
  convertedFromAd?: boolean;
} {
  const digits = safeDigits(raw).slice(0, 8);
  if (digits.length === 8 && Number(digits.slice(0, 4)) > 2000) {
    const roc = adToRoc(digits);
    if (roc) return { value: roc, convertedFromAd: true };
  }
  if (digits.length === 7) {
    return { value: "0" + digits };
  }
  return { value: digits };
}

/** 西元 8 碼 YYYYMMDD → 民國 8 碼 (年-1911) */
export function adToRoc(yyyymmdd: string): string | null {
  if (!/^\d{8}$/.test(yyyymmdd)) return null;
  const y = Number(yyyymmdd.slice(0, 4));
  if (y <= 2000) return null;
  const m = yyyymmdd.slice(4, 6);
  const d = yyyymmdd.slice(6, 8);
  const dt = new Date(`${y}-${m}-${d}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return null;
  if (
    dt.getFullYear() !== y ||
    dt.getMonth() + 1 !== Number(m) ||
    dt.getDate() !== Number(d)
  ) {
    return null;
  }
  return padLeft(y - 1911, 4) + m + d;
}

/** 民國 8 碼 → Date (local) */
export function rocToDate(roc: string): Date | null {
  if (!/^\d{8}$/.test(roc)) return null;
  const y = Number(roc.slice(0, 4)) + 1911;
  const m = Number(roc.slice(4, 6));
  const d = Number(roc.slice(6, 8));
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() + 1 !== m || dt.getDate() !== d)
    return null;
  return dt;
}

/** 今天民國日期 YYYYMMDD（年 4 碼，左補 0） */
export function todayRoc(): string {
  const now = new Date();
  const y = now.getFullYear() - 1911;
  return (
    padLeft(y, 4) +
    padLeft(now.getMonth() + 1, 2) +
    padLeft(now.getDate(), 2)
  );
}

/** 民國日期的前一日（簡易日曆日，非營業日曆） */
export function prevRocDate(roc: string): string | null {
  const dt = rocToDate(roc);
  if (!dt) return null;
  dt.setDate(dt.getDate() - 1);
  const y = dt.getFullYear() - 1911;
  return (
    padLeft(y, 4) +
    padLeft(dt.getMonth() + 1, 2) +
    padLeft(dt.getDate(), 2)
  );
}

/** HHMMSS */
export function nowHms(): string {
  const now = new Date();
  return (
    padLeft(now.getHours(), 2) +
    padLeft(now.getMinutes(), 2) +
    padLeft(now.getSeconds(), 2)
  );
}

/** 帳號左側補 0 至 16 碼 */
export function padAccount16(value: string): string {
  const digits = safeDigits(value);
  if (!digits) return "";
  if (digits.length > 16) return digits;
  return padLeft(digits, 16);
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadTextFile(
  filename: string,
  content: string,
  mime = "text/plain;charset=utf-8",
) {
  downloadBlob(filename, new Blob([content], { type: mime }));
}

export function newRowId(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}
