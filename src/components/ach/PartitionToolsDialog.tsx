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
import { saveAchFile, saveAchFiles } from "@/lib/ach/desktop";
import {
  PARTITION_LIMITS,
  convertLargeP01FileToR01,
  convertMergedP01PartitionsToR01,
  mergeAchPartitions,
  parsePartitionIndex,
  partitionAchFile,
  partitionIndexFilename,
  planPartitions,
  stringifyPartitionIndex,
  type PartitionIndex,
  type PartitionProgress,
} from "@/lib/ach/partition";
import { RETURN_CODES } from "@/lib/ach/convertR01";
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
}: Props) {
  const mergeInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<PartitionProgress | null>(null);

  const suggested = useMemo(
    () =>
      planPartitions(detailCount || 1, {
        chunkSize: PARTITION_LIMITS.defaultChunkSize,
      }),
    [detailCount],
  );
  const [partCount, setPartCount] = useState(suggested.partCount || 1);

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
    const y = Math.min(
      Math.max(1, Math.floor(partCount)),
      PARTITION_LIMITS.maxPartCount,
    );
    setBusy(true);
    setProgress(null);
    try {
      const parts: { filename: string; content: string }[] = [];
      const index = await partitionAchFile(
        sourceFile,
        schema,
        txids,
        branches,
        {
          partCount: y,
          onProgress: setProgress,
          onPartition: (p) => {
            parts.push({ filename: p.filename, content: p.content });
          },
        },
      );
      await saveAchFiles(parts);
      await saveAchFile(
        partitionIndexFilename(sourceFile.name),
        stringifyPartitionIndex(index),
        "application/json;charset=utf-8",
      );
      toast.success(
        `已分割 ${index.partCount} 檔（共 ${index.totalDetailCount.toLocaleString("zh-TW")} 筆）並下載索引`,
      );
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
        await saveAchFiles(
          result.files.map((f) => ({
            filename: f.filename,
            content: f.content,
          })),
        );
        toast.success(
          `已合併轉檔 R01（${result.detailCount.toLocaleString("zh-TW")} 筆，${result.files.length} 檔）`,
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
      await saveAchFiles(
        result.files.map((f) => ({
          filename: f.filename,
          content: f.content,
        })),
      );
      toast.success(
        `已大檔轉 R01（${result.detailCount.toLocaleString("zh-TW")} 筆 → ${result.files.length} 檔）`,
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
                "將 x 筆明細平均切成 y 個小檔，並下載 partition-index.json 供後續合併。"}
              {mode === "merge" &&
                "選擇索引 JSON 與全部 part*.txt，合併回單一 ACH 大檔（可順便轉 R01）。"}
              {mode === "convert" &&
                "不經表單：串流分塊轉 ACHR01，再依退件行合併輸出大檔。"}
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
                  建議{" "}
                  {suggested.partCount || 1} 檔（約每檔{" "}
                  {PARTITION_LIMITS.defaultChunkSize.toLocaleString("zh-TW")}{" "}
                  筆）
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
              "分割並下載"
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
