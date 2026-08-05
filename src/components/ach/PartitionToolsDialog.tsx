import { useMemo, useRef, useState } from "react";
import {
  Combine,
  Loader2,
  Scissors,
  X,
  ArrowRightLeft,
} from "lucide-react";
import { toast } from "sonner";
import type { Branch, FormatSchema, Txid } from "@/lib/ach/schema";
import {
  describeSaveResult,
  saveAchFile,
  saveAchFiles,
} from "@/lib/ach/desktop";
import {
  PARTITION_LIMITS,
  convertLargeP01FileToR01,
  convertMergedP01PartitionsToR01,
  mergeAchPartitions,
  parsePartitionIndex,
  partitionAchFile,
  partitionIndexFilename,
  planPartitions,
  planPartitionsForEdit,
  stringifyPartitionIndex,
  type PartitionIndex,
  type PartitionProgress,
} from "@/lib/ach/partition";
import {
  parsePartToForm,
  usePartitionStore,
} from "@/lib/ach/partitionStore";
import { RETURN_CODES } from "@/lib/ach/convertR01";
import { IMPORT_LIMITS } from "@/lib/ach/import";
import { prevRocDate, safeDigits } from "@/lib/ach/utils";

type Mode = "split" | "merge" | "convert";

type Props = {
  open: boolean;
  mode: Mode;
  schema: FormatSchema;
  formats: Record<string, FormatSchema>;
  txids: Txid[];
  branches: Branch[];
  /** 分割／大檔轉檔的來源檔 */
  sourceFile?: File | null;
  detailCount?: number;
  tdate?: string;
  onClose: () => void;
  /** 分割後開啟網頁編輯：載入第一包到表單 */
  onOpenPartitionEdit?: (payload: {
    header: import("@/lib/ach/schema").HeaderValues;
    rows: import("@/lib/ach/schema").DetailRow[];
    fileName: string;
  }) => void;
};

export function PartitionToolsDialog({
  open,
  mode,
  schema,
  formats,
  txids,
  branches,
  sourceFile = null,
  detailCount = 0,
  tdate = "",
  onClose,
  onOpenPartitionEdit,
}: Props) {
  const mergeInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<PartitionProgress | null>(null);
  const startSession = usePartitionStore((s) => s.startSession);
  const setActiveIndex = usePartitionStore((s) => s.setActiveIndex);

  const suggested = useMemo(() => {
    try {
      return planPartitionsForEdit(detailCount || 1);
    } catch {
      return planPartitions(detailCount || 1, {
        chunkSize: PARTITION_LIMITS.defaultChunkSize,
      });
    }
  }, [detailCount]);
  const [partCount, setPartCount] = useState(suggested.partCount || 1);
  /** 分割後在網頁逐包編輯（預設開啟） */
  const [openForEdit, setOpenForEdit] = useState(true);
  /** 是否另外下載 ZIP */
  const [alsoDownload, setAlsoDownload] = useState(false);

  const [rcode, setRcode] = useState("04");
  const [ydate, setYdate] = useState(
    () => prevRocDate(safeDigits(tdate)) ?? "",
  );
  const [pdate, setPdate] = useState(() => safeDigits(tdate));

  const [mergeFiles, setMergeFiles] = useState<File[]>([]);
  const [mergeConvert, setMergeConvert] = useState(false);

  if (!open) return null;

  const title =
    mode === "split"
      ? "分割大檔＋建立索引"
      : mode === "merge"
        ? "合併分割檔"
        : "大檔轉 R01（分塊→合併）";

  async function handleSplit() {
    if (!sourceFile) {
      toast.error("沒有來源檔");
      return;
    }
    setBusy(true);
    setProgress(null);
    try {
      let y = Math.min(
        Math.max(1, Math.floor(partCount)),
        PARTITION_LIMITS.maxPartCount,
      );
      if (openForEdit) {
        const plan = planPartitionsForEdit(detailCount || 1, y);
        if (plan.autoRaised) {
          toast.message(
            `為可在網頁編輯，已自動調整為 ${plan.partCount} 包（每包 ≤ ${IMPORT_LIMITS.maxFormDetailRows.toLocaleString("zh-TW")} 筆）`,
          );
        }
        y = plan.partCount;
        setPartCount(y);
      }

      const partFiles: { filename: string; content: string }[] = [];
      const index = await partitionAchFile(
        sourceFile,
        schema,
        txids,
        branches,
        {
          partCount: y,
          onProgress: setProgress,
          onPartition: (p) => {
            partFiles.push({ filename: p.filename, content: p.content });
          },
        },
      );

      if (alsoDownload || !openForEdit) {
        const downloadList = [
          ...partFiles,
          {
            filename: partitionIndexFilename(sourceFile.name),
            content: stringifyPartitionIndex(index),
            mime: "application/json;charset=utf-8",
          },
        ];
        const base =
          sourceFile.name.replace(/\.[^.]+$/, "") || schema.code;
        const saved = await saveAchFiles(downloadList, {
          zipName: `${base}.parts.zip`,
        });
        if (saved.method === "canceled" && !openForEdit) {
          toast.message("已取消儲存");
          return;
        }
        if (saved.method !== "canceled") {
          toast.success(
            `已下載分割包 · ${describeSaveResult(saved)}`,
          );
        }
      }

      if (openForEdit) {
        startSession({
          formatCode: schema.code,
          sourceFilename: sourceFile.name,
          index,
          parts: partFiles,
        });
        const first = partFiles[0];
        if (!first) throw new Error("分割結果為空");
        const parsed = parsePartToForm(schema, first.content, first.filename);
        setActiveIndex(0);
        onOpenPartitionEdit?.({
          header: parsed.header,
          rows: parsed.rows,
          fileName: first.filename,
        });
        toast.success(
          `已分割 ${index.partCount} 包（共 ${index.totalDetailCount.toLocaleString("zh-TW")} 筆），已載入第 1 包供編輯`,
        );
      } else if (!alsoDownload) {
        // 僅下載模式但使用者取消勾選下載——仍強制下載
        toast.message("已分割（未勾選下載）");
      }
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "分割失敗");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function handleMerge() {
    if (mergeFiles.length < 2) {
      toast.error("請同時選擇索引 JSON 與分割 .txt 檔");
      return;
    }
    setBusy(true);
    try {
      const indexFile = mergeFiles.find((f) =>
        f.name.toLowerCase().endsWith(".json"),
      );
      if (!indexFile) throw new Error("請包含 partition-index.json");
      const index = parsePartitionIndex(await indexFile.text()) as PartitionIndex;
      const target =
        formats[index.formatCode] ??
        (index.formatCode === schema.code ? schema : null);
      if (!target) {
        throw new Error(`找不到格式定義 ${index.formatCode}`);
      }

      const parts = new Map<string, string>();
      for (const f of mergeFiles) {
        if (f.name.toLowerCase().endsWith(".json")) continue;
        parts.set(f.name, await f.text());
      }

      if (mergeConvert && index.formatCode === "ACHP01") {
        const r01 = formats.ACHR01;
        if (!r01) throw new Error("找不到 ACHR01");
        const result = convertMergedP01PartitionsToR01(
          r01,
          target,
          { index, parts },
          txids,
          branches,
          {
            rcode: safeDigits(rcode).padStart(2, "0").slice(-2),
            ydate: safeDigits(ydate),
            pdate: safeDigits(pdate),
          },
        );
        const saved = await saveAchFiles(
          result.files.map((f) => ({
            filename: f.filename,
            content: f.content,
          })),
        );
        if (saved.method === "canceled") {
          toast.message("已取消儲存");
          return;
        }
        toast.success(
          `已合併轉檔 R01（${result.detailCount.toLocaleString("zh-TW")} 筆）· ${describeSaveResult(saved)}`,
        );
      } else {
        const merged = mergeAchPartitions(
          target,
          { index, parts },
          txids,
          branches,
        );
        await saveAchFile(merged.filename, merged.content);
        toast.success(
          `已合併 ${merged.filename}（${merged.detailCount.toLocaleString("zh-TW")} 筆）`,
        );
      }
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "合併失敗");
    } finally {
      setBusy(false);
    }
  }

  async function handleLargeConvert() {
    if (!sourceFile) {
      toast.error("沒有來源檔");
      return;
    }
    const r01 = formats.ACHR01;
    const p01 = formats.ACHP01 ?? schema;
    if (!r01 || p01.code !== "ACHP01") {
      toast.error("大檔轉 R01 需要 ACHP01／ACHR01 格式");
      return;
    }
    setBusy(true);
    setProgress(null);
    try {
      const result = await convertLargeP01FileToR01(
        sourceFile,
        p01,
        r01,
        txids,
        branches,
        {
          rcode: safeDigits(rcode).padStart(2, "0").slice(-2),
          ydate: safeDigits(ydate),
          pdate: safeDigits(pdate),
          onProgress: setProgress,
        },
      );
      const saved = await saveAchFiles(
        result.files.map((f) => ({
          filename: f.filename,
          content: f.content,
        })),
      );
      if (saved.method === "canceled") {
        toast.message("已取消儲存");
        return;
      }
      toast.success(
        `已大檔轉 R01（${result.detailCount.toLocaleString("zh-TW")} 筆）· ${describeSaveResult(saved)}`,
      );
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "大檔轉檔失敗");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  const progressLabel = progress
    ? progress.phase === "count"
      ? `掃描中… ${progress.detailCount.toLocaleString("zh-TW")} 筆`
      : progress.phase === "write"
        ? `寫出分割 ${progress.partIndex}/${progress.partCount}`
        : progress.phase === "convert"
          ? `轉檔中… ${progress.detailCount.toLocaleString("zh-TW")} 筆`
          : "合併中…"
    : null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4">
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-lg rounded-xl border border-border bg-surface shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold">
              {mode === "split" ? (
                <Scissors className="size-4 text-primary" />
              ) : mode === "merge" ? (
                <Combine className="size-4 text-primary" />
              ) : (
                <ArrowRightLeft className="size-4 text-primary" />
              )}
              {title}
            </h2>
            <p className="mt-1 text-xs text-muted">
              {mode === "split" &&
                "將 x 筆切成 y 包；預設在網頁逐包載入編輯（每包 ≤ 可編輯上限），也可另存 ZIP。"}
              {mode === "merge" &&
                "選擇索引 JSON 與全部 part*.txt，合併回單一 ACH 大檔（可順便轉 R01）。"}
              {mode === "convert" &&
                "不經表單：串流分塊轉 ACHR01；多檔結果打包 ZIP 或寫入同一資料夾。"}
            </p>
          </div>
          <button
            type="button"
            className="btn btn-ghost !px-2"
            onClick={onClose}
            disabled={busy}
            aria-label="關閉"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-3 px-4 py-4">
          {mode === "split" && (
            <>
              <p className="rounded-md bg-surface-2 px-3 py-2 text-xs text-muted">
                來源{" "}
                <span className="font-mono text-fg">
                  {sourceFile?.name ?? "—"}
                </span>
                {detailCount > 0
                  ? ` · ${detailCount.toLocaleString("zh-TW")} 筆`
                  : ""}
                。最多 {PARTITION_LIMITS.maxPartCount} 檔。
              </p>
              <label className="block space-y-1">
                <span className="text-xs font-medium">分割檔數 y</span>
                <input
                  type="number"
                  min={1}
                  max={PARTITION_LIMITS.maxPartCount}
                  className="w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-sm"
                  value={partCount}
                  onChange={(e) =>
                    setPartCount(Number(e.target.value) || 1)
                  }
                  disabled={busy}
                />
                <span className="block text-[11px] text-muted">
                  建議至少 {suggested.partCount || 1} 包（每包 ≤{" "}
                  {IMPORT_LIMITS.maxFormDetailRows.toLocaleString("zh-TW")}{" "}
                  筆才能在網頁編輯）
                </span>
              </label>
              <label className="flex items-start gap-2 text-xs">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={openForEdit}
                  onChange={(e) => setOpenForEdit(e.target.checked)}
                  disabled={busy}
                />
                <span>
                  <span className="font-medium text-fg">分割後在網頁編輯</span>
                  <span className="block text-muted">
                    開啟分割工作區，逐包載入表單修改，再「合併全部輸出」
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-xs">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={alsoDownload || !openForEdit}
                  onChange={(e) => setAlsoDownload(e.target.checked)}
                  disabled={busy || !openForEdit}
                />
                <span>
                  <span className="font-medium text-fg">同時下載 ZIP／資料夾</span>
                  <span className="block text-muted">
                    未勾選「網頁編輯」時會自動下載
                  </span>
                </span>
              </label>
            </>
          )}

          {mode === "merge" && (
            <>
              <input
                ref={mergeInputRef}
                type="file"
                multiple
                accept=".txt,.json,text/plain,application/json"
                className="hidden"
                onChange={(e) =>
                  setMergeFiles(Array.from(e.target.files ?? []))
                }
              />
              <button
                type="button"
                className="btn btn-secondary w-full"
                disabled={busy}
                onClick={() => mergeInputRef.current?.click()}
              >
                選擇索引 JSON ＋ 分割 txt（可多選）
              </button>
              {mergeFiles.length > 0 && (
                <ul className="max-h-32 overflow-auto rounded-md border border-border bg-surface-2 px-3 py-2 text-xs font-mono">
                  {mergeFiles.map((f) => (
                    <li key={f.name}>{f.name}</li>
                  ))}
                </ul>
              )}
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={mergeConvert}
                  onChange={(e) => setMergeConvert(e.target.checked)}
                  disabled={busy}
                />
                合併時一併轉成 ACHR01（來源須為 ACHP01 分割）
              </label>
              {mergeConvert && (
                <ConvertFields
                  rcode={rcode}
                  ydate={ydate}
                  pdate={pdate}
                  busy={busy}
                  onRcode={setRcode}
                  onYdate={setYdate}
                  onPdate={setPdate}
                />
              )}
            </>
          )}

          {mode === "convert" && (
            <>
              <p className="rounded-md bg-surface-2 px-3 py-2 text-xs text-muted">
                來源{" "}
                <span className="font-mono text-fg">
                  {sourceFile?.name ?? "—"}
                </span>
                {detailCount > 0
                  ? ` · ${detailCount.toLocaleString("zh-TW")} 筆`
                  : ""}
              </p>
              <ConvertFields
                rcode={rcode}
                ydate={ydate}
                pdate={pdate}
                busy={busy}
                onRcode={setRcode}
                onYdate={setYdate}
                onPdate={setPdate}
              />
            </>
          )}

          {progressLabel && (
            <p className="flex items-center gap-2 text-xs text-muted">
              <Loader2 className="size-3.5 animate-spin" />
              {progressLabel}
            </p>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-border px-4 py-3">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onClose}
            disabled={busy}
          >
            取消
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => {
              if (mode === "split") void handleSplit();
              else if (mode === "merge") void handleMerge();
              else void handleLargeConvert();
            }}
          >
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                處理中…
              </>
            ) : mode === "split" ? (
              openForEdit ? "分割並開始編輯" : "分割並下載"
            ) : mode === "merge" ? (
              mergeConvert ? "合併並轉 R01" : "合併下載"
            ) : (
              "開始大檔轉 R01"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConvertFields({
  rcode,
  ydate,
  pdate,
  busy,
  onRcode,
  onYdate,
  onPdate,
}: {
  rcode: string;
  ydate: string;
  pdate: string;
  busy: boolean;
  onRcode: (v: string) => void;
  onYdate: (v: string) => void;
  onPdate: (v: string) => void;
}) {
  const rDigits = safeDigits(rcode).padStart(2, "0").slice(-2);
  return (
    <div className="space-y-3">
      <label className="block space-y-1">
        <span className="text-xs font-medium">退件理由代號</span>
        <select
          className="w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-sm"
          value={rDigits}
          onChange={(e) => onRcode(e.target.value)}
          disabled={busy}
        >
          {RETURN_CODES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-xs font-medium">PDATE</span>
          <input
            className="w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-sm"
            maxLength={8}
            value={pdate}
            onChange={(e) => onPdate(safeDigits(e.target.value).slice(0, 8))}
            disabled={busy}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium">YDATE</span>
          <input
            className="w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-sm"
            maxLength={8}
            value={ydate}
            onChange={(e) => onYdate(safeDigits(e.target.value).slice(0, 8))}
            disabled={busy}
          />
        </label>
      </div>
    </div>
  );
}
