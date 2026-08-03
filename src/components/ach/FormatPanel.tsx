import { useEffect, useMemo, useState } from "react";
import {
  FileDown,
  Plus,
  Trash2,
  Search,
  Eraser,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { useFormStore, useRefStore } from "@/lib/ach/store";
import type { FormatSchema, FormFieldDef } from "@/lib/ach/schema";
import {
  generateFromSchema,
  headerHasError,
  isRowEmpty,
  lookupBranch,
  lookupTxid,
  rowErrorMessages,
  validateDetailRow,
  validateHeader,
} from "@/lib/ach/engine";
import { normalizeSubmitDate } from "@/lib/ach/utils";
import { saveAchFile } from "@/lib/ach/desktop";
import { CodePicker } from "./CodePicker";

type Props = { schema: FormatSchema };

export function FormatPanel({ schema }: Props) {
  const { txids, branches } = useRefStore();
  const {
    ensureForm,
    getForm,
    setHeader,
    blurHeader,
    updateRow,
    blurRow,
    addRows,
    removeRow,
    clearRows,
    pasteRows,
  } = useFormStore();

  const [picker, setPicker] = useState<{
    mode: "txid" | "branch";
    target: "header" | "row";
    key: string;
    rowId?: string;
  } | null>(null);

  useEffect(() => {
    ensureForm(schema);
  }, [schema, ensureForm]);

  const form = getForm(schema.code) ?? { header: {}, rows: [] };
  const header = form.header;
  const rows = form.rows;

  const headerErrs = useMemo(
    () => validateHeader(schema, header, txids, branches),
    [schema, header, txids, branches],
  );

  const rowErrs = useMemo(
    () => rows.map((r) => validateDetailRow(schema, r, txids, branches)),
    [schema, rows, txids, branches],
  );

  const stats = useMemo(() => {
    let count = 0;
    let amount = 0;
    let errRows = 0;
    const amountKey = schema.features.amountKey;
    rows.forEach((r, i) => {
      if (isRowEmpty(r, schema)) return;
      const msgs = rowErrorMessages(rowErrs[i] ?? {});
      if (msgs.length) errRows += 1;
      else {
        count += 1;
        if (amountKey) amount += Number(r[amountKey]) || 0;
      }
    });
    return { count, amount, errRows };
  }, [rows, rowErrs, schema]);

  function fieldMeta(field: FormFieldDef): string {
    const v = header[field.key] ?? "";
    if (field.metaFrom === "txid") {
      const t = lookupTxid(v, txids);
      return t ? `${t.type} · ${t.name}` : "";
    }
    if (field.metaFrom === "branch") {
      return lookupBranch(v, branches)?.name ?? "";
    }
    if (field.optionsFrom === "authOptions") {
      return schema.authOptions?.find((o) => o.value === v)?.note ?? "";
    }
    return "";
  }

  function onHeaderBlur(field: FormFieldDef) {
    if (field.inputType === "rocDate") {
      const { value, convertedFromAd } = normalizeSubmitDate(header[field.key] ?? "");
      if (value !== (header[field.key] ?? "")) {
        setHeader(schema.code, schema, field.key, value);
      }
      if (convertedFromAd) toast.message("已將日期西元年轉換為民國年");
    }
    blurHeader(schema.code, schema, field.key);
  }

  async function handleGenerate() {
    if (headerHasError(headerErrs)) {
      toast.error("表頭資料輸入有誤");
      return;
    }
    const bad: number[] = [];
    rows.forEach((r, i) => {
      if (isRowEmpty(r, schema)) return;
      if (rowErrorMessages(rowErrs[i] ?? {}).length) bad.push(i + 1);
    });
    if (bad.length) {
      toast.error(
        `第 ${bad.slice(0, 12).join("、")}${bad.length > 12 ? "…" : ""} 列資料仍有錯誤！`,
      );
      return;
    }
    if (stats.count === 0) {
      toast.error("尚無有效明細資料");
      return;
    }
    const result = generateFromSchema(schema, header, rows, txids, branches);
    // 驗證產生長度
    const badLen = result.lines.find((l) => l.length !== schema.recordLength);
    if (badLen) {
      toast.error(
        `產生列長度 ${badLen.length} 與定義 ${schema.recordLength} 不符，請檢查 JSON 格式`,
      );
      return;
    }
    await saveAchFile(result.filename, result.content);
    toast.success(`已產生 ${result.filename}（${result.count} 筆）`);
  }

  const selectOptions = (field: FormFieldDef) => {
    if (field.optionsFrom === "authOptions") return schema.authOptions ?? [];
    return [];
  };

  return (
    <div className="space-y-4">
      <div className="card p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="badge badge-ok font-mono">{schema.code}</span>
              <span className="badge badge-warn">V{schema.version.replace(/^V/i, "")}</span>
              <span className="text-xs text-muted">列長 {schema.recordLength}</span>
            </div>
            <h2 className="text-lg font-bold text-fg">
              {schema.shortCode} {schema.name}
            </h2>
            <p className="mt-0.5 text-sm text-muted">
              {schema.description || "依 JSON 格式定義產生固定長度上傳檔"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="stat-pill">總筆數 {stats.count}</span>
            {schema.features.sumAmount && (
              <span className="stat-pill">
                總金額 {stats.amount.toLocaleString("zh-TW")}
              </span>
            )}
            {stats.errRows > 0 ? (
              <span className="badge badge-err gap-1">
                <AlertTriangle className="size-3" />
                {stats.errRows} 列錯誤
              </span>
            ) : (
              <span className="badge badge-ok gap-1">
                <CheckCircle2 className="size-3" />
                明細正常
              </span>
            )}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {schema.form.header.map((field) => {
            const err = headerErrs[field.key];
            const meta = fieldMeta(field);
            return (
              <div key={field.key}>
                <label className="field-label" htmlFor={`${schema.code}-${field.key}`}>
                  {field.label}
                </label>
                {field.inputType === "select" ? (
                  <select
                    id={`${schema.code}-${field.key}`}
                    className={`field-input ${err ? "err" : "warn"}`}
                    value={header[field.key] ?? ""}
                    onChange={(e) =>
                      setHeader(schema.code, schema, field.key, e.target.value)
                    }
                  >
                    {selectOptions(field).map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="flex gap-1">
                    <input
                      id={`${schema.code}-${field.key}`}
                      className={`field-input ${field.ui?.mono ? "font-mono" : ""} ${err ? "err" : "warn"}`}
                      value={header[field.key] ?? ""}
                      maxLength={field.length || undefined}
                      placeholder={field.placeholder}
                      onChange={(e) =>
                        setHeader(schema.code, schema, field.key, e.target.value)
                      }
                      onBlur={() => onHeaderBlur(field)}
                    />
                    {field.picker && (
                      <button
                        type="button"
                        className="btn btn-secondary px-2"
                        onClick={() =>
                          setPicker({
                            mode: field.picker!,
                            target: "header",
                            key: field.key,
                          })
                        }
                        aria-label={`搜尋${field.label}`}
                      >
                        <Search className="size-4" />
                      </button>
                    )}
                  </div>
                )}
                <div className={err ? "field-hint" : "field-meta"}>
                  {err || meta || "\u00a0"}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary" onClick={() => void handleGenerate()}>
            <FileDown className="size-4" />
            產生 {schema.shortCode} 檔案
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => addRows(schema.code, schema, 10)}
          >
            <Plus className="size-4" />
            新增 10 列
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              clearRows(schema.code, schema);
              toast.message("明細已清空");
            }}
          >
            <Eraser className="size-4" />
            清空明細
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-border px-4 py-3">
          <h3 className="font-bold">明細資料</h3>
          <p className="text-xs text-muted">
            可從 Excel 複製後貼上（Tab 分隔：
            {schema.form.detail.map((f) => f.label).join("、")}）
          </p>
        </div>
        <div className="scroll-panel border-0 rounded-none">
          <table className="data-table">
            <thead>
              <tr>
                <th className="w-10">#</th>
                {schema.form.detail.map((f) => (
                  <th key={f.key} style={{ minWidth: f.ui?.minWidth }}>
                    {f.label}
                  </th>
                ))}
                <th className="min-w-32">銀行名稱</th>
                <th className="min-w-40">錯誤訊息</th>
                <th className="w-12" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
                const errs = rowErrs[idx] ?? {};
                const messages = rowErrorMessages(errs);
                const hasErr = messages.length > 0;
                const bankName = lookupBranch(row.bankCode ?? "", branches)?.name || "";
                return (
                  <tr key={row.id} className={hasErr ? "has-error" : undefined}>
                    <td className="text-center text-faint">{idx + 1}</td>
                    {schema.form.detail.map((field) => (
                      <td key={field.key}>
                        <div className="flex gap-0.5">
                          <input
                            className={`cell-input ${field.ui?.align === "right" ? "text-right" : ""} ${errs[field.key] ? "err" : ""}`}
                            value={row[field.key] ?? ""}
                            onChange={(e) =>
                              updateRow(
                                schema.code,
                                schema,
                                row.id,
                                field.key,
                                e.target.value,
                              )
                            }
                            onBlur={() => blurRow(schema.code, schema, row.id, field.key)}
                            onPaste={
                              field.key === schema.form.detail[0]?.key
                                ? (e) => {
                                    const text = e.clipboardData.getData("text");
                                    if (text.includes("\t") || text.includes("\n")) {
                                      e.preventDefault();
                                      pasteRows(schema.code, schema, idx, text);
                                    }
                                  }
                                : undefined
                            }
                          />
                          {field.picker === "branch" && (
                            <button
                              type="button"
                              className="btn btn-ghost px-1 py-0"
                              onClick={() =>
                                setPicker({
                                  mode: "branch",
                                  target: "row",
                                  key: field.key,
                                  rowId: row.id,
                                })
                              }
                            >
                              <Search className="size-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    ))}
                    <td className="max-w-36 truncate text-muted" title={bankName}>
                      {bankName}
                    </td>
                    <td className="whitespace-pre-line text-xs font-semibold text-danger">
                      {messages.join("\n")}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-ghost px-1 text-danger"
                        onClick={() => removeRow(schema.code, row.id)}
                        aria-label="刪除列"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <CodePicker
        open={picker?.mode === "txid"}
        mode="txid"
        items={txids}
        onClose={() => setPicker(null)}
        onSelect={(code) => {
          if (picker?.target === "header") {
            setHeader(schema.code, schema, picker.key, code);
          }
        }}
      />
      <CodePicker
        open={picker?.mode === "branch"}
        mode="branch"
        items={branches}
        onClose={() => setPicker(null)}
        onSelect={(code) => {
          if (!picker) return;
          if (picker.target === "header") {
            setHeader(schema.code, schema, picker.key, code);
          } else if (picker.rowId) {
            updateRow(schema.code, schema, picker.rowId, picker.key, code);
          }
        }}
      />
    </div>
  );
}
