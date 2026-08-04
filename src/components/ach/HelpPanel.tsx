import { BookOpen, FileText, Braces, MonitorSmartphone } from "lucide-react";
import { useRefStore } from "@/lib/ach/store";

export function HelpPanel() {
  const formats = useRefStore((s) => s.formatList());

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="mb-3 flex items-center gap-2">
          <BookOpen className="size-5 text-primary" />
          <h2 className="text-lg font-bold">關於本程式</h2>
        </div>
        <p className="text-sm leading-relaxed text-muted">
          由財金「代收建檔小程式」Excel 巨集改寫。
          <strong className="text-fg">檔案代號</strong>（如 ACHP01、ACHP02）與
          <strong className="text-fg">欄位／長度／英數字檢核</strong>
          皆以 JSON 參數化，新增格式不必改程式邏輯。
        </p>
      </div>

      <div className="card p-5">
        <div className="mb-2 flex items-center gap-2">
          <Braces className="size-5 text-primary" />
          <h3 className="font-bold">JSON 參數位置</h3>
        </div>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          <li>
            <code className="font-mono text-xs text-fg">public/data/formats/index.json</code>
            — 檔案代號清單
          </li>
          <li>
            <code className="font-mono text-xs text-fg">public/data/formats/ACHP01.json</code>{" "}
            等 — 各格式完整定義
          </li>
          <li>
            <code className="font-mono text-xs">form.header / form.detail</code>
            ：畫面輸入欄、charset、檢核規則
          </li>
          <li>
            <code className="font-mono text-xs">records.header / detail / trailer</code>
            ：固定長度輸出欄位順序與長度
          </li>
        </ul>
        <pre className="mt-3 overflow-x-auto rounded-lg bg-header p-3 font-mono text-[11px] text-header-fg">
{`// 新增 ACHPxx：
// 1. 複製 ACHP01.json → ACHPxx.json，改 code / 欄位
// 2. 在 index.json formats[] 登錄
// 3. 重新載入即可使用`}
        </pre>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {formats.map((f) => (
          <div key={f.code} className="card p-5">
            <div className="mb-2 flex items-center gap-2">
              <FileText className="size-5 text-primary" />
              <h3 className="font-bold">
                <span className="font-mono">{f.code}</span> {f.name}
              </h3>
            </div>
            <p className="text-sm text-muted">{f.description}</p>
          </div>
        ))}
      </div>

      <div className="card p-5">
        <div className="mb-2 flex items-center gap-2">
          <FileText className="size-5 text-primary" />
          <h3 className="font-bold">檔案匯入</h3>
        </div>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          <li>
            在各格式分頁按<strong className="text-fg">匯入檔案</strong>，選擇已產生的
            ACH 固定長度 <code className="font-mono text-xs">.txt</code>
          </li>
          <li>
            依 BOF 列 CDATA（檔案代號）自動對應 JSON 格式，並以
            <code className="font-mono text-xs">records</code> 欄位定義切片預覽
          </li>
          <li>
            預覽可切換「表單欄位／固定長度欄位／原始列」；確認後「套用到表單」覆寫該格式資料
          </li>
        </ul>
      </div>

      <div className="card p-5">
        <div className="mb-2 flex items-center gap-2">
          <MonitorSmartphone className="size-5 text-primary" />
          <h3 className="font-bold">charset 與 pad</h3>
        </div>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          <li>
            <strong className="text-fg">digit</strong>：僅 0-9（對應原 VBA SafeCHR mode 1）
          </li>
          <li>
            <strong className="text-fg">alnum</strong>：0-9A-Za-z（SafeCHR mode 2）
          </li>
          <li>
            <strong className="text-fg">pad.left / right</strong>：輸出固定長度補齊；
            <code className="font-mono text-xs">none</code> 則僅過濾字元
          </li>
          <li>
            檢核規則：required、exactLength、oneOfLengths、rocDate、txid、branchCode、number…
          </li>
        </ul>
      </div>
    </div>
  );
}
