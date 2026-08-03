/** JSON 參數化的 ACH 檔案格式定義 */

export type Charset = "digit" | "alnum" | "any";

export type PadSpec = {
  side: "left" | "right" | "none";
  char?: string;
  onBlur?: boolean;
};

export type ValidationRule =
  | { type: "required"; message?: string }
  | { type: "requiredIfAny"; message?: string }
  | { type: "exactLength"; length: number; message?: string }
  | { type: "maxLength"; length: number; message?: string }
  | { type: "oneOfLengths"; lengths: number[]; message?: string }
  | { type: "rocDate"; notPast?: boolean; message?: string }
  | { type: "txid"; minValue?: number; message?: string }
  | { type: "branchCode"; message?: string }
  | { type: "number"; message?: string }
  | { type: "maxIntegerDigits"; length: number; message?: string };

export type FormFieldDef = {
  key: string;
  label: string;
  placeholder?: string;
  inputType: "text" | "rocDate" | "amount" | "select";
  length: number;
  charset: Charset;
  required?: boolean;
  pad?: PadSpec;
  validation?: { rules: ValidationRule[] };
  picker?: "txid" | "branch" | null;
  metaFrom?: "txid" | "branch" | null;
  optionsFrom?: "authOptions";
  export?: {
    charset?: Charset;
    length?: number;
    pad?: PadSpec;
    transform?: "floorInt" | "firstChar";
  };
  ui?: {
    mono?: boolean;
    colSpan?: number;
    minWidth?: string;
    align?: "left" | "right";
  };
};

export type RecordFieldSource =
  | "literal"
  | "formatCode"
  | "version"
  | "header"
  | "detail"
  | "runtime"
  | "derived"
  | "filler";

export type RecordFieldDef = {
  id: string;
  source: RecordFieldSource;
  /** literal 值 */
  value?: string;
  /** header / detail 欄位 key */
  key?: string;
  /** runtime / derived 函式名 */
  fn?: "nowHms" | "sorg" | "txType" | "seq" | "totalCount" | "totalAmount";
  length: number;
  charset?: Charset;
  pad?: PadSpec;
  fill?: string;
  transform?: "floorInt" | "firstChar";
};

export type AuthOptionDef = {
  value: string;
  label: string;
  note: string;
  desc: string;
};

export type FormatSchema = {
  code: string;
  shortCode: string;
  name: string;
  description?: string;
  version: string;
  recordLength: number;
  lineEnding: string;
  filenamePattern: string;
  features: {
    sumAmount: boolean;
    amountKey: string | null;
    authOptions: boolean;
  };
  authOptions?: AuthOptionDef[];
  form: {
    header: FormFieldDef[];
    detail: FormFieldDef[];
  };
  records: {
    header: { fields: RecordFieldDef[] };
    detail: { fields: RecordFieldDef[] };
    trailer: { fields: RecordFieldDef[] };
  };
};

export type FormatIndexEntry = {
  code: string;
  shortCode: string;
  name: string;
  description?: string;
  schemaFile: string;
  icon?: string;
};

export type FormatIndex = {
  version: number;
  description?: string;
  defaultCode: string;
  formats: FormatIndexEntry[];
};

export type Branch = {
  code: string;
  name: string;
  head: string;
};

export type Txid = {
  code: string;
  type: string;
  name: string;
  flag: string;
};

export type HeaderValues = Record<string, string>;
export type DetailRow = { id: string } & Record<string, string>;
