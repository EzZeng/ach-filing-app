#!/usr/bin/env node
/**
 * Download Chromium Win_x64 continuous snapshot and pack a portable zip.
 *
 * Usage:
 *   node tools/chromium-windows-portable/scripts/package-from-snapshot.mjs
 *   node tools/chromium-windows-portable/scripts/package-from-snapshot.mjs --revision=1674718
 *
 * Output: release/ChromiumPortable-Win_x64-r<REV>.zip
 */
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  cpSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const toolRoot = resolve(__dirname, "..");
const repoRoot = resolve(toolRoot, "../..");
const releaseDir = join(repoRoot, "release");
const workDir = join(repoRoot, "release", ".chromium-portable-work");

const DROP_NAMES = new Set([
  "interactive_ui_tests.exe",
  "unit_tests.exe",
  "browser_tests.exe",
  "setup.exe",
  "mini_installer.exe",
  "elevation_service.exe",
  "elevated_tracing_service.exe",
  "chrome_pwa_launcher.exe",
  "chrome_proxy.exe",
  "notification_helper.exe",
  "First Run",
]);

function parseArgs(argv) {
  const out = { revision: null };
  for (const a of argv) {
    if (a.startsWith("--revision=")) out.revision = a.slice("--revision=".length);
  }
  return out;
}

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return (await res.text()).trim();
}

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  await pipeline(res.body, createWriteStream(dest));
}

function unzip(zipPath, destDir) {
  mkdirSync(destDir, { recursive: true });
  execFileSync("unzip", ["-q", "-o", zipPath, "-d", destDir], { stdio: "inherit" });
}

function zipDir(srcDir, zipPath) {
  const parent = dirname(srcDir);
  const base = srcDir.split(/[/\\]/).pop();
  rmSync(zipPath, { force: true });
  execFileSync("zip", ["-qr", zipPath, base], { cwd: parent, stdio: "inherit" });
}

function writeLaunchers(outDir) {
  writeFileSync(
    join(outDir, "ChromiumPortable.bat"),
    readFileSync(join(toolRoot, "launcher", "ChromiumPortable.bat"), "utf8"),
  );
  writeFileSync(
    join(outDir, "ChromiumPortable.ps1"),
    readFileSync(join(toolRoot, "launcher", "ChromiumPortable.ps1"), "utf8"),
  );
}

function prunePortable(dir) {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, name.name);
    if (name.isDirectory()) {
      if (name.name === "Crashpad") {
        rmSync(p, { recursive: true, force: true });
        continue;
      }
      prunePortable(p);
      continue;
    }
    if (
      DROP_NAMES.has(name.name) ||
      name.name.endsWith(".pdb") ||
      name.name.endsWith(".manifest")
    ) {
      unlinkSync(p);
    }
  }
}

async function main() {
  const { revision: revArg } = parseArgs(process.argv.slice(2));
  console.log("→ resolve Win_x64 LAST_CHANGE …");
  const revision =
    revArg ||
    (await fetchText(
      "https://www.googleapis.com/download/storage/v1/b/chromium-browser-snapshots/o/Win_x64%2FLAST_CHANGE?alt=media",
    ));
  if (!/^\d+$/.test(revision)) throw new Error(`bad revision: ${revision}`);

  const zipUrl = `https://www.googleapis.com/download/storage/v1/b/chromium-browser-snapshots/o/Win_x64%2F${revision}%2Fchrome-win.zip?alt=media`;
  console.log(`→ Chromium Win_x64 r${revision}`);
  console.log(`  ${zipUrl}`);

  rmSync(workDir, { recursive: true, force: true });
  mkdirSync(workDir, { recursive: true });
  mkdirSync(releaseDir, { recursive: true });

  const zipPath = join(workDir, "chrome-win.zip");
  console.log("→ downloading …");
  await download(zipUrl, zipPath);
  console.log(`  ${(statSync(zipPath).size / 1024 / 1024).toFixed(1)} MB`);

  const extractDir = join(workDir, "extract");
  console.log("→ unzip …");
  unzip(zipPath, extractDir);

  const chromeWin = join(extractDir, "chrome-win");
  if (!existsSync(join(chromeWin, "chrome.exe"))) {
    throw new Error("chrome.exe missing after unzip");
  }

  const portableName = "ChromiumPortable";
  const portableDir = join(workDir, portableName);
  rmSync(portableDir, { recursive: true, force: true });
  cpSync(chromeWin, portableDir, { recursive: true });
  prunePortable(portableDir);
  mkdirSync(join(portableDir, "UserData"), { recursive: true });
  mkdirSync(join(portableDir, "Downloads"), { recursive: true });
  writeLaunchers(portableDir);

  writeFileSync(
    join(portableDir, "README.txt"),
    [
      "Chromium Windows Portable",
      "=========================",
      `Revision : ${revision} (chromium-browser-snapshots Win_x64)`,
      "",
      "Usage",
      "-----",
      "1. Unzip anywhere (prefer a path without spaces).",
      "2. Double-click ChromiumPortable.bat",
      "3. Profile data: .\\UserData",
      "",
      "Source-build guide:",
      "  tools/chromium-windows-portable/README.md",
      "  https://chromium.googlesource.com/chromium/src/+/main/docs/windows_build_instructions.md",
      "",
    ].join("\n"),
  );

  const outZip = join(releaseDir, `ChromiumPortable-Win_x64-r${revision}.zip`);
  console.log(`→ zip ${outZip}`);
  zipDir(portableDir, outZip);

  copyFileSync(outZip, join(releaseDir, "ChromiumPortable-Win_x64-latest.zip"));

  writeFileSync(
    join(releaseDir, "ChromiumPortable-BUILDINFO.txt"),
    [
      "product=Chromium Windows Portable",
      "platform=Win_x64",
      `revision=${revision}`,
      `zip=${outZip}`,
      `bytes=${statSync(outZip).size}`,
      `built=${new Date().toISOString()}`,
      "",
    ].join("\n"),
  );

  // Clean work dir to save space (keep release zip)
  rmSync(workDir, { recursive: true, force: true });

  console.log(
    `✓ portable: ${outZip} (${(statSync(outZip).size / 1024 / 1024).toFixed(1)} MB)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
