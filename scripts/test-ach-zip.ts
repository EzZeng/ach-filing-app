import assert from "node:assert/strict";
import { createZipBlob, suggestBundleZipName } from "../src/lib/ach/zip";

const blob = createZipBlob([
  { filename: "a.txt", content: "hello" },
  { filename: "b.json", content: '{"ok":true}\n' },
]);
assert.ok(blob.size > 40);
const buf = new Uint8Array(await blob.arrayBuffer());
// local file header signature PK\x03\x04
assert.equal(buf[0], 0x50);
assert.equal(buf[1], 0x4b);
assert.equal(buf[2], 0x03);
assert.equal(buf[3], 0x04);

assert.equal(
  suggestBundleZipName([{ filename: "x.part01of03.txt" }]),
  "x.parts.zip",
);

console.log("OK zip store bundle size=", blob.size);
