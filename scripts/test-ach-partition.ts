/**
 * 分割／索引／合併／大檔轉 R01 煙霧測試
 */
import assert from "node:assert/strict";
import {
  EMBEDDED_BRANCHES,
  EMBEDDED_TXIDS,
  loadEmbeddedFormats,
} from "../src/data/embedded";
import { generateFromSchema } from "../src/lib/ach/engine";
import {
  convertLargeP01FileToR01,
  mergeAchPartitions,
  parsePartitionIndex,
  partitionAchFile,
  planPartitionSizes,
  planPartitions,
  stringifyPartitionIndex,
} from "../src/lib/ach/partition";
import type { DetailRow, HeaderValues } from "../src/lib/ach/schema";

const formats = loadEmbeddedFormats();
const p01 = formats.ACHP01!;
const r01 = formats.ACHR01!;

assert.deepEqual(planPartitionSizes(10, 3), [4, 3, 3]);
assert.deepEqual(planPartitionSizes(5, 10), [1, 1, 1, 1, 1]);
const plan = planPartitions(12_000, { chunkSize: 5_000 });
assert.equal(plan.partCount, 3);

const header: HeaderValues = {
  date: "01150804",
  txid: "704",
  bankCode: "0040000",
  account: "0000001234567890",
  taxId: "12345678",
};

const rows: DetailRow[] = Array.from({ length: 7 }, (_, i) => ({
  id: `r${i}`,
  bankCode: i % 2 === 0 ? "8120053" : "0070000",
  account: `000000000000${String(1000 + i).slice(-4)}`,
  taxId: "A123456789",
  userNo: `U${i}`,
  amount: String(100 * (i + 1)),
}));

const generated = generateFromSchema(
  p01,
  header,
  rows,
  EMBEDDED_TXIDS,
  EMBEDDED_BRANCHES,
);
assert.equal(generated.lines.length, 9); // hdr+7+trl

const file = new File([generated.content], "sample-p01.txt", {
  type: "text/plain",
});

const parts: { filename: string; content: string }[] = [];
const index = await partitionAchFile(
  file,
  p01,
  EMBEDDED_TXIDS,
  EMBEDDED_BRANCHES,
  {
    partCount: 3,
    onPartition: (p) => {
      parts.push({ filename: p.filename, content: p.content });
    },
  },
);

assert.equal(index.partCount, 3);
assert.equal(index.totalDetailCount, 7);
assert.equal(parts.length, 3);
// each part: BOF + details + EOF
for (const p of parts) {
  // 不可 trimEnd 整段內容：尾錄 FILLER 空白會被吃掉
  const lines = p.content.replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n");
  assert.ok(lines[0]!.startsWith("BOF"));
  assert.ok(lines[lines.length - 1]!.startsWith("EOF"));
  assert.ok(
    lines.every((l) => l.length === 250),
    `line lens: ${lines.map((l) => l.length).join(",")}`,
  );
  const tcount = lines[lines.length - 1]!.slice(31, 39);
  const detailN = lines.length - 2;
  assert.equal(Number(tcount), detailN);
}

const indexJson = stringifyPartitionIndex(index);
const parsed = parsePartitionIndex(indexJson);
const partMap = Object.fromEntries(parts.map((p) => [p.filename, p.content]));
const merged = mergeAchPartitions(
  p01,
  { index: parsed, parts: partMap },
  EMBEDDED_TXIDS,
  EMBEDDED_BRANCHES,
);
assert.equal(merged.detailCount, 7);
const mergedLines = merged.content
  .replace(/\r\n/g, "\n")
  .replace(/\n$/, "")
  .split("\n");
assert.equal(mergedLines.length, 9);
assert.equal(mergedLines[0]!.slice(0, 9), "BOFACHP01");
assert.equal(Number(mergedLines[8]!.slice(31, 39)), 7);
assert.ok(mergedLines.every((l) => l.length === 250));

// 大檔轉 R01（同檔串流）
const converted = await convertLargeP01FileToR01(
  file,
  p01,
  r01,
  EMBEDDED_TXIDS,
  EMBEDDED_BRANCHES,
  { rcode: "04", ydate: "01150803", pdate: "01150804" },
);
assert.equal(converted.detailCount, 7);
assert.equal(converted.files.length, 2); // two return banks
const allR = converted.files.reduce((s, f) => s + f.count, 0);
assert.equal(allR, 7);
for (const f of converted.files) {
  assert.ok(f.lines[0]!.includes("ACHR01"));
  assert.equal(f.lines[1]![0], "R");
  assert.ok(f.lines.every((l) => l.length === 250));
}

console.log(
  "OK partition/merge/convert-large: parts=",
  parts.length,
  "merged=",
  merged.detailCount,
  "r01files=",
  converted.files.length,
);
