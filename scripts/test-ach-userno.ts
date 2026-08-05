/**
 * 用戶號碼（CNO）匯入不得為空
 * 執行：npx vite-node --config vite.static.config.ts scripts/test-ach-userno.ts
 */
import assert from "node:assert/strict";
import { parseAchFile, parseAchText, parseRecordFields } from "../src/lib/ach/import";
import type { FormatSchema } from "../src/lib/ach/schema";
import achp01 from "../public/data/formats/ACHP01.json";

const schema = achp01 as FormatSchema;

function pad(s: string, n: number, ch = " ") {
  return s.length >= n ? s.slice(0, n) : s + ch.repeat(n - s.length);
}
function lpad(s: string, n: number, ch = "0") {
  return s.length >= n ? s.slice(-n) : ch.repeat(n - s.length) + s;
}

function detailLine(userNo: string): string {
  return (
    "N" +
    "SD" +
    pad("704", 3) +
    lpad("1", 8) +
    "0040000" +
    "0000001234567890" +
    "8220901" +
    "0000141118000000" +
    lpad("2702536", 10) +
    "  " +
    "B" +
    pad("48790067", 10) +
    pad("23111915", 10) +
    " ".repeat(6) +
    " ".repeat(8) +
    " ".repeat(8) +
    " " +
    pad(userNo, 20) +
    " ".repeat(40) +
    " ".repeat(10) +
    "00000" +
    " ".repeat(20) +
    " ".repeat(39)
  );
}

const hdr =
  "BOF" +
  pad("ACHP01", 6) +
  "01150805" +
  "120000" +
  "0040000" +
  "9990250" +
  pad("V10", 3) +
  " ".repeat(210);

function trailer(): string {
  return (
    "EOF" +
    pad("ACHP01", 6) +
    "01150805" +
    "0040000" +
    "9990250" +
    lpad("1", 8) +
    lpad("2702536", 16) +
    " ".repeat(8) +
    " ".repeat(187)
  );
}

{
  const line = detailLine("POL1234567890");
  assert.equal(line.length, 250);
  assert.equal(line.slice(116, 136).trimEnd(), "POL1234567890");
  const fields = parseRecordFields(line, schema.records.detail.fields);
  const cno = fields.find((f) => f.id === "CNO");
  assert.equal(cno?.value, "POL1234567890");
  const text = [hdr, line, trailer()].join("\r\n") + "\r\n";
  const r = parseAchText(text, schema, { filename: "userno.txt" });
  assert.equal(r.previewRows[0]?.userNo, "POL1234567890");
  console.log("OK text parse userNo");
}

{
  // 尾端 FILLER 被截斷時，仍應讀到 CNO
  const line = detailLine("TAILPADUSER001").slice(0, 244);
  assert.equal(line.length, 244);
  const text = [hdr, line, trailer()].join("\r\n") + "\r\n";
  const r = parseAchText(text, schema, { filename: "short-tail.txt" });
  assert.equal(r.previewRows[0]?.userNo, "TAILPADUSER001");
  console.log("OK short-tail still has userNo");
}

{
  // 全形英數字
  const line = detailLine("ＡＢＣ１２３");
  const text = [hdr, line, trailer()].join("\r\n") + "\r\n";
  const r = parseAchText(text, schema, { filename: "fw.txt" });
  assert.equal(r.previewRows[0]?.userNo, "ABC123");
  console.log("OK fullwidth userNo → halfwidth");
}

{
  const line = detailLine("FILEUSER999");
  const body = [hdr, line, trailer()].join("\r\n") + "\r\n";
  const bytes = new TextEncoder().encode(body);
  // latin1-safe ASCII file via Blob
  const file = new File([bytes], "file-userno.txt");
  const r = await parseAchFile(file, schema, { filename: "file-userno.txt" });
  assert.equal(r.previewRows[0]?.userNo, "FILEUSER999");
  console.log("OK File stream parse userNo");
}

console.log("ACH userNo import tests passed");
