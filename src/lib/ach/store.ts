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
      const [tRes, bRes, iRes] = await Promise.all([
        fetch("/data/txid.json"),
        fetch("/data/branch.json"),
        fetch("/data/formats/index.json"),
      ]);
      if (!tRes.ok || !bRes.ok || !iRes.ok) throw new Error("無法載入代碼／格式定義");
      const txids = (await tRes.json()) as Txid[];
      const branches = (await bRes.json()) as Branch[];
      const formatIndex = (await iRes.json()) as FormatIndex;

      const formats: Record<string, FormatSchema> = {};
      await Promise.all(
        formatIndex.formats.map(async (entry) => {
          const res = await fetch(`/data/formats/${entry.schemaFile}`);
          if (!res.ok) throw new Error(`無法載入格式 ${entry.code}`);
          formats[entry.code] = (await res.json()) as FormatSchema;
        }),
      );

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
      getForm: (code) => get().forms[code],
      setHeader: (code, schema, key, value) => {
        const field = schema.form.header.find((f) => f.key === key);
        const nextVal = field ? sanitizeFieldInput(field, value) : value;
        set((s) => {
          const bundle = s.forms[code] ?? initBundle(schema);
          return {
            forms: {
              ...s.forms,
              [code]: {
                ...bundle,
                header: { ...bundle.header, [key]: nextVal },
              },
            },
          };
        });
      },
      blurHeader: (code, schema, key) => {
        const field = schema.form.header.find((f) => f.key === key);
        if (!field) return;
        set((s) => {
          const bundle = s.forms[code];
          if (!bundle) return s;
          const cur = bundle.header[key] ?? "";
          const next = applyFieldBlur(field, cur);
          if (next === cur) return s;
          return {
            forms: {
              ...s.forms,
              [code]: {
                ...bundle,
                header: { ...bundle.header, [key]: next },
              },
            },
          };
        });
      },
      updateRow: (code, schema, id, key, value) => {
        const field = schema.form.detail.find((f) => f.key === key);
        const nextVal = field ? sanitizeFieldInput(field, value) : value;
        set((s) => {
          const bundle = s.forms[code] ?? initBundle(schema);
          return {
            forms: {
              ...s.forms,
              [code]: {
                ...bundle,
                rows: bundle.rows.map((r) =>
                  r.id === id ? { ...r, [key]: nextVal } : r,
                ),
              },
            },
          };
        });
      },
      blurRow: (code, schema, id, key) => {
        const field = schema.form.detail.find((f) => f.key === key);
        if (!field) return;
        set((s) => {
          const bundle = s.forms[code];
          if (!bundle) return s;
          return {
            forms: {
              ...s.forms,
              [code]: {
                ...bundle,
                rows: bundle.rows.map((r) => {
                  if (r.id !== id) return r;
                  const cur = r[key] ?? "";
                  const next = applyFieldBlur(field, cur);
                  return next === cur ? r : { ...r, [key]: next };
                }),
              },
            },
          };
        });
      },
      addRows: (code, schema, n = 10) => {
        set((s) => {
          const bundle = s.forms[code] ?? initBundle(schema);
          return {
            forms: {
              ...s.forms,
              [code]: {
                ...bundle,
                rows: [...bundle.rows, ...makeRows(schema, n)],
              },
            },
          };
        });
      },
      removeRow: (code, id) => {
        set((s) => {
          const bundle = s.forms[code];
          if (!bundle || bundle.rows.length <= 1) return s;
          return {
            forms: {
              ...s.forms,
              [code]: {
                ...bundle,
                rows: bundle.rows.filter((r) => r.id !== id),
              },
            },
          };
        });
      },
      clearRows: (code, schema) => {
        set((s) => {
          const bundle = s.forms[code] ?? initBundle(schema);
          return {
            forms: {
              ...s.forms,
              [code]: { ...bundle, rows: makeRows(schema, 15) },
            },
          };
        });
      },
      pasteRows: (code, schema, startIndex, text) => {
        const keys = schema.form.detail.map((f) => f.key);
        const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
        const parsed = lines
          .map((line) => line.split("\t"))
          .filter((cols) => cols.some((c) => c.trim() !== ""));
        if (!parsed.length) return;

        set((s) => {
          const bundle = s.forms[code] ?? initBundle(schema);
          const rows = [...bundle.rows];
          while (rows.length < startIndex + parsed.length) {
            rows.push(...makeRows(schema, 10));
          }
          parsed.forEach((cols, i) => {
            const idx = startIndex + i;
            const cur = { ...rows[idx]! };
            keys.forEach((key, colIdx) => {
              if (cols[colIdx] === undefined) return;
              const field = schema.form.detail.find((f) => f.key === key);
              let val = cols[colIdx]!.trim();
              if (field) {
                val = sanitizeFieldInput(field, val);
                if (field.pad?.onBlur) val = applyFieldBlur(field, val);
              }
              cur[key] = val;
            });
            rows[idx] = cur;
          });
          return {
            forms: {
              ...s.forms,
              [code]: { ...bundle, rows },
            },
          };
        });
      },
    }),
    {
      name: "ach-filing-form-v2",
      partialize: (s) => ({
        activeCode: s.activeCode,
        forms: s.forms,
      }),
    },
  ),
);
