/**
 * ACH 匯入：依 JSON records 切片後還原表單欄位（產生→解析 roundtrip）
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = "/workspace/public/data/formats";
const index = JSON.parse(fs.readFileSync(path.join(root, "index.json"), "utf8"));

function pad(value, length, side = "right", char = " ") {
  let s = String(value ?? "");
  if (s.length > length) return s.slice(0, length);
  if (side === "none") return s;
  if (side === "left") return s.padStart(length, char);
  return s.padEnd(length, char);
}

function buildLine(fields, values) {
  return fields
    .map((f) => {
      if (f.source === "literal") return pad(f.value ?? "", f.length, "right", " ");
      if (f.source === "formatCode") return pad(values.code, f.length, "right", " ");
      if (f.source === "version") return pad(values.version, f.length, "right", " ");
      if (f.source === "filler") return (f.fill ?? " ").repeat(f.length);
      if (f.source === "runtime") return pad(values.nowHms ?? "120000", f.length, "left", "0");
      if (f.source === "derived") {
        const map = {
          sorg: values.sorg,
          txType: values.txType,
          seq: values.seq,
          totalCount: values.totalCount,
          totalAmount: values.totalAmount,
        };
        const side = f.pad?.side ?? "left";
        const ch = f.pad?.char ?? "0";
        return pad(map[f.fn] ?? "", f.length, side, ch);
      }
      if (f.source === "header" || f.source === "detail") {
        const raw = values[f.key] ?? "";
        let side = f.pad?.side ?? "right";
        let ch = f.pad?.char ?? (side === "left" ? "0" : " ");
        if (f.transform === "floorInt") {
          return pad(String(Math.floor(Number(raw) || 0)), f.length, side === "none" ? "left" : side, ch || "0");
        }
        if (f.transform === "firstChar") {
          return pad(String(raw).charAt(0), f.length, "right", " ");
        }
        // 測試用：pad none 仍補滿，確保列長正確（正式匯出帳號需已是定長）
        if (side === "none") {
          side = f.charset === "digit" ? "left" : "right";
          ch = f.charset === "digit" ? "0" : " ";
        }
        return pad(raw, f.length, side, ch);
      }
      return " ".repeat(f.length);
    })
    .join("");
}

function unpad(raw, def) {
  let s = raw ?? "";
  const padSpec = def.pad ?? { side: "right", char: " " };
  if (def.transform === "firstChar") return s.trim().charAt(0);
  if (padSpec.side === "right" || !def.pad) s = s.replace(/[ \t]+$/g, "");
  if (def.transform === "floorInt" || (padSpec.side === "left" && (padSpec.char ?? "0") === "0")) {
    if (def.transform === "floorInt" || ["totalCount", "totalAmount", "seq"].includes(def.fn)) {
      const t = s.replace(/^0+/, "");
      return t === "" ? "0" : t;
    }
  }
  return s.replace(/[ \t]+$/g, "");
}

function parseLine(line, fields) {
  const out = {};
  let offset = 0;
  for (const def of fields) {
    const raw = line.slice(offset, offset + def.length);
    offset += def.length;
    if ((def.source === "header" || def.source === "detail") && def.key) {
      out[def.key] = unpad(raw, def);
    }
  }
  return out;
}

function detectCode(text) {
  const line = text.split(/\r?\n/).find((l) => l.startsWith("BOF"));
  return line ? line.slice(3, 9).trim() : null;
}

for (const entry of index.formats) {
  const schema = JSON.parse(
    fs.readFileSync(path.join(root, entry.schemaFile), "utf8"),
  );

  const headerVals = {
    code: schema.code,
    version: schema.version,
    date: "01150804",
    txid: "704",
    bankCode: "0040000",
    account: "0000001234567890",
    taxId: "12345678",
    admark: "A",
    sorg: "0040000",
    txType: "NC",
    nowHms: "153045",
    totalCount: "2",
    totalAmount: "1500",
  };

  const detailA = {
    ...headerVals,
    seq: "1",
    bankCode: "0040010",
    account: "0000009988776655",
    taxId: "A123456789",
    userNo: "USER001",
    amount: "1000",
  };
  const detailB = {
    ...headerVals,
    seq: "2",
    bankCode: "0040020",
    account: "0000001122334455",
    taxId: "87654321",
    userNo: "USER002",
    amount: "500",
  };

  const lines = [
    buildLine(schema.records.header.fields, headerVals),
    buildLine(schema.records.detail.fields, detailA),
    buildLine(schema.records.detail.fields, detailB),
    buildLine(schema.records.trailer.fields, headerVals),
  ];

  for (const line of lines) {
    assert.equal(
      line.length,
      schema.recordLength,
      `${schema.code} built line length ${line.length}`,
    );
  }

  const content = lines.join("\r\n") + "\r\n";
  assert.equal(detectCode(content), schema.code);

  const parsedHeader = {
    ...parseLine(lines[0], schema.records.header.fields),
    ...parseLine(lines[1], schema.records.detail.fields),
  };
  // detail source=header keys overlay
  const detailHeaderKeys = schema.records.detail.fields
    .filter((f) => f.source === "header" && f.key)
    .map((f) => f.key);
  const fromDetailHeader = parseLine(lines[1], schema.records.detail.fields);
  for (const k of detailHeaderKeys) {
    if (!parsedHeader[k]) parsedHeader[k] = fromDetailHeader[k];
  }

  assert.equal(parsedHeader.date, "01150804", `${schema.code} date`);
  if (schema.form.header.some((f) => f.key === "txid")) {
    // txid 可能只在 detail 的 header source
    const tx = parsedHeader.txid || fromDetailHeader.txid;
    assert.equal(tx, "704", `${schema.code} txid`);
  }

  const row1 = parseLine(lines[1], schema.records.detail.fields);
  const detailKeys = schema.form.detail.map((f) => f.key);
  for (const key of detailKeys) {
    if (key === "bankCode") assert.equal(row1.bankCode, "0040010");
    if (key === "account") assert.equal(row1.account, "0000009988776655");
    if (key === "userNo") assert.equal(row1.userNo, "USER001");
    if (key === "amount") assert.equal(row1.amount, "1000");
  }

  console.log(
    `OK import ${schema.code} details=2 recordLength=${schema.recordLength}`,
  );
}

console.log("ACH import roundtrip smoke tests passed");
