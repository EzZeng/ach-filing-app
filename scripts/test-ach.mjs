import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = "/workspace/public/data/formats";
const dataRoot = "/workspace/public/data";
const index = JSON.parse(fs.readFileSync(path.join(root, "index.json"), "utf8"));

for (const entry of index.formats) {
  const schema = JSON.parse(
    fs.readFileSync(path.join(root, entry.schemaFile), "utf8"),
  );
  assert.equal(schema.code, entry.code);
  for (const section of ["header", "detail", "trailer"]) {
    const len = schema.records[section].fields.reduce((s, f) => s + f.length, 0);
    assert.equal(
      len,
      schema.recordLength,
      `${schema.code} ${section} length ${len} != ${schema.recordLength}`,
    );
  }
  // form detail fields must have charset + length
  for (const f of schema.form.detail) {
    assert.ok(f.key && f.length > 0, `${schema.code} detail field`);
    assert.ok(["digit", "alnum", "any"].includes(f.charset), `charset ${f.key}`);
  }
  console.log(`OK ${schema.code} recordLength=${schema.recordLength} form.detail=${schema.form.detail.length}`);
}

// ACHP01：控制首錄／尾錄對照財金建檔小程式；TXTYPE＝SD 代收／SC 代付
const achp01 = JSON.parse(fs.readFileSync(path.join(root, "ACHP01.json"), "utf8"));
const hdr = achp01.records.header.fields.map((f) => f.id);
const trl = achp01.records.trailer.fields.map((f) => f.id);
assert.deepEqual(
  hdr.slice(0, 7),
  ["BOF", "CDATA", "TDATE", "TTIME", "SORG", "RORG", "VERNO"],
  "ACHP01 header field order",
);
assert.deepEqual(
  trl.slice(0, 8),
  ["EOF", "CDATA", "TDATE", "SORG", "RORG", "TCOUNT", "TAMT", "YDATE"],
  "ACHP01 trailer field order",
);
const txTypeField = achp01.records.detail.fields.find((f) => f.id === "TXTYPE");
assert.equal(txTypeField?.fn, "txType");
assert.equal(txTypeField?.length, 2);

const txids = JSON.parse(fs.readFileSync(path.join(dataRoot, "txid.json"), "utf8"));
const byType = txids.reduce((acc, t) => {
  (acc[t.type] ??= []).push(t);
  return acc;
}, {});
assert.ok((byType.SD?.length ?? 0) >= 100, `SD txids expected, got ${byType.SD?.length}`);
assert.ok((byType.SC?.length ?? 0) >= 100, `SC txids expected, got ${byType.SC?.length}`);
assert.equal(txids.find((t) => t.code === "704")?.type, "SD", "704 應為代收 SD");
assert.equal(txids.find((t) => t.code === "101")?.type, "SC", "101 應為代付 SC");

const userNo = achp01.form.detail.find((f) => f.key === "userNo");
const userRules = userNo?.validation?.rules ?? [];
assert.ok(
  userRules.some((r) => r.type === "requiredIfTxType" && r.txTypes?.includes("SD")),
  "userNo 應僅在 SD 代收時必填",
);
const txidRules =
  achp01.form.header.find((f) => f.key === "txid")?.validation?.rules ?? [];
assert.ok(
  !txidRules.some((r) => r.minValue != null),
  "ACHP01 不應再限制交易代號 ≥500（需支援 SC 代付）",
);

console.log(
  `OK ACHP01 SD/SC: SD=${byType.SD.length} SC=${byType.SC.length}; header/trailer field order matched`,
);
console.log("ACH JSON schema smoke tests passed");
