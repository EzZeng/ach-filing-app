import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import type { Branch, Txid } from "@/lib/ach/schema";
import { formatTxTypeLabel } from "@/lib/ach/engine";

type Mode = "txid" | "branch";

type Props = {
  open: boolean;
  mode: Mode;
  items: Txid[] | Branch[];
  onClose: () => void;
  onSelect: (code: string) => void;
};

export function CodePicker({ open, mode, items, onClose, onSelect }: Props) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return items.slice(0, 80);
    return items
      .filter((it) => {
        if (mode === "txid") {
          const t = it as Txid;
          const typeLabel = formatTxTypeLabel(t.type).toLowerCase();
          return (
            t.code.includes(query) ||
            t.name.toLowerCase().includes(query) ||
            t.type.toLowerCase().includes(query) ||
            typeLabel.includes(query) ||
            (query.includes("代收") && t.type === "SD") ||
            (query.includes("代付") && t.type === "SC")
          );
        }
        const b = it as Branch;
        return b.code.includes(query) || b.name.toLowerCase().includes(query);
      })
      .slice(0, 120);
  }, [items, mode, q]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="card flex max-h-[80vh] w-full max-w-xl flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={mode === "txid" ? "選擇交易代號" : "選擇銀行代號"}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h3 className="text-base font-bold text-fg">
              {mode === "txid" ? "交易代號（代收 SD／代付 SC）" : "銀行／分行代號"}
            </h3>
            <p className="text-xs text-muted">
              {mode === "txid"
                ? "SD＝代收、SC＝代付；點選一列即可帶入"
                : "點選一列即可帶入"}
            </p>
          </div>
          <button type="button" className="btn btn-ghost px-2" onClick={onClose} aria-label="關閉">
            <X className="size-5" />
          </button>
        </div>
        <div className="border-b border-border px-4 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
            <input
              className="field-input pl-9"
              placeholder={
                mode === "txid" ? "搜尋代號、名稱、SD／SC、代收／代付…" : "搜尋銀行代號或名稱…"
              }
              value={q}
              onChange={(e) => setQ(e.target.value)}
              autoFocus
            />
          </div>
        </div>
        <div className="overflow-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th className="w-28">代號</th>
                {mode === "txid" ? (
                  <>
                    <th className="w-28">類別</th>
                    <th>名稱</th>
                  </>
                ) : (
                  <>
                    <th>名稱</th>
                    <th className="w-28">總行</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.map((it) => {
                if (mode === "txid") {
                  const t = it as Txid;
                  return (
                    <tr
                      key={t.code}
                      className="cursor-pointer hover:bg-primary-soft/50"
                      onClick={() => {
                        onSelect(t.code);
                        onClose();
                      }}
                    >
                      <td className="font-mono font-semibold">{t.code}</td>
                      <td>{formatTxTypeLabel(t.type)}</td>
                      <td>{t.name}</td>
                    </tr>
                  );
                }
                const b = it as Branch;
                return (
                  <tr
                    key={b.code}
                    className="cursor-pointer hover:bg-primary-soft/50"
                    onClick={() => {
                      onSelect(b.code);
                      onClose();
                    }}
                  >
                    <td className="font-mono font-semibold">{b.code}</td>
                    <td>{b.name}</td>
                    <td className="font-mono">{b.head}</td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-8 text-center text-muted">
                    無符合項目
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
