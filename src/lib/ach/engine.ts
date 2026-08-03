import type {
  Branch,
  DetailRow,
  FormatSchema,
  FormFieldDef,
  HeaderValues,
  RecordFieldDef,
  Txid,
  ValidationRule,
} from "./schema";
import { applyPad, filterByCharset, formatExportField, sanitizeInput } from "./field";
import { nowHms, rocToDate } from "./utils";

export function lookupTxid(code: string, txids: Txid[]): Txid | undefined {
  return txids.find((t) => t.code === code);
}

export function lookupBranch(code: string, branches: Branch[]): Branch | undefined {
  return branches.find((b) => b.code === code);
}

export function resolveSorg(bankCode: string, branches: Branch[]): string {
  if (bankCode.startsWith("822")) return "8220901";
  const b = lookupBranch(bankCode, branches);
  return b?.head || bankCode;
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function emptyHeader(schema: FormatSchema): HeaderValues {
  const h: HeaderValues = {};
  for (const f of schema.form.header) {
    if (f.key === "date") {
      // 由 store 填 todayRoc
      h[f.key] = "";
    } else if (f.key === "admark") {
      h[f.key] = schema.authOptions?.[0]?.value ?? "A";
    } else if (f.key === "txid") {
      h[f.key] = "704";
    } else {
      h[f.key] = "";
    }
  }
  return h;
}

export function emptyDetailRow(schema: FormatSchema, id: string): DetailRow {
  const row: DetailRow = { id };
  for (const f of schema.form.detail) {
    row[f.key] = "";
  }
  return row;
}

export function isRowEmpty(row: DetailRow, schema: FormatSchema): boolean {
  return schema.form.detail.every((f) => !String(row[f.key] ?? "").trim());
}

export function runRule(
  rule: ValidationRule,
  value: string,
  ctx: {
    row?: DetailRow;
    schema: FormatSchema;
    section: "header" | "detail";
    field: FormFieldDef;
    txids: Txid[];
    branches: Branch[];
  },
): string | null {
  const v = value ?? "";

  switch (rule.type) {
    case "required":
      if (!v) return rule.message ?? "未輸入";
      return null;
    case "requiredIfAny": {
      if (v) return null;
      if (!ctx.row) return null;
      const any = ctx.schema.form.detail.some(
        (f) => f.key !== ctx.field.key && String(ctx.row![f.key] ?? "").trim(),
      );
      if (any) return rule.message ?? `${ctx.field.label}未輸入`;
      return null;
    }
    case "exactLength":
      if (!v) return null;
      if (v.length !== rule.length) return rule.message ?? `長度應為 ${rule.length} 碼`;
      return null;
    case "maxLength":
      if (v.length > rule.length) return rule.message ?? `不可超過 ${rule.length} 個字`;
      return null;
    case "oneOfLengths":
      if (!v) return null;
      if (!rule.lengths.includes(v.length)) {
        return rule.message ?? `長度應為 ${rule.lengths.join(" 或 ")} 碼`;
      }
      return null;
    case "rocDate": {
      if (!v || v.length !== 8) return rule.message ?? "日期長度請輸入八碼";
      const dt = rocToDate(v);
      if (!dt) return "非合法日期";
      if (rule.notPast && dt < startOfToday()) return "不允許輸入過去日期";
      return null;
    }
    case "txid": {
      if (!v) return null;
      const found = lookupTxid(v, ctx.txids);
      if (!found) return rule.message ?? "交易代號錯誤";
      if (rule.minValue != null && Number(v) < rule.minValue) {
        return rule.message ?? "交易代號錯誤";
      }
      return null;
    }
    case "branchCode": {
      if (!v) return null;
      if (!ctx.branches.some((b) => b.code === v)) {
        return rule.message ?? "銀行代號錯誤";
      }
      return null;
    }
    case "number": {
      if (!v) return null;
      if (!/^-?\d+(\.\d+)?$/.test(v) || Number.isNaN(Number(v))) {
        return rule.message ?? "必須是數字";
      }
      return null;
    }
    case "maxIntegerDigits": {
      if (!v) return null;
      const intPart = String(v).replace(/^-/, "").replace(/\..*$/, "");
      if (intPart.length > rule.length) {
        return rule.message ?? `整數最多 ${rule.length} 位數`;
      }
      return null;
    }
    default:
      return null;
  }
}

export function validateField(
  field: FormFieldDef,
  value: string,
  ctx: {
    row?: DetailRow;
    schema: FormatSchema;
    section: "header" | "detail";
    txids: Txid[];
    branches: Branch[];
  },
): string | null {
  const rules = field.validation?.rules ?? [];
  for (const rule of rules) {
    const err = runRule(rule, value, { ...ctx, field });
    if (err) return err;
  }
  return null;
}

export function validateHeader(
  schema: FormatSchema,
  header: HeaderValues,
  txids: Txid[],
  branches: Branch[],
): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const f of schema.form.header) {
    out[f.key] = validateField(f, header[f.key] ?? "", {
      schema,
      section: "header",
      txids,
      branches,
    });
  }
  return out;
}

export function headerHasError(errs: Record<string, string | null>): boolean {
  return Object.values(errs).some(Boolean);
}

export function validateDetailRow(
  schema: FormatSchema,
  row: DetailRow,
  txids: Txid[],
  branches: Branch[],
): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  if (isRowEmpty(row, schema)) {
    for (const f of schema.form.detail) out[f.key] = null;
    return out;
  }
  for (const f of schema.form.detail) {
    out[f.key] = validateField(f, row[f.key] ?? "", {
      row,
      schema,
      section: "detail",
      txids,
      branches,
    });
  }
  return out;
}

export function rowErrorMessages(errs: Record<string, string | null>): string[] {
  return Object.values(errs).filter(Boolean) as string[];
}

type BuildCtx = {
  schema: FormatSchema;
  header: HeaderValues;
  detail?: DetailRow;
  seq: number;
  totalCount: number;
  totalAmount: number;
  txids: Txid[];
  branches: Branch[];
};

function resolveField(def: RecordFieldDef, ctx: BuildCtx): string {
  const pad = def.pad;
  const length = def.length;

  switch (def.source) {
    case "literal":
      return formatExportField(def.value ?? "", {
        length,
        pad: pad ?? { side: "right", char: " " },
      });
    case "formatCode":
      return formatExportField(ctx.schema.code, {
        length,
        pad: pad ?? { side: "right", char: " " },
      });
    case "version":
      return formatExportField(ctx.schema.version, {
        length,
        pad: pad ?? { side: "right", char: " " },
      });
    case "filler":
      return (def.fill ?? " ").repeat(length);
    case "runtime":
      if (def.fn === "nowHms") {
        return formatExportField(nowHms(), {
          length,
          charset: "digit",
          pad: pad ?? { side: "left", char: "0" },
        });
      }
      return " ".repeat(length);
    case "derived": {
      let raw = "";
      if (def.fn === "sorg") {
        raw = resolveSorg(ctx.header.bankCode ?? "", ctx.branches);
      } else if (def.fn === "txType") {
        raw = lookupTxid(ctx.header.txid ?? "", ctx.txids)?.type || "";
      } else if (def.fn === "seq") {
        raw = String(ctx.seq);
      } else if (def.fn === "totalCount") {
        raw = String(ctx.totalCount);
      } else if (def.fn === "totalAmount") {
        raw = String(Math.floor(ctx.totalAmount));
      }
      return formatExportField(raw, {
        length,
        charset: def.charset,
        pad: pad ?? { side: "left", char: "0" },
        transform: def.transform,
      });
    }
    case "header": {
      const raw = ctx.header[def.key ?? ""] ?? "";
      return formatExportField(raw, {
        length,
        charset: def.charset,
        pad: pad ?? { side: "right", char: " " },
        transform: def.transform,
      });
    }
    case "detail": {
      const raw = ctx.detail?.[def.key ?? ""] ?? "";
      // 與原 VBA 對齊：銀行代號/帳號 charset 過濾後 pad.side=none 則不補長
      return formatExportField(raw, {
        length,
        charset: def.charset,
        pad: pad ?? { side: "right", char: " " },
        transform: def.transform,
      });
    }
    default:
      return " ".repeat(length);
  }
}

export function buildRecord(fields: RecordFieldDef[], ctx: BuildCtx): string {
  return fields.map((f) => resolveField(f, ctx)).join("");
}

export type GenerateResult = {
  content: string;
  count: number;
  amount: number;
  filename: string;
  lines: string[];
  recordLength: number;
};

export function generateFromSchema(
  schema: FormatSchema,
  header: HeaderValues,
  rows: DetailRow[],
  txids: Txid[],
  branches: Branch[],
): GenerateResult {
  const amountKey = schema.features.amountKey;
  const nonEmpty = rows.filter((r) => !isRowEmpty(r, schema));

  let totalAmount = 0;
  if (amountKey) {
    for (const r of nonEmpty) {
      totalAmount += Number(r[amountKey]) || 0;
    }
  }

  const baseCtx: Omit<BuildCtx, "seq" | "detail"> = {
    schema,
    header,
    totalCount: nonEmpty.length,
    totalAmount,
    txids,
    branches,
  };

  const lines: string[] = [];
  lines.push(
    buildRecord(schema.records.header.fields, {
      ...baseCtx,
      seq: 0,
      totalCount: nonEmpty.length,
    }),
  );

  let seq = 1;
  for (const row of nonEmpty) {
    lines.push(
      buildRecord(schema.records.detail.fields, {
        ...baseCtx,
        detail: row,
        seq,
      }),
    );
    seq += 1;
  }

  lines.push(
    buildRecord(schema.records.trailer.fields, {
      ...baseCtx,
      seq: 0,
      totalCount: nonEmpty.length,
    }),
  );

  const ending = schema.lineEnding || "\r\n";
  const content = lines.join(ending) + ending;

  // filename: {code}_{date}{txid}{taxId}.txt
  const filename = schema.filenamePattern
    .replace("{code}", schema.code)
    .replace("{date}", header.date ?? "")
    .replace("{txid}", header.txid ?? "")
    .replace("{taxId}", header.taxId ?? "")
    .replace("{shortCode}", schema.shortCode);

  return {
    content,
    count: nonEmpty.length,
    amount: totalAmount,
    filename,
    lines,
    recordLength: schema.recordLength,
  };
}

/** 套用 form field 的 pad onBlur */
export function applyFieldBlur(field: FormFieldDef, value: string): string {
  let v = value;
  if (field.charset && field.inputType !== "amount") {
    v = filterByCharset(v, field.charset);
  }
  if (field.pad?.onBlur && field.pad.side !== "none" && v) {
    v = applyPad(v, field.length, field.pad);
  }
  return v;
}

export function sanitizeFieldInput(field: FormFieldDef, raw: string): string {
  return sanitizeInput(raw, {
    charset: field.charset,
    length: field.length,
    inputType: field.inputType,
  });
}

export function assertRecordLengths(schema: FormatSchema): string[] {
  const errs: string[] = [];
  for (const section of ["header", "detail", "trailer"] as const) {
    const len = schema.records[section].fields.reduce((s, f) => s + f.length, 0);
    if (len !== schema.recordLength) {
      errs.push(
        `${schema.code} ${section} 欄位總長 ${len} ≠ recordLength ${schema.recordLength}`,
      );
    }
  }
  return errs;
}
