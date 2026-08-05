/**
 * 大檔匯入上限：超過 maxFormDetailRows 不可物化全部 rows／lines
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

function detail(seq: number) {
  return (
    "N" +
    "SD" +
    pad("704", 3) +
    lpad(String(seq), 8) +
    "0040000" +
    "0000001234567890" +
    "0040000" +
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
assert.equal(trailer(1).length, 250);

// 小檔：可套用
{
  const n = 2;
  const text = [hdr, detail(1), detail(2), trailer(n)].join("\r\n") + "\r\n";
  const r = parseAchText(text, schema, { filename: "small.txt" });
  assert.equal(r.detailCount, 2);
  assert.equal(r.rows.length, 2);
  assert.equal(r.previewRows.length, 2);
  assert.equal(r.tooLargeForForm, false);
  assert.ok(r.lines.some((l) => l.kind === "header"));
  assert.ok(r.lines.some((l) => l.kind === "trailer"));
  assert.ok(r.lines.filter((l) => l.kind === "detail").length <= 2);
  console.log("OK small file applyable");
}

// 超過表單上限：不保留 rows，僅預覽
{
  const n = IMPORT_LIMITS.maxFormDetailRows + 5;
  const parts: string[] = [hdr];
  for (let i = 1; i <= n; i++) parts.push(detail(i));
  parts.push(trailer(n));
  const text = parts.join("\r\n") + "\r\n";
  const r = parseAchText(text, schema, { filename: "large.txt" });
  assert.equal(r.detailCount, n);
  assert.equal(r.tooLargeForForm, true);
  assert.equal(r.rows.length, 0);
  assert.equal(r.previewRows.length, IMPORT_LIMITS.maxPreviewDetailRows);
  assert.ok(r.lines.filter((l) => l.kind === "detail").length <= IMPORT_LIMITS.maxDetailLineSamples);
  assert.ok(r.warnings.some((w) => w.includes("超過可載入表單上限")));
  console.log(`OK oversized text (${n} details) not materialized`);
}

// 串流 File（Node Blob/File）
{
  const n = IMPORT_LIMITS.maxFormDetailRows + 3;
  const parts: string[] = [hdr];
  for (let i = 1; i <= n; i++) parts.push(detail(i));
  parts.push(trailer(n));
  const blob = new Blob([parts.join("\r\n") + "\r\n"], { type: "text/plain" });
  const file = new File([blob], "stream-large.txt", { type: "text/plain" });
  const r = await parseAchFile(file, schema, { filename: file.name });
  assert.equal(r.detailCount, n);
  assert.equal(r.tooLargeForForm, true);
  assert.equal(r.rows.length, 0);
  assert.ok(r.previewRows.length <= IMPORT_LIMITS.maxPreviewDetailRows);
  console.log(`OK stream File (${n} details, ${(file.size / 1024).toFixed(0)} KB)`);
}

console.log("ACH import limit tests passed");
