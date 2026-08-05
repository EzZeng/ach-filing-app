/**
 * 大檔匯入上限＋預先篩選
 * 執行：npx vite-node --config vite.static.config.ts scripts/test-import-limits.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { IMPORT_LIMITS, parseAchFile, parseAchText } from "../src/lib/ach/import";
import type { FormatSchema } from "../src/lib/ach/schema";

const schema = JSON.parse(
  fs.readFileSync("/workspace/public/data/formats/ACHP01.json", "utf8"),
) as FormatSchema;

function pad(s: string, len: number, ch = " ") {
  return s.length >= len ? s.slice(0, len) : s + ch.repeat(len - s.length);
}
function lpad(s: string, len: number, ch = "0") {
  return s.length >= len ? s.slice(-len) : ch.repeat(len - s.length) + s;
}

const hdr =
  "BOF" +
  pad("ACHP01", 6) +
  "01150804" +
  "120000" +
  "0040000" +
  "9990250" +
  pad("V10", 3) +
  " ".repeat(210);

function detail(seq: number, bank = "0040000") {
  return (
    "N" +
    "SD" +
    pad("704", 3) +
    lpad(String(seq), 8) +
    "0040000" +
    "0000001234567890" +
    bank +
    "0000001234567890" +
    lpad("100", 10) +
    "  " +
    "B" +
    pad("12345678", 10) +
    pad("A123456789", 10) +
    " ".repeat(6) +
    " ".repeat(8) +
    " ".repeat(8) +
    " " +
    pad("U1", 20) +
    " ".repeat(40) +
    " ".repeat(10) +
    "00000" +
    " ".repeat(20) +
    " ".repeat(39)
  );
}

function trailer(n: number) {
  return (
    "EOF" +
    pad("ACHP01", 6) +
    "01150804" +
    "0040000" +
    "9990250" +
    lpad(String(n), 8) +
    lpad(String(n * 100), 16) +
    " ".repeat(8) +
    " ".repeat(187)
  );
}

assert.equal(hdr.length, 250);
assert.equal(detail(1).length, 250);

// 小檔
{
  const text = [hdr, detail(1), detail(2), trailer(2)].join("\r\n") + "\r\n";
  const r = parseAchText(text, schema, { filename: "small.txt" });
  assert.equal(r.detailCount, 2);
  assert.equal(r.matchedCount, 2);
  assert.equal(r.rows.length, 2);
  assert.equal(r.tooLargeForForm, false);
  assert.equal(r.filterActive, false);
  console.log("OK small file applyable");
}

// 超過表單上限
{
  const n = IMPORT_LIMITS.maxFormDetailRows + 5;
  const parts: string[] = [hdr];
  for (let i = 1; i <= n; i++) parts.push(detail(i));
  parts.push(trailer(n));
  const r = parseAchText(parts.join("\r\n") + "\r\n", schema, {
    filename: "large.txt",
  });
  assert.equal(r.detailCount, n);
  assert.equal(r.matchedCount, n);
  assert.equal(r.tooLargeForForm, true);
  assert.equal(r.rows.length, 0);
  assert.equal(r.previewRows.length, IMPORT_LIMITS.maxPreviewDetailRows);
  console.log(`OK oversized text (${n} details) not materialized`);
}

// 預先篩選：大檔中只取特定銀行
{
  const n = IMPORT_LIMITS.maxFormDetailRows + 20;
  const parts: string[] = [hdr];
  for (let i = 1; i <= n; i++) {
    // 每 100 筆一筆 0040037
    parts.push(detail(i, i % 100 === 0 ? "0040037" : "0040000"));
  }
  parts.push(trailer(n));
  const text = parts.join("\r\n") + "\r\n";
  const expected = Math.floor(n / 100);
  const r = parseAchText(text, schema, {
    filename: "filter.txt",
    filters: {
      bankCode: "0040037",
      account: "",
      taxId: "",
      userNo: "",
      amount: "",
    },
  });
  assert.equal(r.filterActive, true);
  assert.equal(r.detailCount, n);
  assert.equal(r.matchedCount, expected);
  assert.equal(r.tooLargeForForm, false);
  assert.equal(r.rows.length, expected);
  assert.equal(r.previewRows.length, expected);
  assert.ok(r.rows.every((row) => row.bankCode === "0040037"));
  console.log(`OK pre-filter loaded all ${expected} matches from ${n}`);
}

// 串流 File + 篩選
{
  const n = 120;
  const parts: string[] = [hdr];
  for (let i = 1; i <= n; i++) {
    parts.push(detail(i, i <= 3 ? "0040071" : "0040000"));
  }
  parts.push(trailer(n));
  const file = new File([parts.join("\r\n") + "\r\n"], "stream-filter.txt", {
    type: "text/plain",
  });
  const r = await parseAchFile(file, schema, {
    filename: file.name,
    filters: {
      bankCode: "0040071",
      account: "",
      taxId: "",
      userNo: "",
      amount: "",
    },
  });
  assert.equal(r.matchedCount, 3);
  assert.equal(r.rows.length, 3);
  assert.equal(r.tooLargeForForm, false);
  console.log("OK stream File with pre-filter");
}

console.log("ACH import limit / pre-filter tests passed");
