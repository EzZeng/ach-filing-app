/**
 * 最小 ZIP（store／無壓縮）— 多檔打包成單一下載，免逐檔選儲存位置。
 */

function crc32Table(): Uint32Array {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
}

const CRC_TABLE = crc32Table();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    c = CRC_TABLE[(c ^ data[i]!) & 0xff]! ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function encodeUtf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function u16(n: number): Uint8Array {
  const b = new Uint8Array(2);
  b[0] = n & 0xff;
  b[1] = (n >>> 8) & 0xff;
  return b;
}

function u32(n: number): Uint8Array {
  const b = new Uint8Array(4);
  b[0] = n & 0xff;
  b[1] = (n >>> 8) & 0xff;
  b[2] = (n >>> 16) & 0xff;
  b[3] = (n >>> 24) & 0xff;
  return b;
}

function concat(chunks: Uint8Array[]): Uint8Array {
  let len = 0;
  for (const c of chunks) len += c.length;
  const out = new Uint8Array(len);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

export type ZipEntry = {
  filename: string;
  content: string | Uint8Array;
};

/** 建立 ZIP（無壓縮 store），回傳可直接下載的 Blob */
export function createZipBlob(entries: ZipEntry[]): Blob {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = entry.filename.replace(/^[/\\]+/, "").replace(/\\/g, "/");
    const nameBytes = encodeUtf8(name);
    const data =
      typeof entry.content === "string"
        ? encodeUtf8(entry.content)
        : entry.content;
    const checksum = crc32(data);
    const size = data.length;

    // Local file header
    const local = concat([
      u32(0x04034b50),
      u16(20), // version needed
      u16(0x0800), // UTF-8 general purpose bit
      u16(0), // store
      u16(0),
      u16(0),
      u32(checksum),
      u32(size),
      u32(size),
      u16(nameBytes.length),
      u16(0),
      nameBytes,
      data,
    ]);
    localParts.push(local);

    const central = concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0x0800),
      u16(0),
      u16(0),
      u16(0),
      u32(checksum),
      u32(size),
      u32(size),
      u16(nameBytes.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      nameBytes,
    ]);
    centralParts.push(central);
    offset += local.length;
  }

  const centralDir = concat(centralParts);
  const end = concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(centralDir.length),
    u32(offset),
    u16(0),
  ]);

  const bytes = concat([...localParts, centralDir, end]);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy], { type: "application/zip" });
}

export function suggestBundleZipName(
  files: { filename: string }[],
  fallback = "ACH-bundle.zip",
): string {
  if (files.length === 0) return fallback;
  const first = files[0]!.filename;
  const base = first.replace(/\.[^.]+$/, "") || "ACH";
  // sample.part01of03 → sample.parts.zip；否則加 -bundle
  if (/\.part\d+of\d+/i.test(first)) {
    return `${base.replace(/\.part\d+of\d+$/i, "")}.parts.zip`;
  }
  if (files.length === 1) return first.endsWith(".zip") ? first : `${base}.zip`;
  return `${base}-bundle.zip`;
}
