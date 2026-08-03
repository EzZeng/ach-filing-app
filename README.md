# 代收建檔小程式（ACH Filing）

財金 ACH **P01 代收交易** / **P02 授權建檔** 固定長度文字檔產生工具。  
由 Excel 巨集改寫，**檔案代號與欄位格式以 JSON 參數化**。

## 功能

- ACHP01 / ACHP02（可擴充更多檔案代號）
- 表頭／明細即時檢核（長度、英數字、銀行代號、交易代號、民國日期）
- 中信 `822*` 首錄代表行固定 `8220901`
- 桌面版（Electron）存檔對話框；Web 版下載

## 格式參數

| 路徑 | 說明 |
|------|------|
| `public/data/formats/index.json` | 檔案代號清單 |
| `public/data/formats/ACHP01.json` | P01 欄位／長度／charset／輸出紀錄 |
| `public/data/formats/ACHP02.json` | P02 同上 |

新增格式：複製 JSON → 改 `code` 與欄位 → 登錄 `index.json`。

## Web 開發

```bash
npm install
npm run dev
```

## 桌面版打包（Windows portable exe + zip）

```bash
npm install
npm run electron:pack
```

產物位於 `release/`：

- `代收建檔小程式-1.0.0-portable.exe` — 免安裝可執行檔
- `代收建檔小程式-1.0.0-win-x64.zip` — portable 壓縮包

## 授權

MIT
