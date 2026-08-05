import type {
  DetailRow,
  FormatSchema,
  HeaderValues,
  RecordFieldDef,
} from "./schema";
import { emptyDetailRow, emptyHeader } from "./engine";
import { newRowId } from "./utils";

/** 匯入記憶體／表單上限（超過則僅預覽＋檢核摘要，不載入可編輯表單） */
export const IMPORT_LIMITS = {
  /** 可套用到表單的最大明細筆數 */
  maxFormDetailRows: 5_000,
  /** 預覽列（對話框明細表） */
  maxPreviewDetailRows: 50,
  /** 固定長度欄位預覽：明細樣本數 */
  maxDetailLineSamples: 2,
  /** 警告訊息筆數上限 */
  maxWarningSamples: 40,
  /** 進度回報最小間隔 ms */
  progressIntervalMs: 80,
} as const;

export type ParsedRecordField = {
  id: string;
  source: RecordFieldDef["source"];
  key?: string;
  length: number;
  raw: string;
  value: string;
};

export type ParsedLine = {
  index: number;
  kind: "header" | "detail" | "trailer" | "unknown";
  raw: string;
  length: number;
  lengthOk: boolean;
  fields: ParsedRecordField[];
};

export type ImportProgress = {
  bytesRead: number;
  totalBytes: number;
  linesRead: number;
  detailCount: number;
};

export type ImportResult = {
  detectedCode: string | null;
  schema: FormatSchema;
  filename: string;
  header: HeaderValues;
  /**
   * 可套用到表單的完整明細。檔案過大（tooLargeForForm）時為空陣列。
   */
  rows: DetailRow[];
  /** 預覽用明細（最多 maxPreviewDetailRows） */
  previewRows: DetailRow[];
  /** 固定長度預覽用列（首錄＋少量明細＋尾錄） */
  lines: ParsedLine[];
  trailer: Record<string, string>;
  warnings: string[];
  errors: string[];
  detailCount: number;
  lengthErrorCount: number;
  /** 超過可編輯上限，不可套用到表單 */
  tooLargeForForm: boolean;
  fileSize: number;
};

function splitLines(text: string): string[] {
  return text
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((l, i, arr) => !(l === "" && i === arr.length - 1));
}

/** 從首筆 BOF 列的 CDATA（第 4–9 碼）偵測檔案代號（僅掃前幾列） */
export function detectFormatCode(text: string): string | null {
  const lines = splitLines(text.slice(0, 2048));
  const header = lines.find((l) => l.startsWith("BOF"));
  if (!header || header.length < 9) return null;
  const code = header.slice(3, 9).trim();
  return code || null;
}

export async function detectFormatCodeFromFile(file: File): Promise<string | null> {
  const head = await file.slice(0, 2048).text();
  return detectFormatCode(head);
}

function unpadField(raw: string, def: RecordFieldDef): string {
  let s = raw ?? "";
  const pad = def.pad ?? { side: "right" as const, char: " " };

  if (def.transform === "firstChar") {
    return s.trim().charAt(0);
  }

  if (pad.side === "right" || (!def.pad && def.source !== "filler")) {
    s = s.replace(/[ \t]+$/g, "");
  }

  if (
    def.transform === "floorInt" ||
    (pad.side === "left" && (pad.char ?? "0") === "0")
  ) {
    const trimmed = s.replace(/^0+/, "");
    if (
      def.transform === "floorInt" ||
      def.fn === "totalCount" ||
      def.fn === "totalAmount" ||
      def.fn === "seq"
    ) {
      return trimmed === "" ? "0" : trimmed;
    }
  }

  if (def.charset === "digit" || def.charset === "alnum") {
    s = s.replace(/[ \t]+$/g, "");
  }

  return s;
}

export function parseRecordFields(
  line: string,
  fields: RecordFieldDef[],
): ParsedRecordField[] {
  const out: ParsedRecordField[] = [];
  let offset = 0;
  for (const def of fields) {
    const raw =
      offset >= line.length ? "" : line.slice(offset, offset + def.length);
    offset += def.length;
    out.push({
      id: def.id,
      source: def.source,
      key: def.key,
      length: def.length,
      raw,
      value: unpadField(raw, def),
    });
  }
  return out;
}

function collectKeyedValues(
  fields: ParsedRecordField[],
  source: "header" | "detail",
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields) {
    if (f.source === source && f.key) {
      out[f.key] = f.value;
    }
  }
  return out;
}

function detailRowFromFields(
  schema: FormatSchema,
  fields: ParsedRecordField[],
): DetailRow {
  const values = collectKeyedValues(fields, "detail");
  const row = emptyDetailRow(schema, newRowId());
  for (const f of schema.form.detail) {
    row[f.key] = values[f.key] ?? "";
  }
  return row;
}

function trailerFromFields(
  fields: ParsedRecordField[],
): Record<string, string> {
  const trailer: Record<string, string> = {};
  for (const f of fields) {
    if (f.source === "derived" && f.id) {
      trailer[f.id] = f.value;
    } else if (f.source === "header" && f.key) {
      trailer[f.key] = f.value;
    } else {
      trailer[f.id] = f.value;
    }
  }
  return trailer;
}

function pushWarning(warnings: string[], msg: string): void {
  if (warnings.length < IMPORT_LIMITS.maxWarningSamples) {
    warnings.push(msg);
  }
}

type ParseAcc = {
  schema: FormatSchema;
  warnings: string[];
  errors: string[];
  headerLine: ParsedLine | null;
  trailerLine: ParsedLine | null;
  detailSamples: ParsedLine[];
  previewRows: DetailRow[];
  rows: DetailRow[];
  detailCount: number;
  lengthErrorCount: number;
  tooLargeForForm: boolean;
  collectingRows: boolean;
  sawNonEmpty: boolean;
};

function createAcc(schema: FormatSchema): ParseAcc {
  return {
    schema,
    warnings: [],
    errors: [],
    headerLine: null,
    trailerLine: null,
    detailSamples: [],
    previewRows: [],
    rows: [],
    detailCount: 0,
    lengthErrorCount: 0,
    tooLargeForForm: false,
    collectingRows: true,
    sawNonEmpty: false,
  };
}

/**
 * 串流／逐行處理一列。pendingTrailer：可能是尾錄的「最後一筆非空列」暫存。
 */
function consumeLine(acc: ParseAcc, raw: string, index: number): void {
  if (!raw && !acc.sawNonEmpty) return;
  if (raw) acc.sawNonEmpty = true;

  const startsBof = raw.startsWith("BOF");
  const startsEof = raw.startsWith("EOF");

  // 若已有暫存的「疑似尾錄前一筆」，先以明細消化（真正尾錄會覆寫 trailerLine）
  // 此函式由驅動端以 peek 方式處理 EOF；此處依列首標記分類。

  let kind: ParsedLine["kind"];
  if (startsBof) kind = "header";
  else if (startsEof) kind = "trailer";
  else if (raw.trim()) kind = "detail";
  else kind = "unknown";

  if (kind === "unknown") return;

  const lengthOk = raw.length === acc.schema.recordLength;
  if (!lengthOk) {
    acc.lengthErrorCount += 1;
    pushWarning(
      acc.warnings,
      `第 ${index + 1} 列（${kind}）長度 ${raw.length} ≠ 定義 ${acc.schema.recordLength}`,
    );
  }

  const needFields =
    kind === "header" ||
    kind === "trailer" ||
    (kind === "detail" &&
      (acc.previewRows.length < IMPORT_LIMITS.maxPreviewDetailRows ||
        (acc.collectingRows &&
          acc.rows.length < IMPORT_LIMITS.maxFormDetailRows) ||
        acc.detailSamples.length < IMPORT_LIMITS.maxDetailLineSamples));

  const section =
    kind === "header" || kind === "detail" || kind === "trailer"
      ? acc.schema.records[kind].fields
      : null;
  const fields =
    needFields && section ? parseRecordFields(raw, section) : [];

  const sample: ParsedLine | null =
    kind === "header" ||
    kind === "trailer" ||
    (kind === "detail" &&
      acc.detailSamples.length < IMPORT_LIMITS.maxDetailLineSamples)
      ? {
          index,
          kind,
          raw,
          length: raw.length,
          lengthOk,
          fields:
            fields.length > 0
              ? fields
              : section
                ? parseRecordFields(raw, section)
                : [],
        }
      : null;

  if (kind === "header") {
    acc.headerLine = sample;
    return;
  }

  if (kind === "trailer") {
    acc.trailerLine = sample;
    return;
  }

  // detail
  acc.detailCount += 1;
  if (sample) acc.detailSamples.push(sample);

  if (acc.previewRows.length < IMPORT_LIMITS.maxPreviewDetailRows) {
    const f =
      fields.length > 0
        ? fields
        : parseRecordFields(raw, acc.schema.records.detail.fields);
    acc.previewRows.push(detailRowFromFields(acc.schema, f));
  }

  if (acc.collectingRows) {
    if (acc.detailCount <= IMPORT_LIMITS.maxFormDetailRows) {
      const f =
        fields.length > 0
          ? fields
          : parseRecordFields(raw, acc.schema.records.detail.fields);
      acc.rows.push(detailRowFromFields(acc.schema, f));
    } else {
      // 超過可編輯上限：丟棄已收集列以釋放記憶體，僅保留預覽
      acc.tooLargeForForm = true;
      acc.collectingRows = false;
      acc.rows = [];
    }
  }
}

function finalizeHeader(acc: ParseAcc): HeaderValues {
  const header: HeaderValues = emptyHeader(acc.schema);
  if (acc.headerLine) {
    Object.assign(header, collectKeyedValues(acc.headerLine.fields, "header"));
  }
  if (acc.detailSamples[0]) {
    const fromDetail = collectKeyedValues(
      acc.detailSamples[0].fields,
      "header",
    );
    for (const [k, v] of Object.entries(fromDetail)) {
      if (!header[k]) header[k] = v;
    }
  }

  const headerKeys = new Set(acc.schema.form.header.map((f) => f.key));
  for (const k of Object.keys(header)) {
    if (!headerKeys.has(k)) delete header[k];
  }
  for (const f of acc.schema.form.header) {
    if (header[f.key] === undefined) header[f.key] = "";
  }
  return header;
}

function buildResult(
  acc: ParseAcc,
  opts: { filename: string; detectedCode: string | null; fileSize: number },
): ImportResult {
  if (!acc.headerLine) {
    acc.errors.push("找不到表頭列（BOF）");
  }
  if (!acc.trailerLine) {
    pushWarning(acc.warnings, "找不到尾筆列（EOF）");
  }
  if (!acc.detailCount) {
    pushWarning(acc.warnings, "沒有明細列");
  }
  if (acc.tooLargeForForm) {
    pushWarning(
      acc.warnings,
      `明細共 ${acc.detailCount.toLocaleString("zh-TW")} 筆，超過可載入表單上限 ${IMPORT_LIMITS.maxFormDetailRows.toLocaleString("zh-TW")} 筆；僅提供預覽與檢核摘要，請分割檔案後再套用編輯`,
    );
  }
  if (acc.lengthErrorCount > IMPORT_LIMITS.maxWarningSamples) {
    pushWarning(
      acc.warnings,
      `另有列長不符共 ${acc.lengthErrorCount.toLocaleString("zh-TW")} 筆（僅顯示前 ${IMPORT_LIMITS.maxWarningSamples} 則）`,
    );
  }

  const lines: ParsedLine[] = [];
  if (acc.headerLine) lines.push(acc.headerLine);
  lines.push(...acc.detailSamples);
  if (acc.trailerLine) lines.push(acc.trailerLine);

  const trailer = acc.trailerLine
    ? trailerFromFields(acc.trailerLine.fields)
    : {};

  return {
    detectedCode: opts.detectedCode,
    schema: acc.schema,
    filename: opts.filename,
    header: finalizeHeader(acc),
    rows: acc.tooLargeForForm ? [] : acc.rows,
    previewRows: acc.previewRows,
    lines,
    trailer,
    warnings: acc.warnings,
    errors: acc.errors,
    detailCount: acc.detailCount,
    lengthErrorCount: acc.lengthErrorCount,
    tooLargeForForm: acc.tooLargeForForm,
    fileSize: opts.fileSize,
  };
}

/**
 * 小字串同步解析（測試／貼上）。大檔請用 parseAchFile 串流，避免 OOM。
 */
export function parseAchText(
  text: string,
  schema: FormatSchema,
  opts?: { filename?: string; fileSize?: number },
): ImportResult {
  const filename = opts?.filename ?? "";
  const fileSize = opts?.fileSize ?? text.length;
  const detectedCode = detectFormatCode(text);
  const acc = createAcc(schema);

  if (detectedCode && detectedCode !== schema.code) {
    pushWarning(
      acc.warnings,
      `檔案代號為 ${detectedCode}，目前以 ${schema.code} 格式解析`,
    );
  } else if (!detectedCode) {
    pushWarning(acc.warnings, "無法從 BOF 列辨識檔案代號（CDATA）");
  }

  const rawLines = splitLines(text);
  if (!rawLines.length) {
    acc.errors.push("檔案沒有內容");
    return buildResult(acc, { filename, detectedCode, fileSize });
  }

  for (let i = 0; i < rawLines.length; i++) {
    consumeLine(acc, rawLines[i] ?? "", i);
  }

  return buildResult(acc, { filename, detectedCode, fileSize });
}

/**
 * 串流解析 File，避免 file.text() 將整檔載入記憶體造成 OOM。
 */
export async function parseAchFile(
  file: File,
  schema: FormatSchema,
  opts?: {
    filename?: string;
    onProgress?: (p: ImportProgress) => void;
    signal?: AbortSignal;
  },
): Promise<ImportResult> {
  const filename = opts?.filename ?? file.name;
  const detectedCode = await detectFormatCodeFromFile(file);
  const acc = createAcc(schema);

  if (detectedCode && detectedCode !== schema.code) {
    pushWarning(
      acc.warnings,
      `檔案代號為 ${detectedCode}，目前以 ${schema.code} 格式解析`,
    );
  } else if (!detectedCode) {
    pushWarning(acc.warnings, "無法從 BOF 列辨識檔案代號（CDATA）");
  }

  const reader = file.stream().getReader();
  const decoder = new TextDecoder("utf-8");
  let buf = "";
  let bytesRead = 0;
  let lineIndex = 0;
  let lastProgressAt = 0;

  const report = (force = false) => {
    const now = Date.now();
    if (
      !force &&
      now - lastProgressAt < IMPORT_LIMITS.progressIntervalMs
    ) {
      return;
    }
    lastProgressAt = now;
    opts?.onProgress?.({
      bytesRead,
      totalBytes: file.size,
      linesRead: lineIndex,
      detailCount: acc.detailCount,
    });
  };

  try {
    while (true) {
      if (opts?.signal?.aborted) {
        acc.errors.push("匯入已取消");
        break;
      }
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      buf += decoder.decode(value, { stream: true });

      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        let line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (lineIndex === 0 && line.charCodeAt(0) === 0xfeff) {
          line = line.slice(1);
        }
        consumeLine(acc, line, lineIndex);
        lineIndex += 1;
        if (lineIndex % 2000 === 0) {
          report();
          // 讓出主執行緒，避免長檔解析時頁面完全卡死
          await new Promise<void>((r) => setTimeout(r, 0));
        }
      }
      report();
    }

    buf += decoder.decode();
    if (buf.length) {
      let line = buf;
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (lineIndex === 0 && line.charCodeAt(0) === 0xfeff) {
        line = line.slice(1);
      }
      consumeLine(acc, line, lineIndex);
      lineIndex += 1;
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* ignore */
    }
  }

  if (!lineIndex) {
    acc.errors.push("檔案沒有內容");
  }

  report(true);
  return buildResult(acc, {
    filename,
    detectedCode,
    fileSize: file.size,
  });
}

/** 在多個格式中選出最適合解析的 schema（優先 CDATA 代號，其次列長） */
export function resolveImportSchema(
  text: string,
  formats: Record<string, FormatSchema>,
  preferred?: FormatSchema,
): FormatSchema | null {
  const code = detectFormatCode(text);
  if (code && formats[code]) return formats[code];

  const lines = splitLines(text.slice(0, 4096));
  const sample = lines.find((l) => l.startsWith("BOF")) ?? lines[0] ?? "";
  const byLength = Object.values(formats).find(
    (s) => s.recordLength === sample.length,
  );
  if (byLength) return byLength;

  return preferred ?? Object.values(formats)[0] ?? null;
}

export async function resolveImportSchemaFromFile(
  file: File,
  formats: Record<string, FormatSchema>,
  preferred?: FormatSchema,
): Promise<FormatSchema | null> {
  const head = await file.slice(0, 4096).text();
  return resolveImportSchema(head, formats, preferred);
}
