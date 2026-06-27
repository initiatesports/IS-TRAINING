# IS-TRAINING — 個人專業成長系統（運動員 · 教練 · 治療師）

> 一個橫跨**運動員、教練、治療師**三個身份嘅專業系統：一隊 AI 導師團一邊幫使用者制定/追蹤自己嘅訓練，一邊持續教學、給 insight、鞏固專業知識；同時係一個**個人知識庫（CPD / 概念卡 / 參考框架）**。
> 跟公司現有 stack：**GitHub Pages 前端 + Apps Script 後端 + Google Sheet 做記錄庫**。
>
> 🔒 **私隱**：公開 repo 只放中性 app 殼 + 後端 code。所有個人資料（計劃、傷患、Garmin、進修記錄、API key）只存本機 / 你私人 Google Sheet，`data/`、`docs/` 已 gitignore，永不上 GitHub。

## App 區域
- **今日** — readiness + 今日訓練 + 今日一課
- **訓練** — 12 週計劃（運動員身份）
- **知識** — 進修記錄 (CPD)、跨學科概念卡、參考框架
- **教練** — PT 工具（OPT / 矯正 / 評估）
- **治療** — 徒手/軟組織治療參考、自身案例
- **導師團** — AI 導師即時對話（可揀運動員/教練/治療師身份）
- **打卡 / 數據** — 訓練記錄、Garmin、雲端同步

---

## 一、系統目標（老闆設定）

- **核心方向**：綜合體能均衡發展（力量＋耐力＋身形），同時兼顧專項技術、教學能力、備戰。
- **訓練頻率**：每週 3–4 次。
- **週期**：12 週為一個訓練週期，未來 3 個月看階段成果。
- **形態**：互動網頁 app 做主軸，內含 ①計劃文件 ②AI 教練團對話 ③自動 check-in。
- **AI 教練團模式**：先做免費混合模式（計劃同回應由 Claude Code 每個 session 生成／修訂），架構預留位日後接 Claude API 做 app 內即時對話。

## 二、AI 運動專家團隊（角色）

| 角色 | 職責 |
| --- | --- |
| 🏋️ 肌力與體能教練 (S&C) | 力量／爆發力／體能週期化、每週課表 |
| 🏸 專項技術教練 | 羽毛球／匹克球技術、步法、戰術、教學示範品質 |
| 🥗 運動營養師 | 飲食、補給、體重管理（香港情境） |
| 🩹 物理治療／防傷 | 熱身、伸展、傷患預防與復康 |
| 🧠 表現心理／習慣教練 | 動機、習慣養成、依從性、壓力管理 |
| 📊 數據分析師 | 讀記錄庫、量化進度、提出調整建議 |

> 角色可加可減。每次 check-in 由相關角色給意見，數據分析師負責綜合。

## 三、架構

```
使用者(手機/電腦)
   │
   ▼
index.html  ── GitHub Pages 前端（單頁 app）
   │  ① 離線模式：localStorage（即開即用，無需後端）
   │  ② 雲端模式：fetch → Apps Script /exec（多裝置同步）
   ▼
backend/Code.gs ── Apps Script 後端
   │
   ▼
Google Sheet「IS Training Log」── 記錄庫（多個 tab）
```

雙模式：未部署後端前，app 用 localStorage 即可用；部署後切到雲端同步。跟現有 app 一樣 graceful degrade。

## 四、Google Sheet 記錄庫 schema（tab）

| Tab | 欄位 | 用途 |
| --- | --- | --- |
| `profile` | key, value | 基準資料（年齡/身高/體重/傷患/器材…） |
| `plan` | week, day, block, exercise, sets, reps, load, notes | 12 週課表 |
| `sessions` | date, day, type, duration, rpe, completed, notes | 每次訓練打卡記錄 |
| `metrics` | date, weight, bodyfat, waist, resting_hr, sleep, energy | 身體／健康指標追蹤 |
| `tests` | date, test, value, unit | 階段體測（深蹲、掌上壓、跑步…） |
| `checkins` | date, role, message | AI 教練團 check-in 記錄 |
| `settings` | key, value | 後端設定（門檻、提醒等） |

> 後端有 `setup()` 一鍵建立所有 tab —— 老闆只需開一個空白 Google Sheet，貼 ID 入 backend，run 一次。

## 五、部署流程（跟現有 app 一致）

1. `gh repo create initiatesports/IS-TRAINING --public` 並 push。
2. GitHub Pages：Settings → Pages → 由 `main` 分支 root 發佈 → 得到 `initiatesports.github.io/IS-TRAINING/`。
3. 開一個空白 Google Sheet「IS Training Log」，記低 Sheet ID。
4. `clasp` 連 backend 到新 Apps Script 專案，貼 Sheet ID，`clasp push` + `clasp deploy` 取得 `/exec`。
5. 把 `/exec` 網址填入 `index.html` 的 `BACKEND_URL`，切到雲端模式。
6. （之後）GitHub Actions 自動 `clasp push`／`clasp deploy`，同其他 repo 一樣。

> ⚠️ 任何 key / token 一律存 Apps Script Script Properties，唔好入 repo。

## 六、檔案

- `index.html` — 主 app（dashboard / 計劃 / 打卡 / 指標 / 教練團）
- `backend/Code.gs` — Apps Script 後端（doGet/doPost/setup）
- `backend/appsscript.json` — Apps Script manifest
- `.github/workflows/deploy.yml` — 自動部署（之後加）
- `docs/PLAN.md` — 當前 12 週計劃全文（人類可讀版，由 AI 教練團生成）
