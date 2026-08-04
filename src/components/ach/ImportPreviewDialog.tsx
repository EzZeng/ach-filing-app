import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileUp,
  ListTree,
  X,
} from "lucide-react";
import type { Branch, FormatSchema, Txid } from "@/lib/ach/schema";
import type { ImportResult } from "@/lib/ach/import";
import { lookupBranch, lookupTxid } from "@/lib/ach/engine";

type Props = {
  open: boolean;
  result: ImportResult | null;
  txids: Txid[];
  branches: Branch[];
  onClose: () => void;
  onApply: (result: ImportResult) => void;
};

type PreviewTab = "form" | "fields" | "raw";

export function ImportPreviewDialog({
  open,
  result,
  txids,
  branches,
  onClose,
  onApply,
}: Props) {
  const [tab, setTab] = useState<PreviewTab>("form");

  const schema = result?.schema;
  const canApply = !!result && result.errors.length === 0;

  const headerNotes = useMemo(() => {
    if (!result || !schema) return {};
    const notes: Record<string, string> = {};
    for (const f of schema.form.header) {
      const v = result.header[f.key] ?? "";
      if (f.metaFrom === "txid") {
        const t = lookupTxid(v, txids);
        notes[f.key] = t ? `${t.type} · ${t.name}` : "";
      } else if (f.metaFrom === "branch") {
        notes[f.key] = lookupBranch(v, branches)?.name ?? "";
      } else if (f.optionsFrom === "authOptions") {
        notes[f.key] =
          schema.authOptions?.find((o) => o.value === v)?.note ?? "";
      }
    }
    return notes;
  }, [result, schema, txids, branches]);

  if (!open || !result || !schema) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="card flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="匯入預覽"
      >
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
              {result.detectedCode
                ? ` · 偵測 ${result.detectedCode}`
                : ""}
            </p>
          </div>
          <button
            type="button"
            className="btn btn-ghost px-2"
            onClick={onClose}
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
              ["form", "表單欄位"],
              ["fields", "固定長度欄位"],
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
          {tab === "form" && (
            <FormPreview
              schema={schema}
              result={result}
              headerNotes={headerNotes}
              branches={branches}
            />
          )}
          {tab === "fields" && <FieldsPreview result={result} />}
          {tab === "raw" && <RawPreview result={result} schema={schema} />}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3">
          <p className="text-xs text-muted">
            套用後會覆寫「{schema.code}」目前的表頭與明細
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              取消
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!canApply}
              onClick={() => onApply(result)}
            >
              <CheckCircle2 className="size-4" />
              套用到表單
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FormPreview({
  schema,
  result,
  headerNotes,
  branches,
}: {
  schema: FormatSchema;
  result: ImportResult;
  headerNotes: Record<string, string>;
  branches: Branch[];
}) {
  return (
    <div className="space-y-4">
      <section>
        <h4 className="mb-2 text-sm font-bold">表頭</h4>
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
                  <td className="text-muted">{headerNotes[f.key] || ""}</td>
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

      {Object.keys(result.trailer).length > 0 && (
        <section>
          <h4 className="mb-2 text-sm font-bold">尾筆摘要</h4>
          <div className="flex flex-wrap gap-2">
            {Object.entries(result.trailer)
              .filter(([k, v]) => v && k !== "FILLER" && k !== "EOF")
              .map(([k, v]) => (
                <span key={k} className="stat-pill font-mono text-xs">
                  {k}={v}
                </span>
              ))}
          </div>
        </section>
      )}
    </div>
  );
}

function FieldsPreview({ result }: { result: ImportResult }) {
  const samples = result.lines.filter((l) => l.kind !== "unknown").slice(0, 3);
  if (!samples.length) {
    return <p className="text-sm text-muted">無可解析的固定長度欄位</p>;
  }
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted">
        依 JSON records 定義切片（顯示前 {samples.length} 列）
      </p>
      {samples.map((line) => (
        <section key={line.index}>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <ListTree className="size-4 text-primary" />
            <h4 className="text-sm font-bold">
              第 {line.index + 1} 列 · {line.kind}
            </h4>
            <span
              className={`badge ${line.lengthOk ? "badge-ok" : "badge-err"}`}
            >
              長度 {line.length}
            </span>
          </div>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>source</th>
                  <th>key</th>
                  <th>長度</th>
                  <th>原始</th>
                  <th>解析值</th>
                </tr>
              </thead>
              <tbody>
                {line.fields.map((f) => (
                  <tr key={`${line.index}-${f.id}-${f.key ?? ""}`}>
                    <td className="font-mono text-xs">{f.id}</td>
                    <td className="text-xs text-muted">{f.source}</td>
                    <td className="font-mono text-xs">{f.key || "—"}</td>
                    <td className="text-center">{f.length}</td>
                    <td className="max-w-48 truncate font-mono text-xs" title={f.raw}>
                      {f.raw.replace(/ /g, "·") || "—"}
                    </td>
                    <td className="font-mono text-xs">{f.value || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
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
            <th className="w-20">類型</th>
            <th>內容</th>
            <th className="w-20">長度</th>
          </tr>
        </thead>
        <tbody>
          {result.lines.map((line) => (
            <tr key={line.index} className={line.lengthOk ? undefined : "has-error"}>
              <td className="text-center text-faint">{line.index + 1}</td>
              <td className="text-xs">{line.kind}</td>
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
