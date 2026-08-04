import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  FileDown,
  FileUp,
  Plus,
  Trash2,
  Search,
  Eraser,
  AlertTriangle,
  CheckCircle2,
  Filter,
  FilterX,
  FileCode2,
  FileText,
  Globe,
  Upload,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { useFormStore, useRefStore } from "@/lib/ach/store";
import type { FormatSchema, FormFieldDef } from "@/lib/ach/schema";
import {
  formatTxTypeLabel,
  generateFromSchema,
  headerHasError,
  isRowEmpty,
  lookupBranch,
  lookupTxid,
  rowErrorMessages,
  validateDetailRow,
  validateHeader,
} from "@/lib/ach/engine";
import {
  emptyDetailFilters,
  filterDetailRows,
  hasActiveFilters,
  isFieldFilterable,
  type DetailFilters,
  type FilterOptions,
} from "@/lib/ach/filter";
import {
  buildExportArtifacts,
  enabledExportFormats,
  EXPORT_FORMAT_META,
  type ExportFormatId,
} from "@/lib/ach/exportFormats";
import {
  parseAchText,
  resolveImportSchema,
  type ImportResult,
} from "@/lib/ach/import";
import { normalizeSubmitDate } from "@/lib/ach/utils";
import { saveAchFile, saveAchFiles } from "@/lib/ach/desktop";
import { CodePicker } from "./CodePicker";
import {
  ControlHeaderPreview,
  ControlTrailerPreview,
  ImportPreviewDialog,
} from "./ImportPreviewDialog";

type Props = {
  schema: FormatSchema;
  /** 匯入偵測到其他檔案代號時，切換到對應分頁 */
  onSelectFormat?: (code: string) => void;
};

const FORMAT_ICONS: Record<ExportFormatId, typeof FileText> = {
  txt: FileText,
  html: Globe,
  js: FileCode2,
};

const hiddenFileInputStyle: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0,
};

export function FormatPanel({ schema, onSelectFormat }: Props) {
  const { txids, branches, formats } = useRefStore();
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
    loadFromImport,
    isWorkspaceOpen,
    getWorkspace,
    openManualWorkspace,
    closeWorkspace,
  } = useFormStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const workspaceOpen = isWorkspaceOpen(schema.code);
  const workspace = getWorkspace(schema.code);

  const [picker, setPicker] = useState<{
    mode: "txid" | "branch";
    target: "header" | "row";
    key: string;
    rowId?: string;
  } | null>(null);

  const filterEnabled = schema.features.detailFilter !== false;
  const exportFormats = useMemo(() => enabledExportFormats(schema), [schema]);
  const [selectedExports, setSelectedExports] = useState<ExportFormatId[]>(
    () => enabledExportFormats(schema),
  );

  const [filters, setFilters] = useState<DetailFilters>(() =>
    emptyDetailFilters(schema),
  );
  const [filterOpts, setFilterOpts] = useState<FilterOptions>({
    hideEmpty: false,
    onlyErrors: false,
    global: "",
  });

  useEffect(() => {
    setFilters(emptyDetailFilters(schema));
    setFilterOpts({ hideEmpty: false, onlyErrors: false, global: "" });
    setSelectedExports(enabledExportFormats(schema));
  }, [schema.code, schema]);

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
    () => rows.map((r) => validateDetailRow(schema, r, txids, branches, header)),
    [schema, rows, txids, branches, header],
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

  const filtered = useMemo(() => {
    if (!filterEnabled) {
      return rows.map((row, index) => ({ row, index }));
    }
    return filterDetailRows(
      rows,
      schema,
      filters,
      filterOpts,
      (_row, index) => rowErrorMessages(rowErrs[index] ?? {}).length > 0,
    );
  }, [rows, schema, filters, filterOpts, rowErrs, filterEnabled]);

  const filtersActive = filterEnabled && hasActiveFilters(filters, filterOpts);

  function setFilterKey(key: string, value: string) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function clearAllFilters() {
    setFilters(emptyDetailFilters(schema));
    setFilterOpts({ hideEmpty: false, onlyErrors: false, global: "" });
  }

  function toggleExport(fmt: ExportFormatId) {
    setSelectedExports((prev) => {
      if (prev.includes(fmt)) {
        if (prev.length === 1) return prev; // 至少保留一種
        return prev.filter((x) => x !== fmt);
      }
      return [...prev, fmt];
    });
  }

  function fieldMeta(field: FormFieldDef): string {
    const v = header[field.key] ?? "";
    if (field.metaFrom === "txid") {
      const t = lookupTxid(v, txids);
      return t ? `${formatTxTypeLabel(t.type)} · ${t.name}` : "";
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
      const { value, convertedFromAd } = normalizeSubmitDate(
        header[field.key] ?? "",
      );
      if (value !== (header[field.key] ?? "")) {
        setHeader(schema.code, schema, field.key, value);
      }
      if (convertedFromAd) toast.message("已將日期西元年轉換為民國年");
    }
    blurHeader(schema.code, schema, field.key);
  }

  function validateBeforeGenerate(): boolean {
    if (headerHasError(headerErrs)) {
      toast.error("提出／發動者資料輸入有誤");
      return false;
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
      return false;
    }
    if (stats.count === 0) {
      toast.error("尚無有效明細資料");
      return false;
    }
    if (selectedExports.length === 0) {
      toast.error("請至少選擇一種輸出格式");
      return false;
    }
    return true;
  }

  async function handleGenerate(formats?: ExportFormatId[]) {
    if (!validateBeforeGenerate()) return;
    const want = formats?.length ? formats : selectedExports;
    const result = generateFromSchema(schema, header, rows, txids, branches);
    const badLen = result.lines.find((l) => l.length !== schema.recordLength);
    if (badLen) {
      toast.error(
        `產生列長度 ${badLen.length} 與定義 ${schema.recordLength} 不符，請檢查 JSON 格式`,
      );
      return;
    }
    const artifacts = buildExportArtifacts(
      schema,
      header,
      rows,
      result,
      txids,
      branches,
      want,
    );
    await saveAchFiles(
      artifacts.map((a) => ({
        filename: a.filename,
        content: a.content,
        mime: a.mime,
      })),
    );
    toast.success(
      `已產生 ${artifacts.map((a) => a.filename).join("、")}（${result.count} 筆）`,
    );
  }

  async function handleGenerateOne(fmt: ExportFormatId) {
    await handleGenerate([fmt]);
  }

  async function handleImportFile(file: File) {
    let text: string;
    try {
      text = await file.text();
    } catch {
      toast.error("無法讀取檔案");
      return;
    }
    const target =
      resolveImportSchema(text, formats, schema) ?? schema;
    const result = parseAchText(text, target, { filename: file.name });
    if (result.errors.length && result.detailCount === 0 && !result.lines.length) {
      toast.error(result.errors[0] ?? "匯入失敗");
      return;
    }
    setImportResult(result);
  }

  function applyImport(result: ImportResult) {
    loadFromImport(
      result.schema,
      {
        header: result.header,
        rows: result.rows,
      },
      { fileName: result.filename },
    );
    if (result.schema.code !== schema.code) {
      onSelectFormat?.(result.schema.code);
    }
    setImportResult(null);
    toast.success(
      `已匯入 ${result.schema.code}（${result.detailCount} 筆明細），可進行檢核與加工`,
    );
  }

  const selectOptions = (field: FormFieldDef) => {
    if (field.optionsFrom === "authOptions") return schema.authOptions ?? [];
    return [];
  };

  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept=".txt,text/plain"
      tabIndex={-1}
      aria-hidden="true"
      style={hiddenFileInputStyle}
      onChange={(e) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (file) void handleImportFile(file);
      }}
    />
  );

  // —— 預設：引導先上傳既有 P01／P02，隱藏新建表單 ——
  if (!workspaceOpen) {
    return (
      <div className="space-y-4">
        <div className="card overflow-hidden">
          <div className="border-b border-border bg-surface-2/60 px-4 py-4 sm:px-5">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="badge badge-ok font-mono">{schema.code}</span>
              <span className="badge badge-warn">
                V{schema.version.replace(/^V/i, "")}
              </span>
              <span className="text-xs text-muted">列長 {schema.recordLength}</span>
            </div>
            <h2 className="text-lg font-bold text-fg">
              {schema.shortCode} {schema.name}・檢核與加工
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-muted">
              本工具以既有財金 ACH 固定長度檔（P01 代收／代付、P02 授權）為主：
              先上傳檔案檢核欄位與列長，再視需要修正後重新產出。
            </p>
          </div>

          <div className="px-4 py-8 sm:px-8">
            <div
              className={`mx-auto flex max-w-xl flex-col items-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition ${
                dragOver
                  ? "border-primary bg-primary-soft/40"
                  : "border-border-strong bg-surface-2/40"
              }`}
              onDragEnter={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setDragOver(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const file = e.dataTransfer.files?.[0];
                if (file) void handleImportFile(file);
              }}
            >
              <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-primary-soft text-primary">
                <Upload className="size-7" />
              </div>
              <h3 className="text-base font-bold text-fg">請先上傳既有 ACH 檔</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                選擇或拖放 <code className="font-mono text-xs text-fg">.txt</code>{" "}
                固定長度上傳檔（BOF 列 CDATA 為{" "}
                <span className="font-mono text-fg">{schema.code}</span> 或其他已支援代號）。
                上傳後可預覽、檢核並加工後再匯出。
              </p>
              <button
                type="button"
                className="btn btn-primary mt-6"
                onClick={() => fileInputRef.current?.click()}
              >
                <FileUp className="size-4" />
                選擇檔案上傳
                <ArrowRight className="size-4 opacity-80" />
              </button>
              {fileInput}
              <ol className="mt-8 w-full max-w-sm space-y-2 text-left text-xs text-muted">
                <li className="flex gap-2">
                  <span className="font-mono font-bold text-primary">1</span>
                  上傳既有 P01／P02（.txt）
                </li>
                <li className="flex gap-2">
                  <span className="font-mono font-bold text-primary">2</span>
                  預覽並確認表頭／明細／列長
                </li>
                <li className="flex gap-2">
                  <span className="font-mono font-bold text-primary">3</span>
                  檢核錯誤、修正後重新產生上傳檔
                </li>
              </ol>
            </div>

            <div className="mx-auto mt-6 max-w-xl text-center">
              <button
                type="button"
                className="btn btn-ghost text-xs"
                onClick={() => {
                  openManualWorkspace(schema);
                  toast.message("已開啟空白表單（進階／新建）");
                }}
              >
                進階：不匯入，手動新建空白表單
              </button>
            </div>
          </div>
        </div>

        <ImportPreviewDialog
          open={!!importResult}
          result={importResult}
          txids={txids}
          branches={branches}
          onClose={() => setImportResult(null)}
          onApply={applyImport}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="card p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="badge badge-ok font-mono">{schema.code}</span>
              <span className="badge badge-warn">
                V{schema.version.replace(/^V/i, "")}
              </span>
              <span className="text-xs text-muted">列長 {schema.recordLength}</span>
              {workspace.source === "import" && (
                <span className="badge badge-ok gap-1">
                  <FileUp className="size-3" />
                  已匯入
                </span>
              )}
              {workspace.source === "manual" && (
                <span className="badge badge-warn">手動新建</span>
              )}
            </div>
            <h2 className="text-lg font-bold text-fg">
              {schema.shortCode} {schema.name}・檢核與加工
            </h2>
            <p className="mt-0.5 text-sm text-muted">
              {workspace.fileName
                ? `來源檔：${workspace.fileName} · 檢核欄位後可重新產生上傳檔`
                : schema.description ||
                  "檢核表頭／明細後產生固定長度上傳檔"}
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

        <div className="mb-4 space-y-4">
          <div>
            <h3 className="mb-1 text-sm font-bold text-fg">控制首錄（HEADER）</h3>
            <p className="mb-2 text-xs text-muted">
              對照財金固定長度首錄：首錄別、資料代號、處理日期、處理時間、發送／接收單位代號、版次。交易代號／帳號／統編不在此列。
            </p>
            <ControlHeaderPreview
              schema={schema}
              header={header}
              branches={branches}
            />
          </div>

          <div>
            <h3 className="mb-1 text-sm font-bold text-fg">
              提出／發動者資料（寫入明細共用）
            </h3>
            <p className="mb-2 text-xs text-muted">
              供編輯與檢核；產生檔時寫入明細錄（並衍生首錄發送單位代號）。
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {schema.form.header.map((field) => {
                const err = headerErrs[field.key];
                const meta = fieldMeta(field);
                return (
                  <div key={field.key}>
                    <label
                      className="field-label"
                      htmlFor={`${schema.code}-${field.key}`}
                    >
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
                            setHeader(
                              schema.code,
                              schema,
                              field.key,
                              e.target.value,
                            )
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
          </div>

          <div>
            <h3 className="mb-1 text-sm font-bold text-fg">控制尾錄（FOOTER）</h3>
            <p className="mb-2 text-xs text-muted">
              對照財金固定長度尾錄（總筆數、總金額等，產生時自動計算）。
            </p>
            <ControlTrailerPreview
              schema={schema}
              header={header}
              totalCount={stats.count}
              totalAmount={stats.amount}
              branches={branches}
            />
          </div>
        </div>

        {/* 成品輸出／加工 */}
        <div className="mt-4 rounded-lg border border-border bg-surface-2/70 p-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <FileDown className="size-4 text-primary" />
            <span className="text-sm font-semibold">檢核後產出</span>
            <span className="text-xs text-muted">
              修正資料後重新產生 TXT／HTML／JS
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {exportFormats.map((fmt) => {
              const meta = EXPORT_FORMAT_META[fmt];
              const Icon = FORMAT_ICONS[fmt];
              const on = selectedExports.includes(fmt);
              return (
                <button
                  key={fmt}
                  type="button"
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                    on
                      ? "border-primary bg-primary text-primary-fg"
                      : "border-border bg-surface text-muted hover:border-primary/40"
                  }`}
                  onClick={() => toggleExport(fmt)}
                  title={meta.description}
                >
                  <Icon className="size-3.5" />
                  {meta.label}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void handleGenerate()}
            >
              <FileDown className="size-4" />
              產生已選格式
              {selectedExports.length > 1
                ? `（${selectedExports.length}）`
                : ""}
            </button>
            {exportFormats.map((fmt) => {
              const meta = EXPORT_FORMAT_META[fmt];
              const Icon = FORMAT_ICONS[fmt];
              return (
                <button
                  key={`one-${fmt}`}
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => void handleGenerateOne(fmt)}
                >
                  <Icon className="size-4" />
                  {meta.ext.toUpperCase()}
                </button>
              );
            })}
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => fileInputRef.current?.click()}
            >
              <FileUp className="size-4" />
              重新上傳
            </button>
            {fileInput}
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
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                closeWorkspace(schema);
                toast.message("已關閉工作區，請重新上傳檔案");
              }}
            >
              關閉並回到上傳
            </button>
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-border px-4 py-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="font-bold">明細資料（檢核）</h3>
              <p className="text-xs text-muted">
                依匯入內容檢核；可修正後重新產生。亦可從 Excel 貼上（Tab 分隔：
                {schema.form.detail.map((f) => f.label).join("、")}）
                {filterEnabled && " · 篩選僅影響畫面，產檔仍含全部明細"}
              </p>
            </div>
            {filterEnabled && (
              <span className="stat-pill text-xs">
                顯示 {filtered.length} / {rows.length} 列
              </span>
            )}
          </div>

          {filterEnabled && (
            <div className="mt-3 space-y-2 rounded-lg border border-border bg-surface-2/80 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Filter className="size-4 text-primary" />
                <span className="text-sm font-semibold">明細篩選</span>
                <span className="text-xs text-muted">
                  依 JSON form.detail 欄位（預設全部可篩，可設 filterable: false）
                </span>
                {filtersActive && (
                  <button
                    type="button"
                    className="btn btn-ghost ml-auto h-8 gap-1 px-2 text-xs"
                    onClick={clearAllFilters}
                  >
                    <FilterX className="size-3.5" />
                    清除篩選
                  </button>
                )}
              </div>

              <div className="relative max-w-md">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-faint" />
                <input
                  className="field-input h-9 pl-8 text-sm"
                  placeholder="全域搜尋（任一欄位包含…）"
                  value={filterOpts.global ?? ""}
                  onChange={(e) =>
                    setFilterOpts((o) => ({ ...o, global: e.target.value }))
                  }
                />
              </div>

              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                {schema.form.detail.map((field) => {
                  if (!isFieldFilterable(field)) return null;
                  return (
                    <div key={field.key}>
                      <label
                        className="field-label"
                        htmlFor={`filter-${schema.code}-${field.key}`}
                      >
                        {field.label}
                      </label>
                      <input
                        id={`filter-${schema.code}-${field.key}`}
                        className={`field-input h-9 text-sm ${field.ui?.mono ? "font-mono" : ""} ${
                          (filters[field.key] ?? "").trim()
                            ? "ring-1 ring-primary/40"
                            : ""
                        }`}
                        placeholder={`篩選 ${field.label}`}
                        value={filters[field.key] ?? ""}
                        onChange={(e) => setFilterKey(field.key, e.target.value)}
                      />
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-4 pt-1 text-sm">
                <label className="inline-flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--color-primary)]"
                    checked={!!filterOpts.hideEmpty}
                    onChange={(e) =>
                      setFilterOpts((o) => ({
                        ...o,
                        hideEmpty: e.target.checked,
                      }))
                    }
                  />
                  隱藏空白列
                </label>
                <label className="inline-flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--color-primary)]"
                    checked={!!filterOpts.onlyErrors}
                    onChange={(e) =>
                      setFilterOpts((o) => ({
                        ...o,
                        onlyErrors: e.target.checked,
                      }))
                    }
                  />
                  只顯示錯誤列
                </label>
              </div>
            </div>
          )}
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
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={schema.form.detail.length + 4}
                    className="py-10 text-center text-muted"
                  >
                    {filtersActive
                      ? "沒有符合篩選條件的明細列"
                      : "尚無明細資料"}
                  </td>
                </tr>
              ) : (
                filtered.map(({ row, index: idx }) => {
                  const errs = rowErrs[idx] ?? {};
                  const messages = rowErrorMessages(errs);
                  const hasErr = messages.length > 0;
                  const bankName =
                    lookupBranch(row.bankCode ?? "", branches)?.name || "";
                  return (
                    <tr
                      key={row.id}
                      className={hasErr ? "has-error" : undefined}
                    >
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
                              onBlur={() =>
                                blurRow(schema.code, schema, row.id, field.key)
                              }
                              onPaste={
                                field.key === schema.form.detail[0]?.key
                                  ? (e) => {
                                      const text =
                                        e.clipboardData.getData("text");
                                      if (
                                        text.includes("\t") ||
                                        text.includes("\n")
                                      ) {
                                        e.preventDefault();
                                        pasteRows(
                                          schema.code,
                                          schema,
                                          idx,
                                          text,
                                        );
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
                      <td
                        className="max-w-36 truncate text-muted"
                        title={bankName}
                      >
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
                })
              )}
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
      <ImportPreviewDialog
        open={!!importResult}
        result={importResult}
        txids={txids}
        branches={branches}
        onClose={() => setImportResult(null)}
        onApply={applyImport}
      />
    </div>
  );
}
