/**
 * IS-TRAINING 後端（Apps Script）
 * 兩個功能：① 雲端同步個人計劃/Garmin/打卡（免逐部機匯入） ② Claude API 即時教練對話
 *
 * 🔑 全部機密只存 Script Properties（檔案 → 專案設定 → 指令碼屬性），唔入 repo：
 *    SHEET_ID         = 你開嘅 Google Sheet ID（IS Training Log）
 *    ACCESS_TOKEN     = 你自訂嘅一串密碼（app 同你個人之間用，防外人讀數據）
 *    CLAUDE_API_KEY   = console.anthropic.com 攞嘅 API key（用 Claude 對話先要）
 *
 * 部署：Web app，執行身分＝自己，存取權＝「任何人」（靠 ACCESS_TOKEN 保護）。
 */

const PROP = PropertiesService.getScriptProperties();
const STORE_TAB = 'store';
const LOG_TAB = 'sessions';

/** 攞 Sheet；冇 SHEET_ID 就自動建一個新 Sheet 並記低 ID */
function sheet_() {
  let id = PROP.getProperty('SHEET_ID');
  if (!id) {
    const ss = SpreadsheetApp.create('IS Training Log');
    id = ss.getId();
    PROP.setProperty('SHEET_ID', id);
  }
  return SpreadsheetApp.openById(id);
}

/** 一鍵設定：自動建 Sheet + tab、自動生成 ACCESS_TOKEN，返回俾你抄低。手動跑一次（會彈授權，批准即可）。 */
function setup() {
  const ss = sheet_();
  if (!ss.getSheetByName(STORE_TAB)) ss.insertSheet(STORE_TAB).appendRow(['key', 'json', 'updated']);
  if (!ss.getSheetByName(LOG_TAB)) ss.insertSheet(LOG_TAB).appendRow(['date', 'type', 'dur', 'rpe', 'body', 'note']);
  let token = PROP.getProperty('ACCESS_TOKEN');
  if (!token) {
    token = 'is_' + Utilities.getUuid().replace(/-/g, '').slice(0, 20);
    PROP.setProperty('ACCESS_TOKEN', token);
  }
  let url = '';
  try { url = ScriptApp.getService().getUrl(); } catch (e) {}
  const msg = '✅ setup done\nSHEET_ID = ' + ss.getId() + '\nACCESS_TOKEN = ' + token + '\nWEB_APP_URL = ' + url +
    '\n\n（把 ACCESS_TOKEN 同 WEB_APP_URL 貼入 app 數據→雲端同步。CLAUDE_API_KEY 另行喺指令碼屬性加，AI 對話先需要。）';
  Logger.log(msg);
  return msg;
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function checkToken_(t) {
  const real = PROP.getProperty('ACCESS_TOKEN');
  return real && t === real;
}

/** 讀：app pull 全部 store + sessions */
function doGet(e) {
  try {
    if (!checkToken_(e.parameter.token)) return out_({ ok: false, error: 'unauthorized' });
    const ss = sheet_();
    const store = {};
    const sv = ss.getSheetByName(STORE_TAB).getDataRange().getValues();
    for (let i = 1; i < sv.length; i++) {
      if (sv[i][0]) { try { store[sv[i][0]] = JSON.parse(sv[i][1]); } catch (x) { store[sv[i][0]] = sv[i][1]; } }
    }
    const lv = ss.getSheetByName(LOG_TAB).getDataRange().getValues();
    const sessions = lv.slice(1).filter(r => r[0]).map(r => ({ date: r[0], type: r[1], dur: r[2], rpe: r[3], body: r[4], note: r[5] }));
    return out_({ ok: true, store: store, sessions: sessions });
  } catch (err) { return out_({ ok: false, error: String(err) }); }
}

/** 寫 / 對話 */
function doPost(e) {
  try {
    const b = JSON.parse(e.postData.contents || '{}');
    if (!checkToken_(b.token)) return out_({ ok: false, error: 'unauthorized' });

    if (b.action === 'put') {          // 上傳一個 key（plan / garmin_latest / daily_summary）
      putStore_(b.key, b.value);
      return out_({ ok: true });
    }
    if (b.action === 'log') {          // 新增一次打卡
      const s = b.session || {};
      sheet_().getSheetByName(LOG_TAB).appendRow([s.date, s.type, s.dur, s.rpe, s.body, s.note]);
      return out_({ ok: true });
    }
    if (b.action === 'chat') {         // Claude 即時對話
      return out_(claudeChat_(b.messages || [], b.system || ''));
    }
    return out_({ ok: false, error: 'unknown action' });
  } catch (err) { return out_({ ok: false, error: String(err) }); }
}

function putStore_(key, value) {
  const sh = sheet_().getSheetByName(STORE_TAB);
  const v = sh.getDataRange().getValues();
  const json = JSON.stringify(value);
  for (let i = 1; i < v.length; i++) {
    if (v[i][0] === key) { sh.getRange(i + 1, 2, 1, 2).setValues([[json, new Date()]]); return; }
  }
  sh.appendRow([key, json, new Date()]);
}

/** Claude API proxy（key 只留後端） */
function claudeChat_(messages, system) {
  const key = PROP.getProperty('CLAUDE_API_KEY');
  if (!key) return { ok: false, error: '未設定 CLAUDE_API_KEY' };
  const res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify({
      model: 'claude-opus-4-8',
      max_tokens: 1024,
      system: system || '你係一隊專業運動科學教練團（S&C、運動營養、物理治療、體能）。用繁體中文（香港）、精簡、可行動咁回答。',
      messages: messages
    })
  });
  const data = JSON.parse(res.getContentText());
  if (data.error) return { ok: false, error: data.error.message || 'claude error' };
  const text = (data.content || []).map(c => c.text).join('\n');
  return { ok: true, reply: text };
}
