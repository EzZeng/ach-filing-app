import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Building2,
  Braces,
  FileStack,
  HelpCircle,
  Landmark,
  Loader2,
  Shield,
} from "lucide-react";
import { Toaster } from "sonner";
import "@/styles.css";
import { useFormStore, useRefStore } from "@/lib/ach/store";
import { FormatPanel } from "@/components/ach/FormatPanel";
import { SchemaPanel } from "@/components/ach/SchemaPanel";
import { RefsPanel } from "@/components/ach/RefsPanel";
import { HelpPanel } from "@/components/ach/HelpPanel";

const ICONS: Record<string, typeof FileStack> = {
  "file-stack": FileStack,
  shield: Shield,
};

function App() {
  const { loadRefs, loaded, loading, loadError, txids, branches, formatList, formats } =
    useRefStore();
  const { activeCode, setActiveCode, ensureForm } = useFormStore();
  const list = formatList();
  const [tab, setTab] = useState("");

  useEffect(() => {
    void loadRefs();
  }, [loadRefs]);

  useEffect(() => {
    if (!loaded || !list.length) return;
    const initial = list.find((f) => f.code === activeCode)?.code ?? list[0]!.code;
    setTab((t) =>
      t && (t === "refs" || t === "schema" || t === "help" || formats[t]) ? t : initial,
    );
    const schema = formats[initial];
    if (schema) ensureForm(schema);
  }, [loaded, list, activeCode, formats, ensureForm]);

  const formatTabs = useMemo(
    () =>
      list.map((f) => ({
        id: f.code,
        label: `${f.shortCode} ${f.name}`,
        icon: ICONS[f.icon || ""] || FileStack,
      })),
    [list],
  );

  function selectTab(id: string) {
    setTab(id);
    if (formats[id]) setActiveCode(id);
  }

  const activeSchema = formats[tab];

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15">
                <Landmark className="size-6 text-amber-300" />
              </div>
              <div>
                <h1 className="text-lg font-bold tracking-tight sm:text-xl">
                  代收建檔小程式
                </h1>
                <p className="text-xs text-white/70 sm:text-sm">
                  ACH 檔案代號參數化 · JSON 格式 · Desktop
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {loading && (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1">
                  <Loader2 className="size-3.5 animate-spin" />
                  載入中…
                </span>
              )}
              {loaded && (
                <span className="rounded-full bg-emerald-400/15 px-2.5 py-1 text-emerald-100 ring-1 ring-emerald-300/30">
                  格式 {list.length} · 交易 {txids.length} · 銀行 {branches.length}
                </span>
              )}
              {loadError && (
                <span className="rounded-full bg-red-400/20 px-2.5 py-1 text-red-100">
                  {loadError}
                </span>
              )}
            </div>
          </div>

          <nav className="flex gap-1 overflow-x-auto" aria-label="主要分頁">
            {[
              ...formatTabs,
              { id: "schema", label: "格式參數", icon: Braces },
              { id: "refs", label: "代碼查詢", icon: Building2 },
              { id: "help", label: "說明", icon: HelpCircle },
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                className={`tab-btn inline-flex shrink-0 items-center gap-1.5 ${tab === id ? "active" : ""}`}
                onClick={() => selectTab(id)}
              >
                <Icon className="size-4 opacity-80" />
                {label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 sm:px-6 sm:py-6">
        {!loaded && loading ? (
          <div className="card flex min-h-64 flex-col items-center justify-center gap-3 p-8 text-muted">
            <Loader2 className="size-8 animate-spin text-primary" />
            <p>正在載入格式定義與代碼…</p>
          </div>
        ) : loadError && !loaded ? (
          <div className="card p-8 text-center">
            <p className="mb-3 font-semibold text-danger">載入失敗：{loadError}</p>
            <button type="button" className="btn btn-primary" onClick={() => void loadRefs()}>
              重試
            </button>
          </div>
        ) : (
          <>
            {activeSchema && <FormatPanel schema={activeSchema} />}
            {tab === "schema" && <SchemaPanel />}
            {tab === "refs" && <RefsPanel />}
            {tab === "help" && <HelpPanel />}
          </>
        )}
      </main>

      <footer className="border-t border-border bg-surface/80 px-4 py-3 text-center text-xs text-muted">
        格式由 JSON 參數驅動 · 桌面版
      </footer>
      <Toaster position="top-center" richColors closeButton />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
