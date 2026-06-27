# 後端部署 runbook（雲端同步 + Claude 對話）

> 呢個後端做兩件事：① 手機/多裝置自動同步計劃同 Garmin 數據 ② app 內同教練團即時 Claude 對話。
> 全部機密（API key、密碼）只存 Apps Script「指令碼屬性」，**永不入 repo**。
> ⚠️ 需要你嘅 Google 帳號授權，所以以下步驟要你親手做（每步好快）。

## 步驟一：開 Google Sheet
1. 開一個新 Google Sheet，改名「IS Training Log」。
2. 由網址抄低 Sheet ID（`…/spreadsheets/d/<這段>/edit`）。

## 步驟二：建立 Apps Script + 貼 code
**做法 A（最簡單，手動）**
1. 去 https://script.google.com → 新增專案，改名「is-training-backend」。
2. 把 `backend/Code.gs` 全部內容貼入 `Code.gs`。
3. 左邊「專案設定」⚙️ → 剔「顯示 appsscript.json」→ 把 `backend/appsscript.json` 內容貼入。

**做法 B（clasp，跟你現有 stack）**
```bash
cd IS-TRAINING/backend
clasp login                       # 用你 Google 帳號授權（會開瀏覽器）
clasp create --type webapp --title "is-training-backend"   # 或 clasp clone <現有scriptId>
clasp push -f
```

## 步驟三：設定指令碼屬性（機密）
專案設定 ⚙️ → 「指令碼屬性」→ 加三個：
| 屬性 | 值 |
| --- | --- |
| `SHEET_ID` | 步驟一抄低嗰個 |
| `ACCESS_TOKEN` | 你自訂一串密碼（例如 16 位亂碼），app 同 push 都用呢個 |
| `CLAUDE_API_KEY` | console.anthropic.com 攞嘅 key（淨係要 Claude 對話先需要） |

## 步驟四：跑 setup() + 部署
1. 編輯器揀 function `setup` → 執行（首次會彈授權，批准）。應見 store/sessions tab 建立咗。
2. 右上「部署」→ 新增部署 → 類型「網頁應用程式」→ 執行身分「我」、存取權「**任何人**」→ 部署。
3. 抄低 `/exec` 網址。

## 步驟五：接駁 app
**app 端**：開 https://initiatesports.github.io/IS-TRAINING/ → 「數據」tab → 雲端同步 → 貼 `/exec` 網址同 `ACCESS_TOKEN` → 儲存 → 「由雲端拉取」。

**Mac 端（自動上傳）**：建立 `garmin-sync/backend.conf`（不入 repo）：
```
URL=貼你嘅/exec網址
TOKEN=貼你嘅ACCESS_TOKEN
```
之後每朝 LaunchAgent 會自動 push；想即刻 push：`python3 garmin-sync/push_to_backend.py`。

## 完成後
- 手機開網站即自動同步，唔使匯入。
- 教練團 tab 可直接傾計（會帶你嘅 readiness、傷患背景、近期打卡做 context）。

> 💰 Claude 對話按用量計費（用你自己 API key）。同步功能唔使 key、免費。
