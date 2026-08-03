# 代收建檔小程式（ACH Filing）

財金 ACH **P01 代收交易** / **P02 授權建檔** 固定長度文字檔產生工具。  
由 Excel 巨集改寫：**檔案代號與欄位格式 JSON 參數化**。

## 成品形式：純 HTML + JavaScript（非 exe）

主要發行物是 **靜態網頁包**（`index.html` + `assets/*.js` + `data/*.json`），  
解壓後用瀏覽器開啟即可使用，**不需要安裝 Electron / exe**。

### 下載

Release：**[GitHub Releases](https://github.com/EzZeng/ach-filing-app/releases)**

| 檔案 | 說明 |
|------|------|
| `ACH-Filing-*-html-js.zip` | **Portable 靜態包（建議）** |

### 使用

```bash
# 解壓後在資料夾內啟動本機伺服器（建議，避免 file:// 限制）
python -m http.server 8080
# 瀏覽器開啟 http://127.0.0.1:8080/
```

也可丟到 IIS / nginx / 內網靜態站、GitHub Pages。

## 功能

- ACHP01 / ACHP02（可擴充檔案代號）
- 表頭／明細檢核、明細篩選
- 成品輸出：**TXT**（上傳檔）、**HTML** 報表、**JS** 資料模組
- 中信 `822*` 首錄代表行固定 `8220901`

## 格式參數（JSON）

| 路徑 | 說明 |
|------|------|
| `data/formats/index.json` | 檔案代號清單 |
| `data/formats/ACHP01.json` | P01 欄位／長度／charset／輸出紀錄 |
| `data/formats/ACHP02.json` | P02 同上 |

```json
"features": {
  "detailFilter": true,
  "exportFormats": ["txt", "html", "js"]
}
```

## 開發

```bash
npm install
npm run dev:web      # 靜態 SPA 開發伺服器 :8080
npm run build:web    # 輸出 dist-static/
npm run pack:web     # 產生 release/*-html-js.zip
```

## 授權

MIT
