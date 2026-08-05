import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileUp,
  ListTree,
  Loader2,
  X,
} from "lucide-react";
import type {
  Branch,
  FormatSchema,
  RecordFieldDef,
  Txid,
} from "@/lib/ach/schema";
import type { ImportResult, ParsedLine } from "@/lib/ach/import";
import {
  formatTxTypeLabel,
  lookupBranch,
  lookupTxid,
  resolveSorg,
} from "@/lib/ach/engine";

type Props = {
  open: boolean;
  result: ImportResult | null;
  txids: Txid[];
  branches: Branch[];
  onClose: () => void;
  onApply: (result: ImportResult) => void | Promise<void>;
};

type PreviewTab = "fields" | "form" | "raw";

const KIND_LABEL: Record<ParsedLine["kind"], string> = {
  header: "控制首錄（HEADER）",
  detail: "明細錄",
  trailer: "控制尾錄（FOOTER）",
  unknown: "未知",
};

export function ImportPreviewDialog({
  open,
  result,
  txids,
  branches,
  onClose,
  onApply,
}: Props) {
  /** 預設以固定長度欄位（控制首／尾錄）為準 */
  const [tab, setTab] = useState<PreviewTab>("fields");
  const [applying, setApplying] = useState(false);

  const schema = result?.schema;
  const canApply = !!result && result.errors.length === 0 && !applying;

  useEffect(() => {
    if (!open) setApplying(false);
  }, [open]);

  const formNotes = useMemo(() => {
    if (!result || !schema) return {};
    const notes: Record<string, string> = {};
    for (const f of schema.form.header) {
      const v = result.header[f.key] ?? "";
      if (f.metaFrom === "txid") {
        const t = lookupTxid(v, txids);
        notes[f.key] = t ? `${formatTxTypeLabel(t.type)} · ${t.name}` : "";
      } else if (f.metaFrom === "branch") {
        notes[f.key] = lookupBranch(v, branches)?.name ?? "";
      } else if (f.optionsFrom === "authOptions") {
        notes[f.key] =
          schema.authOptions?.find((o) => o.value === v)?.note ?? "";
      }
    }
    return notes;
  }, [result, schema, txids, branches]);

  async function handleApply() {
    if (!result || !canApply) return;
    setApplying(true);
    // 讓 loading mask 先完成繪製，再執行套用（大量明細時較不易卡住）
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        window.setTimeout(resolve, 40);
      });
    });
    try {
      await onApply(result);
    } finally {
      setApplying(false);
    }
  }

  function handleClose() {
    if (applying) return;
    onClose();
  }

  if (!open || !result || !schema) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center"
      onClick={handleClose}
      role="presentation"
    >
      <div
        className="card relative flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-busy={applying}
        aria-label="匯入預覽"
      >
        {applying && (
          <div
            className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-surface/80 backdrop-blur-[1px]"
            role="status"
            aria-live="polite"
          >
            <Loader2 className="size-9 animate-spin text-primary" />
            <p className="text-sm font-semibold text-fg">套用到表單中…</p>
            <p className="text-xs text-muted">
              正在載入 {result.detailCount} 筆明細，請稍候
            </p>
          </div>
        )}

        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <FileUp className="size-4 text-primary" />
              <h3 className="text-base font-bold text-fg">匯入預覽</h3>
              <span className="badge badge-ok font-mono">{schema.code}</span>
              <span className="badge badge-warn">
                V{schema.version.replace(/^V/i, "")}
              </span>
              <span className="text-xs text-muted">
                列長 {schema.recordLength} · 明細 {result.detailCount} 筆
              </span>
            </div>
            <p className="truncate text-xs text-muted" title={result.filename}>
              {result.filename || "未命名檔案"} · {schema.shortCode}{" "}
              {schema.name}
              {result.detectedCode ? ` · 偵測 ${result.detectedCode}` : ""}
            </p>
          </div>
          <button
            type="button"
            className="btn btn-ghost px-2"
            onClick={handleClose}
            disabled={applying}
            aria-label="關閉"
          >
            <X className="size-5" />
          </button>
        </div>

        {(result.errors.length > 0 || result.warnings.length > 0) && (
          <div className="space-y-1.5 border-b border-border bg-surface-2/60 px-4 py-3">
            {result.errors.map((msg) => (
              <div
                key={`e-${msg}`}
                className="flex items-start gap-2 text-sm font-semibold text-danger"
              >
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                <span>{msg}</span>
              </div>
            ))}
            {result.warnings.slice(0, 6).map((msg) => (
              <div
                key={`w-${msg}`}
                className="flex items-start gap-2 text-sm text-accent"
              >
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                <span>{msg}</span>
              </div>
            ))}
            {result.warnings.length > 6 && (
              <p className="text-xs text-muted">
                另有 {result.warnings.length - 6} 則警告…
              </p>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-1 border-b border-border px-4 pt-2">
          {(
            [
              ["fields", "固定長度欄位"],
              ["form", "表單欄位"],
              ["raw", "原始列"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`rounded-t-md px-3 py-2 text-sm font-semibold transition ${
                tab === id
                  ? "bg-surface text-primary ring-1 ring-border ring-b-transparent"
                  : "text-muted hover:text-fg"
              }`}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-4 py-3">
          {tab === "fields" && <FieldsPreview result={result} schema={schema} />}
          {tab === "form" && (
            <FormPreview
              schema={schema}
              result={result}
              formNotes={formNotes}
              branches={branches}
            />
          )}
          {tab === "raw" && <RawPreview result={result} schema={schema} />}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3">
          <p className="text-xs text-muted">
            套用後會覆寫「{schema.code}」目前的提出資料與明細
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleClose}
              disabled={applying}
            >
              取消
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!canApply}
              onClick={() => void handleApply()}
            >
              {applying ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <CheckCircle2 className="size-4" />
              )}
              {applying ? "套用中…" : "套用到表單"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RecordFieldsTable({
  title,
  line,
  defs,
}: {
  title: string;
  line?: ParsedLine;
  defs: RecordFieldDef[];
}) {
  if (!line) {
    return (
      <section>
        <h4 className="mb-2 text-sm font-bold">{title}</h4>
        <p className="text-sm text-muted">無此列</p>
      </section>
    );
  }

  const byId = new Map(defs.map((d) => [d.id, d]));

  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <ListTree className="size-4 text-primary" />
        <h4 className="text-sm font-bold">{title}</h4>
        <span className={`badge ${line.lengthOk ? "badge-ok" : "badge-err"}`}>
          長度 {line.length}
        </span>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="data-table">
          <thead>
            <tr>
              <th>欄位</th>
              <th>ID</th>
              <th>長度</th>
              <th>原始</th>
              <th>解析值</th>
            </tr>
          </thead>
          <tbody>
            {line.fields
              .filter((f) => f.id !== "FILLER")
              .map((f) => {
                const def = byId.get(f.id);
                return (
                  <tr key={`${line.index}-${f.id}-${f.key ?? ""}`}>
                    <td className="whitespace-nowrap">
                      {def?.label || f.id}
                    </td>
                    <td className="font-mono text-xs">{f.id}</td>
                    <td className="text-center">{f.length}</td>
                    <td
                      className="max-w-48 truncate font-mono text-xs"
                      title={f.raw}
                    >
                      {f.raw.replace(/ /g, "·") || "—"}
                    </td>
                    <td className="font-mono text-xs">{f.value || "—"}</td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function FieldsPreview({
  result,
  schema,
}: {
  result: ImportResult;
  schema: FormatSchema;
}) {
  const headerLine = result.lines.find((l) => l.kind === "header");
  const trailerLine = result.lines.find((l) => l.kind === "trailer");
  const detailLines = result.lines.filter((l) => l.kind === "detail");
  const detailSamples = detailLines.slice(0, 2);

  return (
    <div className="space-y-5">
      <p className="text-xs text-muted">
        依財金固定長度規格切片。表頭＝控制首錄、表尾＝控制尾錄（不含「交易代號／帳號」等明細共用欄）。
      </p>

      <RecordFieldsTable
        title={KIND_LABEL.header}
        line={headerLine}
        defs={schema.records.header.fields}
      />

      {detailSamples.map((line, i) => (
        <RecordFieldsTable
          key={line.index}
          title={`${KIND_LABEL.detail}（第 ${i + 1} 筆／共 ${detailLines.length}）`}
          line={line}
          defs={schema.records.detail.fields}
        />
      ))}
      {detailLines.length > detailSamples.length && (
        <p className="text-xs text-muted">
          另有 {detailLines.length - detailSamples.length} 筆明細未全部列出（見「原始列」）
        </p>
      )}

      <RecordFieldsTable
        title={KIND_LABEL.trailer}
        line={trailerLine}
        defs={schema.records.trailer.fields}
      />
    </div>
  );
}

function FormPreview({
  schema,
  result,
  formNotes,
  branches,
}: {
  schema: FormatSchema;
  result: ImportResult;
  formNotes: Record<string, string>;
  branches: Branch[];
}) {
  const headerLine = result.lines.find((l) => l.kind === "header");
  const trailerLine = result.lines.find((l) => l.kind === "trailer");

  return (
    <div className="space-y-4">
      <RecordFieldsTable
        title="控制首錄（HEADER）"
        line={headerLine}
        defs={schema.records.header.fields}
      />

      <section>
        <h4 className="mb-1 text-sm font-bold">提出／發動者資料（寫入明細共用）</h4>
        <p className="mb-2 text-xs text-muted">
          這些不是控制首錄欄位；匯入時由首錄衍生欄與明細列還原，供表單編輯。
        </p>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="data-table">
            <thead>
              <tr>
                <th>欄位</th>
                <th>值</th>
                <th>說明</th>
              </tr>
            </thead>
            <tbody>
              {schema.form.header.map((f) => (
                <tr key={f.key}>
                  <td className="whitespace-nowrap">{f.label}</td>
                  <td className="font-mono">{result.header[f.key] || "—"}</td>
                  <td className="text-muted">{formNotes[f.key] || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center gap-2">
          <h4 className="text-sm font-bold">明細</h4>
          <span className="stat-pill text-xs">{result.detailCount} 筆</span>
        </div>
        <div className="scroll-panel max-h-[40vh] rounded-lg border border-border">
          <table className="data-table">
            <thead>
              <tr>
                <th className="w-10">#</th>
                {schema.form.detail.map((f) => (
                  <th key={f.key}>{f.label}</th>
                ))}
                <th>銀行名稱</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={schema.form.detail.length + 2}
                    className="py-8 text-center text-muted"
                  >
                    無明細
                  </td>
                </tr>
              ) : (
                result.rows.map((row, i) => (
                  <tr key={row.id}>
                    <td className="text-center text-faint">{i + 1}</td>
                    {schema.form.detail.map((f) => (
                      <td
                        key={f.key}
                        className={`font-mono ${f.ui?.align === "right" ? "text-right" : ""}`}
                      >
                        {row[f.key] || ""}
                      </td>
                    ))}
                    <td className="text-muted">
                      {lookupBranch(row.bankCode ?? "", branches)?.name ?? ""}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <RecordFieldsTable
        title="控制尾錄（FOOTER）"
        line={trailerLine}
        defs={schema.records.trailer.fields}
      />
    </div>
  );
}

function RawPreview({
  result,
  schema,
}: {
  result: ImportResult;
  schema: FormatSchema;
}) {
  return (
    <div className="scroll-panel max-h-[50vh] rounded-lg border border-border">
      <table className="data-table">
        <thead>
          <tr>
            <th className="w-12">#</th>
            <th className="w-40">類型</th>
            <th>內容</th>
            <th className="w-20">長度</th>
          </tr>
        </thead>
        <tbody>
          {result.lines.map((line) => (
            <tr key={line.index} className={line.lengthOk ? undefined : "has-error"}>
              <td className="text-center text-faint">{line.index + 1}</td>
              <td className="text-xs">{KIND_LABEL[line.kind]}</td>
              <td className="max-w-xl truncate font-mono text-[11px]" title={line.raw}>
                {line.raw}
              </td>
              <td
                className={`text-center font-mono text-xs ${
                  line.lengthOk ? "text-ok" : "font-semibold text-danger"
                }`}
              >
                {line.length}
                {!line.lengthOk ? ` / ${schema.recordLength}` : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** 編輯畫面用：依目前提出資料預覽控制首錄欄位（對齊固定長度 HEADER） */
export function ControlHeaderPreview({
  schema,
  header,
  branches,
}: {
  schema: FormatSchema;
  header: Record<string, string>;
  branches: Branch[];
}) {
  const values: Record<string, string> = {
    BOF: "BOF",
    CDATA: schema.code,
    TDATE: header.date ?? "",
    TTIME: "（產生時）",
    SORG: resolveSorg(header.bankCode ?? "", branches),
    RORG:
      schema.records.header.fields.find((f) => f.id === "RORG")?.value ??
      "9990250",
    VERNO: schema.version,
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="data-table text-xs">
        <thead>
          <tr>
            <th>欄位</th>
            <th>ID</th>
            <th>長度</th>
            <th>值</th>
          </tr>
        </thead>
        <tbody>
          {schema.records.header.fields
            .filter((f) => f.id !== "FILLER")
            .map((f) => (
              <tr key={f.id}>
                <td className="whitespace-nowrap">{f.label || f.id}</td>
                <td className="font-mono">{f.id}</td>
                <td className="text-center">{f.length}</td>
                <td className="font-mono">{values[f.id] || "—"}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

export function ControlTrailerPreview({
  schema,
  header,
  totalCount,
  totalAmount,
  branches,
}: {
  schema: FormatSchema;
  header: Record<string, string>;
  totalCount: number;
  totalAmount: number;
  branches: Branch[];
}) {
  const values: Record<string, string> = {
    EOF: "EOF",
    CDATA: schema.code,
    TDATE: header.date ?? "",
    SORG: resolveSorg(header.bankCode ?? "", branches),
    RORG:
      schema.records.trailer.fields.find((f) => f.id === "RORG")?.value ??
      "9990250",
    TCOUNT: String(totalCount),
    TAMT: String(Math.floor(totalAmount)),
    YDATE: "（空白）",
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="data-table text-xs">
        <thead>
          <tr>
            <th>欄位</th>
            <th>ID</th>
            <th>長度</th>
            <th>值</th>
          </tr>
        </thead>
        <tbody>
          {schema.records.trailer.fields
            .filter((f) => f.id !== "FILLER")
            .map((f) => (
              <tr key={f.id}>
                <td className="whitespace-nowrap">{f.label || f.id}</td>
                <td className="font-mono">{f.id}</td>
                <td className="text-center">{f.length}</td>
                <td className="font-mono">{values[f.id] ?? "—"}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
