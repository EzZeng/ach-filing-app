import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  Branch,
  DetailRow,
  FormatIndex,
  FormatIndexEntry,
  FormatSchema,
  HeaderValues,
  Txid,
} from "./schema";
import { applyFieldBlur, emptyDetailRow, emptyHeader, sanitizeFieldInput } from "./engine";
import { newRowId, todayRoc } from "./utils";
import {
  EMBEDDED_BRANCHES,
  EMBEDDED_FORMAT_INDEX,
  EMBEDDED_TXIDS,
  loadEmbeddedFormats,
} from "@/data/embedded";

type RefState = {
  txids: Txid[];
  branches: Branch[];
  formatIndex: FormatIndex | null;
  formats: Record<string, FormatSchema>;
  loaded: boolean;
  loadError: string | null;
  loading: boolean;
  loadRefs: () => Promise<void>;
  refreshRefs: () => Promise<void>;
  getFormat: (code: string) => FormatSchema | undefined;
  formatList: () => FormatIndexEntry[];
};

type FormBundle = {
  header: HeaderValues;
  rows: DetailRow[];
};

type FormState = {
  activeCode: string;
  forms: Record<string, FormBundle>;
  setActiveCode: (code: string) => void;
  ensureForm: (schema: FormatSchema) => void;
  setHeader: (code: string, schema: FormatSchema, key: string, value: string) => void;
  blurHeader: (code: string, schema: FormatSchema, key: string) => void;
  updateRow: (
    code: string,
    schema: FormatSchema,
    id: string,
    key: string,
    value: string,
  ) => void;
  blurRow: (code: string, schema: FormatSchema, id: string, key: string) => void;
  addRows: (code: string, schema: FormatSchema, n?: number) => void;
  removeRow: (code: string, id: string) => void;
  clearRows: (code: string, schema: FormatSchema) => void;
  pasteRows: (code: string, schema: FormatSchema, startIndex: number, text: string) => void;
  /** 以匯入結果覆寫指定格式的表頭與明細（至少保留 15 列空白緩衝） */
  loadFromImport: (
    schema: FormatSchema,
    data: { header: HeaderValues; rows: DetailRow[] },
  ) => void;
  getForm: (code: string) => FormBundle | undefined;
};

function makeRows(schema: FormatSchema, n: number): DetailRow[] {
  return Array.from({ length: n }, () => emptyDetailRow(schema, newRowId()));
}

function initBundle(schema: FormatSchema): FormBundle {
  const header = emptyHeader(schema);
  header.date = todayRoc();
  return { header, rows: makeRows(schema, 15) };
}

export const useRefStore = create<RefState>((set, get) => ({
  txids: [],
  branches: [],
  formatIndex: null,
  formats: {},
  loaded: false,
  loadError: null,
  loading: false,
  loadRefs: async () => {
    if (get().loaded || get().loading) return;
    set({ loading: true, loadError: null });
    try {
      // 客戶版：資料已打包進 JS，不依賴外部 JSON / 網路
      const txids = EMBEDDED_TXIDS;
      const branches = EMBEDDED_BRANCHES;
      const formatIndex = EMBEDDED_FORMAT_INDEX;
      const formats = loadEmbeddedFormats();

      if (!formatIndex.formats.length || !Object.keys(formats).length) {
        throw new Error("內嵌格式定義為空");
      }

      // 檢查 index 內每個代號都有 schema
      for (const entry of formatIndex.formats) {
        if (!formats[entry.code]) {
          throw new Error(`缺少內嵌格式：${entry.code}（請在 src/data/embedded.ts 登記）`);
        }
      }

      set({ txids, branches, formatIndex, formats, loaded: true, loading: false });
    } catch (e) {
      set({
        loading: false,
        loadError: e instanceof Error ? e.message : "載入失敗",
      });
    }
  },
  refreshRefs: async () => {
    set({ loaded: false, loading: false });
    await get().loadRefs();
  },
  getFormat: (code) => get().formats[code],
  formatList: () => get().formatIndex?.formats ?? [],
}));

export const useFormStore = create<FormState>()(
  persist(
    (set, get) => ({
      activeCode: "ACHP01",
      forms: {},
      setActiveCode: (code) => set({ activeCode: code }),
      ensureForm: (schema) => {
        const existing = get().forms[schema.code];
        if (existing) return;
        set((s) => ({
          forms: { ...s.forms, [schema.code]: initBundle(schema) },
        }));
      },
      setHeader: (code, schema, key, value) => {
        get().ensureForm(schema);
        const field = schema.form.header.find((f) => f.key === key);
        const next = field ? sanitizeFieldInput(field, value) : value;
        set((s) => {
          const form = s.forms[code] ?? initBundle(schema);
          return {
            forms: {
              ...s.forms,
              [code]: {
                ...form,
                header: { ...form.header, [key]: next },
              },
            },
          };
        });
      },
      blurHeader: (code, schema, key) => {
        const form = get().forms[code];
        if (!form) return;
        const field = schema.form.header.find((f) => f.key === key);
        if (!field) return;
        const next = applyFieldBlur(field, form.header[key] ?? "");
        if (next === (form.header[key] ?? "")) return;
        set((s) => {
          const f = s.forms[code]!;
          return {
            forms: {
              ...s.forms,
              [code]: { ...f, header: { ...f.header, [key]: next } },
            },
          };
        });
      },
      updateRow: (code, schema, id, key, value) => {
        get().ensureForm(schema);
        const field = schema.form.detail.find((f) => f.key === key);
        const next = field ? sanitizeFieldInput(field, value) : value;
        set((s) => {
          const form = s.forms[code] ?? initBundle(schema);
          return {
            forms: {
              ...s.forms,
              [code]: {
                ...form,
                rows: form.rows.map((r) =>
                  r.id === id ? { ...r, [key]: next } : r,
                ),
              },
            },
          };
        });
      },
      blurRow: (code, schema, id, key) => {
        const form = get().forms[code];
        if (!form) return;
        const field = schema.form.detail.find((f) => f.key === key);
        if (!field) return;
        const row = form.rows.find((r) => r.id === id);
        if (!row) return;
        const next = applyFieldBlur(field, row[key] ?? "");
        if (next === (row[key] ?? "")) return;
        set((s) => {
          const f = s.forms[code]!;
          return {
            forms: {
              ...s.forms,
              [code]: {
                ...f,
                rows: f.rows.map((r) =>
                  r.id === id ? { ...r, [key]: next } : r,
                ),
              },
            },
          };
        });
      },
      addRows: (code, schema, n = 10) => {
        get().ensureForm(schema);
        set((s) => {
          const form = s.forms[code] ?? initBundle(schema);
          return {
            forms: {
              ...s.forms,
              [code]: {
                ...form,
                rows: [...form.rows, ...makeRows(schema, n)],
              },
            },
          };
        });
      },
      removeRow: (code, id) => {
        set((s) => {
          const form = s.forms[code];
          if (!form) return s;
          return {
            forms: {
              ...s.forms,
              [code]: {
                ...form,
                rows: form.rows.filter((r) => r.id !== id),
              },
            },
          };
        });
      },
      clearRows: (code, schema) => {
        get().ensureForm(schema);
        set((s) => {
          const form = s.forms[code] ?? initBundle(schema);
          return {
            forms: {
              ...s.forms,
              [code]: { ...form, rows: makeRows(schema, 15) },
            },
          };
        });
      },
      pasteRows: (code, schema, startIndex, text) => {
        get().ensureForm(schema);
        const lines = text
          .replace(/\r\n/g, "\n")
          .replace(/\r/g, "\n")
          .split("\n")
          .filter((l) => l.trim().length > 0);
        if (!lines.length) return;
        const keys = schema.form.detail.map((f) => f.key);
        set((s) => {
          const form = s.forms[code] ?? initBundle(schema);
          let rows = [...form.rows];
          let idx = startIndex;
          for (const line of lines) {
            const cols = line.split("\t");
            while (idx >= rows.length) {
              rows.push(emptyDetailRow(schema, newRowId()));
            }
            const row = { ...rows[idx]! };
            keys.forEach((k, i) => {
              if (cols[i] !== undefined) {
                const field = schema.form.detail.find((f) => f.key === k);
                row[k] = field
                  ? sanitizeFieldInput(field, cols[i]!)
                  : cols[i]!;
              }
            });
            rows[idx] = row;
            idx += 1;
          }
          return {
            forms: { ...s.forms, [code]: { ...form, rows } },
          };
        });
      },
      loadFromImport: (schema, data) => {
        const header = emptyHeader(schema);
        for (const f of schema.form.header) {
          const raw = data.header[f.key] ?? header[f.key] ?? "";
          header[f.key] = sanitizeFieldInput(f, raw);
        }
        if (!header.date) header.date = todayRoc();

        const imported = data.rows.map((src) => {
          const row = emptyDetailRow(schema, newRowId());
          for (const f of schema.form.detail) {
            row[f.key] = sanitizeFieldInput(f, src[f.key] ?? "");
          }
          return row;
        });
        const pad = Math.max(0, 15 - imported.length);
        const rows = [...imported, ...makeRows(schema, pad)];

        set((s) => ({
          activeCode: schema.code,
          forms: {
            ...s.forms,
            [schema.code]: { header, rows },
          },
        }));
      },
      getForm: (code) => get().forms[code],
    }),
    {
      name: "ach-filing-forms-v1",
      partialize: (s) => ({ activeCode: s.activeCode, forms: s.forms }),
    },
  ),
);
