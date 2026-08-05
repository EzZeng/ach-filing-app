import { Search } from "lucide-react";
import type {
  Branch,
  FormatSchema,
  FormFieldDef,
  RecordFieldDef,
} from "@/lib/ach/schema";
import { resolveSorg } from "@/lib/ach/engine";

/** 控制首錄／尾錄會用到的 form.header key（如 date、ydate） */
export function controlFormKeys(schema: FormatSchema): Set<string> {
  const keys = new Set<string>();
  for (const f of [
    ...schema.records.header.fields,
    ...schema.records.trailer.fields,
  ]) {
    if (f.source === "header" && f.key) keys.add(f.key);
  }
  return keys;
}

/** 提出／發動者資料：不屬於控制首錄／尾錄的表頭欄位 */
export function proposerFormFields(schema: FormatSchema): FormFieldDef[] {
  const used = controlFormKeys(schema);
  return schema.form.header.filter((f) => !used.has(f.key));
}

export function formFieldByKey(
  schema: FormatSchema,
  key: string | undefined,
): FormFieldDef | undefined {
  if (!key) return undefined;
  return schema.form.header.find((f) => f.key === key);
}

export function controlHeaderDisplayValue(
  field: RecordFieldDef,
  schema: FormatSchema,
  header: Record<string, string>,
  branches: Branch[],
): string {
  switch (field.id) {
    case "BOF":
      return field.value ?? "BOF";
    case "CDATA":
      return schema.code;
    case "TDATE":
      return header.date ?? "";
    case "TTIME":
      return "（產生時 HHMMSS）";
    case "SORG":
      return resolveSorg(header.bankCode ?? "", branches) || "—";
    case "RORG":
      return field.value ?? "9990250";
    case "VERNO":
      return schema.version;
    default:
      if (field.source === "literal") return field.value ?? "";
      if (field.source === "header" && field.key) {
        return header[field.key] ?? "";
      }
      if (field.source === "formatCode") return schema.code;
      if (field.source === "version") return schema.version;
      if (field.fn === "sorg") {
        return resolveSorg(header.bankCode ?? "", branches) || "—";
      }
      if (field.fn === "nowHms") return "（產生時 HHMMSS）";
      return "—";
  }
}

export function controlTrailerDisplayValue(
  field: RecordFieldDef,
  schema: FormatSchema,
  header: Record<string, string>,
  branches: Branch[],
  totalCount: number,
  totalAmount: number,
): string {
  switch (field.id) {
    case "EOF":
      return field.value ?? "EOF";
    case "CDATA":
      return schema.code;
    case "TDATE":
      return header.date ?? "";
    case "SORG":
      return resolveSorg(header.bankCode ?? "", branches) || "—";
    case "RORG":
      return field.value ?? "9990250";
    case "TCOUNT":
      return String(totalCount);
    case "TAMT":
      return String(Math.floor(totalAmount));
    case "YDATE":
      if (field.source === "filler") return "（空白）";
      return header.ydate?.trim() || "（空白）";
    default:
      if (field.source === "literal") return field.value ?? "";
      if (field.source === "header" && field.key) {
        return header[field.key] ?? "";
      }
      if (field.source === "formatCode") return schema.code;
      if (field.fn === "sorg") {
        return resolveSorg(header.bankCode ?? "", branches) || "—";
      }
      if (field.fn === "totalCount") return String(totalCount);
      if (field.fn === "totalAmount") return String(Math.floor(totalAmount));
      if (field.source === "filler") return "（空白）";
      return "—";
  }
}

type EditHandlers = {
  header: Record<string, string>;
  errors?: Record<string, string | null | undefined>;
  onChange: (key: string, value: string) => void;
  onBlur: (field: FormFieldDef) => void;
  fieldMeta?: (field: FormFieldDef) => string;
  selectOptions?: (field: FormFieldDef) => { value: string; label: string }[];
  onPick?: (mode: "txid" | "branch", key: string) => void;
};

function EditableFormValue({
  formField,
  value,
  error,
  meta,
  selectOptions,
  onChange,
  onBlur,
  onPick,
  idPrefix,
}: {
  formField: FormFieldDef;
  value: string;
  error?: string | null;
  meta?: string;
  selectOptions?: { value: string; label: string }[];
  onChange: (value: string) => void;
  onBlur: () => void;
  onPick?: (mode: "txid" | "branch") => void;
  idPrefix: string;
}) {
  const inputId = `${idPrefix}-${formField.key}`;
  if (formField.inputType === "select") {
    return (
      <>
        <select
          id={inputId}
          className={`field-input ${error ? "err" : "warn"}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          {(selectOptions ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <div className={error ? "field-hint" : "field-meta"}>
          {error || meta || "\u00a0"}
        </div>
      </>
    );
  }
  return (
    <>
      <div className="flex gap-1">
        <input
          id={inputId}
          className={`field-input ${formField.ui?.mono ? "font-mono" : ""} ${error ? "err" : "warn"}`}
          value={value}
          maxLength={formField.length || undefined}
          placeholder={formField.placeholder}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
        />
        {formField.picker && onPick ? (
          <button
            type="button"
            className="btn btn-secondary px-2"
            onClick={() => onPick(formField.picker!)}
            aria-label={`搜尋${formField.label}`}
          >
            <Search className="size-4" />
          </button>
        ) : null}
      </div>
      <div className={error ? "field-hint" : "field-meta"}>
        {error || meta || "\u00a0"}
      </div>
    </>
  );
}

function ReadonlyValue({ value, hint }: { value: string; hint?: string }) {
  return (
    <>
      <div className="field-input font-mono bg-surface-2">{value || "—"}</div>
      {hint ? <div className="field-meta">{hint}</div> : null}
    </>
  );
}

/** 控制首錄：欄位名稱＋值（可編輯來源欄；不含長度／起迄） */
export function ControlHeaderFields({
  schema,
  header,
  branches,
  edit,
}: {
  schema: FormatSchema;
  header: Record<string, string>;
  branches: Branch[];
  edit?: EditHandlers;
}) {
  const fields = schema.records.header.fields.filter((f) => f.id !== "FILLER");
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {fields.map((f) => {
        const formField =
          f.source === "header" ? formFieldByKey(schema, f.key) : undefined;
        const label = f.label || f.id;
        const canEdit = Boolean(edit && formField);

        return (
          <div key={f.id}>
            <label
              className="field-label"
              htmlFor={
                canEdit && formField
                  ? `${schema.code}-ctrl-h-${formField.key}`
                  : undefined
              }
            >
              {label}
            </label>
            {canEdit && formField && edit ? (
              <EditableFormValue
                formField={formField}
                value={header[formField.key] ?? ""}
                error={edit.errors?.[formField.key]}
                meta={edit.fieldMeta?.(formField)}
                selectOptions={edit.selectOptions?.(formField)}
                onChange={(v) => edit.onChange(formField.key, v)}
                onBlur={() => edit.onBlur(formField)}
                onPick={
                  formField.picker && edit.onPick
                    ? (mode) => edit.onPick!(mode, formField.key)
                    : undefined
                }
                idPrefix={`${schema.code}-ctrl-h`}
              />
            ) : (
              <ReadonlyValue
                value={controlHeaderDisplayValue(f, schema, header, branches)}
                hint={
                  f.fn === "sorg" || f.id === "SORG"
                    ? "由銀行代號推算代表行"
                    : f.fn === "nowHms" || f.id === "TTIME"
                      ? "產生檔時自動填入"
                      : undefined
                }
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/** 控制尾錄：欄位名稱＋值（YDATE 等可編輯；總筆數／金額自動） */
export function ControlTrailerFields({
  schema,
  header,
  branches,
  totalCount,
  totalAmount,
  edit,
}: {
  schema: FormatSchema;
  header: Record<string, string>;
  branches: Branch[];
  totalCount: number;
  totalAmount: number;
  edit?: EditHandlers;
}) {
  const fields = schema.records.trailer.fields.filter((f) => f.id !== "FILLER");
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {fields.map((f) => {
        const formField =
          f.source === "header" ? formFieldByKey(schema, f.key) : undefined;
        const label = f.label || f.id;
        const canEdit = Boolean(edit && formField);

        return (
          <div key={f.id}>
            <label
              className="field-label"
              htmlFor={
                canEdit && formField
                  ? `${schema.code}-ctrl-t-${formField.key}`
                  : undefined
              }
            >
              {label}
            </label>
            {canEdit && formField && edit ? (
              <EditableFormValue
                formField={formField}
                value={header[formField.key] ?? ""}
                error={edit.errors?.[formField.key]}
                meta={edit.fieldMeta?.(formField)}
                selectOptions={edit.selectOptions?.(formField)}
                onChange={(v) => edit.onChange(formField.key, v)}
                onBlur={() => edit.onBlur(formField)}
                onPick={
                  formField.picker && edit.onPick
                    ? (mode) => edit.onPick!(mode, formField.key)
                    : undefined
                }
                idPrefix={`${schema.code}-ctrl-t`}
              />
            ) : (
              <ReadonlyValue
                value={controlTrailerDisplayValue(
                  f,
                  schema,
                  header,
                  branches,
                  totalCount,
                  totalAmount,
                )}
                hint={
                  f.fn === "totalCount" || f.id === "TCOUNT"
                    ? "依明細自動計算"
                    : f.fn === "totalAmount" || f.id === "TAMT"
                      ? "依明細自動計算"
                      : f.id === "YDATE" && f.source === "filler"
                        ? "提出檔空白"
                        : f.fn === "sorg" || f.id === "SORG"
                          ? "由銀行代號推算代表行"
                          : undefined
                }
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
