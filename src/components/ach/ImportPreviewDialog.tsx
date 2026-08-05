import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  FileUp,
  Filter,
  ListTree,
  Loader2,
  Scissors,
  X,
} from "lucide-react";
import type {
  Branch,
  FormatSchema,
  RecordFieldDef,
  Txid,
} from "@/lib/ach/schema";
import {
  IMPORT_LIMITS,
  type ImportProgress,
  type ImportResult,
  type ParsedLine,
} from "@/lib/ach/import";
import {
  formatTxTypeLabel,
  lookupBranch,
} from "@/lib/ach/engine";
import {
  emptyDetailFilters,
  hasActiveFilters,
  isFieldFilterable,
  type DetailFilters,
} from "@/lib/ach/filter";
import {
  ControlHeaderFields,
  ControlTrailerFields,
} from "./ControlRecords";

type Props = {
  open: boolean;
  result: ImportResult | null;
  txids: Txid[];
  branches: Branch[];
  /** 原始上傳檔（大檔預先篩選需再次串流） */
  sourceFile?: File | null;
  scanning?: boolean;
  scanProgress?: ImportProgress | null;
  onClose: () => void;
  onApply: (result: ImportResult) => void | Promise<void>;
  /** 依篩選條件重新串流並載入符合列 */
  onFilterScan?: (
    filters: DetailFilters,
    global: string,
  ) => void | Promise<void>;
  /** 大檔：分割下載＋索引 */
  onPartition?: () => void;
  /** 大檔：串流轉 R01 後合併輸出 */
  onLargeConvertR01?: () => void;
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
  sourceFile = null,
  scanning = false,
  scanProgress = null,
  onClose,
  onApply,
  onFilterScan,
  onPartition,
  onLargeConvertR01,
}: Props) {
  /** 預設以表單欄位（可編輯對應）為準 */
  const [tab, setTab] = useState<PreviewTab>("form");
  const [applying, setApplying] = useState(false);
  const [draftFilters, setDraftFilters] = useState<DetailFilters>({});
  const [draftGlobal, setDraftGlobal] = useState("");

  const schema = result?.schema;
  const busy = applying || scanning;
  const canApply =
    !!result &&
    result.errors.length === 0 &&
    !result.tooLargeForForm &&
    !busy;

  useEffect(() => {
    if (!open) {
      setApplying(false);
      return;
    }
    if (result?.schema) {
      setDraftFilters(
        result.filterActive
          ? { ...result.appliedFilters }
          : emptyDetailFilters(result.schema),
      );
      setDraftGlobal(result.filterActive ? result.appliedGlobal : "");
      if (result.tooLargeForForm || result.filterActive) {
        setTab("form");
      }
    }
  }, [open, result]);

  async function handleApply() {
    if (!result || !canApply) return;
    setApplying(true);
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

  async function handleFilterScan() {
    if (!onFilterScan || busy) return;
    if (!hasActiveFilters(draftFilters, { global: draftGlobal })) {
      return;
    }
    await onFilterScan(draftFilters, draftGlobal);
  }

  function handleClose() {
    if (busy) return;
    onClose();
  }

  if (!open || !result || !schema) return null;

  const showPreFilter = !!sourceFile && !!onFilterScan;

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
        aria-busy={busy}
        aria-label="匯入預覽"
      >
        {busy && (
          <div
            className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-surface/80 backdrop-blur-[1px]"
            role="status"
            aria-live="polite"
          >
            <Loader2 className="size-9 animate-spin text-primary" />
            <p className="text-sm font-semibold text-fg">
              {scanning ? "依篩選條件串流載入中…" : "套用到表單中…"}
            </p>
            <p className="text-xs text-muted">
              {scanning && scanProgress
                ? `已讀 ${
                    scanProgress.totalBytes > 0
                      ? `${Math.min(
                          100,
                          Math.round(
                            (scanProgress.bytesRead / scanProgress.totalBytes) *
                              100,
                          ),
                        )}%`
                      : "…"
                  } · 符合 ${scanProgress.matchedCount.toLocaleString("zh-TW")}／總計 ${scanProgress.detailCount.toLocaleString("zh-TW")}`
                : `正在載入 ${result.matchedCount.toLocaleString("zh-TW")} 筆明細，請稍候`}
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
                列長 {schema.recordLength} · 明細{" "}
                {result.detailCount.toLocaleString("zh-TW")} 筆
                {result.filterActive
                  ? ` · 符合 ${result.matchedCount.toLocaleString("zh-TW")}`
                  : ""}
                {result.fileSize > 0
                  ? ` · ${(result.fileSize / (1024 * 1024)).toFixed(1)} MB`
                  : ""}
              </span>
              {result.filterActive && (
                <span className="badge badge-ok gap-1">
                  <Filter className="size-3" />
                  已套用篩選
                </span>
              )}
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
            disabled={busy}
            aria-label="關閉"
          >
            <X className="size-5" />
          </button>
        </div>

        {(result.errors.length > 0 ||
          result.warnings.length > 0 ||
          result.lengthErrorCount > 0) && (
          <div className="space-y-1.5 border-b border-border bg-surface-2/60 px-4 py-3">
            {result.lengthErrorCount > 0 && (
              <div className="flex items-start gap-2 text-sm text-accent">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  列長不符 {result.lengthErrorCount.toLocaleString("zh-TW")} 筆
                </span>
              </div>
            )}
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
              disabled={busy}
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
              branches={branches}
              draftFilters={draftFilters}
              draftGlobal={draftGlobal}
              filterEnabled={showPreFilter}
              filterBusy={busy}
              onFiltersChange={setDraftFilters}
              onGlobalChange={setDraftGlobal}
              onScan={() => void handleFilterScan()}
              onClearFilters={() => {
                setDraftFilters(emptyDetailFilters(schema));
                setDraftGlobal("");
              }}
            />
          )}
          {tab === "raw" && <RawPreview result={result} schema={schema} />}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3">
          <p className="text-xs text-muted">
            {result.tooLargeForForm
              ? result.filterActive
                ? "符合筆數仍超過上限，請在明細表頭縮小篩選後再套用"
                : "請在明細表頭輸入篩選條件並套用，或使用分割大檔／大檔轉 R01"
              : result.filterActive
                ? `將套用篩選後的 ${result.matchedCount.toLocaleString("zh-TW")} 筆到「${schema.code}」表單`
                : `套用後會覆寫「${schema.code}」目前的提出資料與明細`}
          </p>
          <div className="flex flex-wrap gap-2">
            {sourceFile && onPartition ? (
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy || result.detailCount === 0}
                onClick={onPartition}
                title="分割成 y 個小檔並建立 index"
              >
                <Scissors className="size-4" />
                分割大檔
              </button>
            ) : null}
            {sourceFile &&
            onLargeConvertR01 &&
            schema.code === "ACHP01" ? (
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy || result.detailCount === 0}
                onClick={onLargeConvertR01}
                title="串流分塊轉 R01 後合併輸出"
              >
                <ArrowRightLeft className="size-4" />
                大檔轉 R01
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleClose}
              disabled={busy}
            >
              {result.tooLargeForForm && !result.filterActive ? "關閉" : "取消"}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!canApply}
              onClick={() => void handleApply()}
              title={
                result.tooLargeForForm
                  ? `超過 ${IMPORT_LIMITS.maxFormDetailRows} 筆上限`
                  : undefined
              }
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
  const detailLines = result.lines.filter((l) => l.kind === "detail");
  const detailSamples = detailLines.slice(0, 2);

  return (
    <div className="space-y-5">
      <p className="text-xs text-muted">
        僅顯示明細錄的固定長度切片。控制首錄／尾錄請改看「表單欄位」（可編輯對應，不含長度定義）。
      </p>

      {detailSamples.length === 0 ? (
        <p className="text-sm text-muted">無明細樣本</p>
      ) : (
        detailSamples.map((line, i) => (
          <RecordFieldsTable
            key={line.index}
            title={`${KIND_LABEL.detail}（第 ${i + 1} 筆／共 ${detailLines.length}）`}
            line={line}
            defs={schema.records.detail.fields}
          />
        ))
      )}
      {detailLines.length > detailSamples.length && (
        <p className="text-xs text-muted">
          另有 {detailLines.length - detailSamples.length}{" "}
          筆明細未全部列出（見「原始列」）
        </p>
      )}
    </div>
  );
}

function FormPreview({
  schema,
  result,
  branches,
  draftFilters,
  draftGlobal,
  filterEnabled,
  filterBusy,
  onFiltersChange,
  onGlobalChange,
  onScan,
  onClearFilters,
}: {
  schema: FormatSchema;
  result: ImportResult;
  branches: Branch[];
  draftFilters: DetailFilters;
  draftGlobal: string;
  filterEnabled: boolean;
  filterBusy: boolean;
  onFiltersChange: (f: DetailFilters) => void;
  onGlobalChange: (g: string) => void;
  onScan: () => void;
  onClearFilters: () => void;
}) {
  const trailerCount = Number(
    (result.trailer.TCOUNT || String(result.detailCount)).replace(/^0+/, "") ||
      "0",
  );
  const trailerAmount = Number(
    (result.trailer.TAMT || "0").replace(/^0+/, "") || "0",
  );
  const filtersReady = hasActiveFilters(draftFilters, { global: draftGlobal });
  const filtersDirty =
    filterEnabled &&
    (draftGlobal !== (result.filterActive ? result.appliedGlobal : "") ||
      schema.form.detail.some((f) => {
        if (!isFieldFilterable(f)) return false;
        const draft = (draftFilters[f.key] ?? "").trim();
        const applied = result.filterActive
          ? (result.appliedFilters[f.key] ?? "").trim()
          : "";
        return draft !== applied;
      }));

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-lg border border-border">
        <div className="border-b border-border px-4 py-3">
          <h4 className="font-bold">控制首錄</h4>
          <p className="text-xs text-muted">
            對照財金控制首錄欄位名稱與值（不含長度／起迄）
          </p>
        </div>
        <ControlHeaderFields
          schema={schema}
          header={result.header}
          branches={branches}
        />
      </section>

      <section className="rounded-lg border border-border">
        <div className="border-b border-border px-4 py-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h4 className="font-bold">
                {result.filterActive ? "篩選結果（全部符合）" : "明細預覽"}
              </h4>
              <p className="text-xs text-muted">
                {filterEnabled
                  ? `在表頭輸入條件後套用篩選（載入上限 ${IMPORT_LIMITS.maxFormDetailRows.toLocaleString("zh-TW")} 筆）；亦可分割大檔`
                  : "匯入後可於表單繼續編輯"}
              </p>
            </div>
            <span className="stat-pill text-xs">
              {result.filterActive
                ? `符合 ${result.matchedCount.toLocaleString("zh-TW")}／總計 ${result.detailCount.toLocaleString("zh-TW")} 筆（列出 ${result.previewRows.length}）`
                : `顯示 ${result.previewRows.length}／${result.detailCount.toLocaleString("zh-TW")} 筆`}
            </span>
          </div>

          {filterEnabled ? (
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
              <div className="relative min-w-[10rem] max-w-sm flex-1">
                <input
                  className="field-input h-8 text-sm"
                  placeholder="全域搜尋（任一欄位包含…）"
                  value={draftGlobal}
                  disabled={filterBusy}
                  onChange={(e) => onGlobalChange(e.target.value)}
                />
              </div>
              <button
                type="button"
                className="btn btn-primary h-8 gap-1 px-3 text-xs"
                disabled={filterBusy || !filtersReady}
                onClick={onScan}
              >
                <Filter className="size-3.5" />
                {filtersDirty ? "套用篩選" : "套用篩選並載入"}
              </button>
              {filtersReady ? (
                <button
                  type="button"
                  className="btn btn-ghost h-8 gap-1 px-2 text-xs"
                  disabled={filterBusy}
                  onClick={onClearFilters}
                >
                  清除條件
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="scroll-panel max-h-[40vh] border-0 rounded-none">
          <table className="data-table">
            <thead>
              <tr>
                <th className="w-10">
                  <span className="th-label">#</span>
                  {filterEnabled ? (
                    <span className="block h-[1.7rem]" aria-hidden />
                  ) : null}
                </th>
                <th style={{ minWidth: "5.5rem" }}>
                  <span className="th-label">交易序號</span>
                  {filterEnabled ? (
                    <span className="block h-[1.7rem]" aria-hidden />
                  ) : null}
                </th>
                <th style={{ minWidth: "4.5rem" }}>
                  <span className="th-label">交易類別</span>
                  {filterEnabled ? (
                    <span className="block h-[1.7rem]" aria-hidden />
                  ) : null}
                </th>
                {schema.form.detail.map((f) => {
                  const canFilter = filterEnabled && isFieldFilterable(f);
                  const active = Boolean((draftFilters[f.key] ?? "").trim());
                  const shortLabel =
                    schema.records.detail.fields.find(
                      (rf) => rf.key === f.key && rf.source === "detail",
                    )?.label || f.label;
                  return (
                    <th
                      key={f.key}
                      style={{
                        minWidth:
                          f.key === "userNo"
                            ? "8rem"
                            : (f.ui?.minWidth ?? "7.5rem"),
                      }}
                    >
                      <span className="th-label" title={f.label}>
                        {shortLabel}
                      </span>
                      {canFilter ? (
                        <input
                          className={`th-filter ${active ? "is-active" : ""}`}
                          aria-label={`篩選 ${f.label}`}
                          placeholder="篩選…"
                          value={draftFilters[f.key] ?? ""}
                          disabled={filterBusy}
                          onChange={(e) =>
                            onFiltersChange({
                              ...draftFilters,
                              [f.key]: e.target.value,
                            })
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && filtersReady) onScan();
                          }}
                        />
                      ) : filterEnabled ? (
                        <span className="block h-[1.7rem]" aria-hidden />
                      ) : null}
                    </th>
                  );
                })}
                <th className="min-w-32">
                  <span className="th-label">銀行名稱</span>
                  {filterEnabled ? (
                    <span className="block h-[1.7rem]" aria-hidden />
                  ) : null}
                </th>
              </tr>
            </thead>
            <tbody>
              {result.previewRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={schema.form.detail.length + 4}
                    className="py-8 text-center text-muted"
                  >
                    {result.tooLargeForForm && !result.filterActive
                      ? "大檔僅預覽樣本列；請於表頭篩選後套用載入"
                      : "無明細"}
                  </td>
                </tr>
              ) : (
                result.previewRows.map((row, i) => (
                  <tr key={row.id}>
                    <td className="text-center text-faint">{i + 1}</td>
                    <td className="font-mono">{row.seq || ""}</td>
                    <td className="font-mono">
                      {row.txType ? formatTxTypeLabel(row.txType) : ""}
                    </td>
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

      <section className="overflow-hidden rounded-lg border border-border">
        <div className="border-b border-border px-4 py-3">
          <h4 className="font-bold">控制尾錄</h4>
          <p className="text-xs text-muted">
            對照財金控制尾錄；總筆數／總金額依明細彙總
          </p>
        </div>
        <ControlTrailerFields
          schema={schema}
          header={result.header}
          branches={branches}
          totalCount={trailerCount}
          totalAmount={trailerAmount}
        />
      </section>
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

/** @deprecated 改用 ControlHeaderFields */
export function ControlHeaderPreview({
  schema,
  header,
  branches,
}: {
  schema: FormatSchema;
  header: Record<string, string>;
  branches: Branch[];
}) {
  return (
    <ControlHeaderFields
      schema={schema}
      header={header}
      branches={branches}
    />
  );
}

/** @deprecated 改用 ControlTrailerFields */
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
  return (
    <ControlTrailerFields
      schema={schema}
      header={header}
      branches={branches}
      totalCount={totalCount}
      totalAmount={totalAmount}
    />
  );
}
