import { useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, Loader2, X } from "lucide-react";
import { RETURN_CODES } from "@/lib/ach/convertR01";
import { prevRocDate, safeDigits } from "@/lib/ach/utils";

type Props = {
  open: boolean;
  detailCount: number;
  /** 提出檔處理日期（8 碼民國） */
  tdate: string;
  busy?: boolean;
  onClose: () => void;
  onConfirm: (opts: {
    rcode: string;
    ydate: string;
    pdate: string;
  }) => void | Promise<void>;
};

export function ConvertR01Dialog({
  open,
  detailCount,
  tdate,
  busy = false,
  onClose,
  onConfirm,
}: Props) {
  const defaultYdate = useMemo(
    () => prevRocDate(safeDigits(tdate)) ?? "",
    [tdate],
  );
  const [rcode, setRcode] = useState("04");
  const [ydate, setYdate] = useState(defaultYdate);
  const [pdate, setPdate] = useState(safeDigits(tdate));

  useEffect(() => {
    if (!open) return;
    setRcode("04");
    setYdate(prevRocDate(safeDigits(tdate)) ?? "");
    setPdate(safeDigits(tdate));
  }, [open, tdate]);

  if (!open) return null;

  const yDigits = safeDigits(ydate);
  const pDigits = safeDigits(pdate);
  const rDigits = safeDigits(rcode).padStart(2, "0").slice(-2);
  const canSubmit =
    !busy &&
    detailCount > 0 &&
    rDigits.length === 2 &&
    yDigits.length === 8 &&
    pDigits.length === 8;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="convert-r01-title"
        className="relative w-full max-w-lg rounded-xl border border-border bg-surface shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <h2
              id="convert-r01-title"
              className="flex items-center gap-2 text-base font-semibold"
            >
              <ArrowRightLeft className="size-4 text-primary" />
              轉檔 P01 → R01（提回／退件）
            </h2>
            <p className="mt-1 text-xs text-muted">
              依財金 ACHP01/ACHR01 規格：TYPE=R、對調提出／提回行與帳號，並填入退件欄位。
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
          <p className="rounded-md bg-surface-2 px-3 py-2 text-xs text-muted">
            將轉換{" "}
            <span className="font-semibold text-fg">
              {detailCount.toLocaleString("zh-TW")}
            </span>{" "}
            筆有效明細；若含多個收受行，會依退件行分檔下載。
          </p>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-fg">退件理由代號</span>
            <select
              className="w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-sm"
              value={rDigits}
              onChange={(e) => setRcode(e.target.value)}
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
              <span className="text-xs font-medium text-fg">
                原提示交易日期（PDATE）
              </span>
              <input
                className="w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-sm"
                inputMode="numeric"
                maxLength={8}
                value={pdate}
                onChange={(e) => setPdate(safeDigits(e.target.value).slice(0, 8))}
                disabled={busy}
                placeholder="01150804"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-fg">
                前一營業日（YDATE）
              </span>
              <input
                className="w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-sm"
                inputMode="numeric"
                maxLength={8}
                value={ydate}
                onChange={(e) => setYdate(safeDigits(e.target.value).slice(0, 8))}
                disabled={busy}
                placeholder="01150803"
              />
              <span className="block text-[11px] text-muted">
                預設為處理日前一日（非營業日曆）
              </span>
            </label>
          </div>
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
            disabled={!canSubmit}
            onClick={() =>
              void onConfirm({ rcode: rDigits, ydate: yDigits, pdate: pDigits })
            }
          >
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                轉檔中…
              </>
            ) : (
              <>
                <ArrowRightLeft className="size-4" />
                產生 ACHR01
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
