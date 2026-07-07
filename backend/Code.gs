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
    if (b.action === 'chat') {         // AI 即時對話（Gemini 免費 / Claude）
      return out_(aiChat_(b.messages || [], b.system || '', b.maxTokens || 1024));
    }
    if (b.action === 'review') {       // 導師團點評今次訓練 → 生成 + email 俾老闆
      const msgs = b.messages || [{ role: 'user', content: b.prompt || '' }];
      const r = aiChat_(msgs, b.system || REVIEW_SYSTEM_, b.maxTokens || 2000);
      if (r.ok && r.reply && b.email !== false) {
        try { mailReview_(b.subject || '🏋️ 導師團點評', r.reply); r.emailed = true; }
        catch (e) { r.emailed = false; r.emailError = String(e); }
      }
      return out_(r);
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

const REVIEW_SYSTEM_ = '你係 IS 導師團（S&C 教練、物理治療、運動營養、表現心理、動作學習等專家）。點評老闆今次訓練：對比上次重量、顧住佢傷患（右膕繩/右腰/右踝背屈/前臂）、畀後續建議（下次重量/組數點調、下一課重點），可加 1 個英文 coaching cue（附中文）。用繁體中文（香港）、精簡專業、分點、可直接行動。';

/** email 點評俾老闆（送去 script 擁有人 = 老闆自己嘅 Gmail；OWNER_EMAIL 可覆寫。唔使密碼） */
function mailReview_(subject, body) {
  let to = PROP.getProperty('OWNER_EMAIL');
  if (!to) { try { to = Session.getEffectiveUser().getEmail(); } catch (e) {} }
  if (!to) throw new Error('搵唔到收件 email（請喺指令碼屬性加 OWNER_EMAIL）');
  MailApp.sendEmail({ to: to, subject: subject, body: body, name: 'IS 導師團' });
}

/** Claude API proxy（key 只留後端） */
function claudeChat_(messages, system, maxTokens) {
  const key = PROP.getProperty('CLAUDE_API_KEY');
  if (!key) return { ok: false, error: '未設定 CLAUDE_API_KEY' };
  const res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify({
      model: 'claude-opus-4-8',
      max_tokens: maxTokens || 1024,
      system: system || '你係一隊專業運動科學教練團（S&C、運動營養、物理治療、體能）。用繁體中文（香港）、精簡、可行動咁回答。',
      messages: messages
    })
  });
  const data = JSON.parse(res.getContentText());
  if (data.error) return { ok: false, error: data.error.message || 'claude error' };
  const text = (data.content || []).map(c => c.text).join('\n');
  return { ok: true, reply: text };
}

/** 揀 AI：有 GEMINI_API_KEY 就用免費 Gemini，否則用 Claude */
function aiChat_(messages, system, maxTokens) {
  if (PROP.getProperty('GEMINI_API_KEY')) return geminiChat_(messages, system, maxTokens);
  if (PROP.getProperty('CLAUDE_API_KEY')) return claudeChat_(messages, system, maxTokens);
  return { ok: false, error: '未設定 GEMINI_API_KEY 或 CLAUDE_API_KEY' };
}

/** Google Gemini（免費額度）proxy */
function geminiChat_(messages, system, maxTokens) {
  const key = PROP.getProperty('GEMINI_API_KEY');
  const contents = (messages || []).map(function (m) {
    return { role: (m.role === 'assistant' ? 'model' : 'user'), parts: [{ text: String(m.content || '') }] };
  });
  const res = UrlFetchApp.fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + encodeURIComponent(key),
    {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      payload: JSON.stringify({
        system_instruction: { parts: [{ text: system || '你係一隊專業運動科學導師團，用繁體中文（香港）、精簡、可行動咁回答。' }] },
        contents: contents,
        generationConfig: { maxOutputTokens: maxTokens || 1024, temperature: 0.7 }
      })
    });
  const data = JSON.parse(res.getContentText());
  if (data.error) return { ok: false, error: (data.error.message || 'gemini error') };
  let text = '';
  try { text = (data.candidates[0].content.parts || []).map(function (p) { return p.text; }).join('\n'); } catch (e) {}
  if (!text) return { ok: false, error: 'Gemini 無回應（可能被安全過濾或額度用完）' };
  return { ok: true, reply: text };
}
