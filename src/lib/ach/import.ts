import type {
  DetailRow,
  FormatSchema,
  HeaderValues,
  RecordFieldDef,
} from "./schema";
import { emptyDetailRow, emptyHeader } from "./engine";
import { newRowId } from "./utils";

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

export type ImportResult = {
  detectedCode: string | null;
  schema: FormatSchema;
  filename: string;
  header: HeaderValues;
  rows: DetailRow[];
  lines: ParsedLine[];
  trailer: Record<string, string>;
  warnings: string[];
  errors: string[];
  detailCount: number;
};

function splitLines(text: string): string[] {
  return text
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((l, i, arr) => !(l === "" && i === arr.length - 1));
}

/** 從首筆 BOF 列的 CDATA（第 4–9 碼）偵測檔案代號 */
export function detectFormatCode(text: string): string | null {
  const lines = splitLines(text);
  const header = lines.find((l) => l.startsWith("BOF"));
  if (!header || header.length < 9) return null;
  const code = header.slice(3, 9).trim();
  return code || null;
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

  if (def.transform === "floorInt" || (pad.side === "left" && (pad.char ?? "0") === "0")) {
    const trimmed = s.replace(/^0+/, "");
    // 金額／計數：前導零去掉；全零保留 "0"
    if (def.transform === "floorInt" || def.fn === "totalCount" || def.fn === "totalAmount" || def.fn === "seq") {
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
      offset >= line.length
        ? ""
        : line.slice(offset, offset + def.length);
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

function classifyLine(
  line: string,
  index: number,
  total: number,
): "header" | "detail" | "trailer" | "unknown" {
  if (line.startsWith("BOF")) return "header";
  if (line.startsWith("EOF")) return "trailer";
  if (index === 0) return "header";
  if (index === total - 1) return "trailer";
  if (line.trim()) return "detail";
  return "unknown";
}

/**
 * 依 FormatSchema.records 將固定長度 ACH 文字檔解析為表單可用資料。
 * 表頭欄位優先取自 header 列，不足者由第一筆 detail 的 source=header 欄位補齊。
 */
export function parseAchText(
  text: string,
  schema: FormatSchema,
  opts?: { filename?: string },
): ImportResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  const filename = opts?.filename ?? "";
  const rawLines = splitLines(text);

  if (!rawLines.length) {
    errors.push("檔案沒有內容");
    return {
      detectedCode: null,
      schema,
      filename,
      header: emptyHeader(schema),
      rows: [],
      lines: [],
      trailer: {},
      warnings,
      errors,
      detailCount: 0,
    };
  }

  const detectedCode = detectFormatCode(text);
  if (detectedCode && detectedCode !== schema.code) {
    warnings.push(
      `檔案代號為 ${detectedCode}，目前以 ${schema.code} 格式解析`,
    );
  } else if (!detectedCode) {
    warnings.push("無法從 BOF 列辨識檔案代號（CDATA）");
  }

  const lines: ParsedLine[] = rawLines.map((raw, index) => {
    const kind = classifyLine(raw, index, rawLines.length);
    const section =
      kind === "header" || kind === "detail" || kind === "trailer"
        ? schema.records[kind].fields
        : null;
    const fields = section ? parseRecordFields(raw, section) : [];
    const lengthOk = raw.length === schema.recordLength;
    if (!lengthOk && kind !== "unknown") {
      warnings.push(
        `第 ${index + 1} 列（${kind}）長度 ${raw.length} ≠ 定義 ${schema.recordLength}`,
      );
    }
    return {
      index,
      kind,
      raw,
      length: raw.length,
      lengthOk,
      fields,
    };
  });

  const headerLine = lines.find((l) => l.kind === "header");
  const detailLines = lines.filter((l) => l.kind === "detail");
  const trailerLine = lines.find((l) => l.kind === "trailer");

  if (!headerLine) {
    errors.push("找不到表頭列（BOF）");
  }
  if (!trailerLine) {
    warnings.push("找不到尾筆列（EOF）");
  }
  if (!detailLines.length) {
    warnings.push("沒有明細列");
  }

  const header: HeaderValues = emptyHeader(schema);
  if (headerLine) {
    Object.assign(header, collectKeyedValues(headerLine.fields, "header"));
  }
  // detail 列上的 source=header 欄位（如銀行代號、帳號、統編、交易代號）
  if (detailLines[0]) {
    const fromDetail = collectKeyedValues(detailLines[0].fields, "header");
    for (const [k, v] of Object.entries(fromDetail)) {
      if (!header[k]) header[k] = v;
    }
  }

  // 僅保留 schema.form.header 定義的 key
  const headerKeys = new Set(schema.form.header.map((f) => f.key));
  for (const k of Object.keys(header)) {
    if (!headerKeys.has(k)) delete header[k];
  }
  for (const f of schema.form.header) {
    if (header[f.key] === undefined) header[f.key] = "";
  }

  const detailKeys = schema.form.detail.map((f) => f.key);
  const rows: DetailRow[] = detailLines.map((line) => {
    const values = collectKeyedValues(line.fields, "detail");
    const row = emptyDetailRow(schema, newRowId());
    for (const key of detailKeys) {
      row[key] = values[key] ?? "";
    }
    return row;
  });

  const trailer: Record<string, string> = {};
  if (trailerLine) {
    for (const f of trailerLine.fields) {
      if (f.source === "derived" && f.id) {
        trailer[f.id] = f.value;
      } else if (f.source === "header" && f.key) {
        trailer[f.key] = f.value;
      } else {
        trailer[f.id] = f.value;
      }
    }
  }

  return {
    detectedCode,
    schema,
    filename,
    header,
    rows,
    lines,
    trailer,
    warnings,
    errors,
    detailCount: rows.length,
  };
}

/** 在多個格式中選出最適合解析的 schema（優先 CDATA 代號，其次列長） */
export function resolveImportSchema(
  text: string,
  formats: Record<string, FormatSchema>,
  preferred?: FormatSchema,
): FormatSchema | null {
  const code = detectFormatCode(text);
  if (code && formats[code]) return formats[code];

  const lines = splitLines(text);
  const sample = lines.find((l) => l.startsWith("BOF")) ?? lines[0] ?? "";
  const byLength = Object.values(formats).find(
    (s) => s.recordLength === sample.length,
  );
  if (byLength) return byLength;

  return preferred ?? Object.values(formats)[0] ?? null;
}
