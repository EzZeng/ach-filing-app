import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = "/workspace/public/data/formats";
const index = JSON.parse(fs.readFileSync(path.join(root, "index.json"), "utf8"));
assert.ok(index.formats.length >= 2, "at least 2 formats");

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

console.log("ACH JSON schema smoke tests passed");
