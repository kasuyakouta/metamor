// ================================================================
//  メタモル — Google Apps Script バックエンド（セキュリティ強化版）
//  フロントエンド（index.html）との対応:
//    - リクエストトークン検証（② GASリクエストトークン）
//    - レスポンスフォーマット（⑤ GASレスポンス検証に準拠）
//    - HTTPS通信・CORS設定
// ================================================================

// ──────────────────────────────────────────────────────────────
//  ⚙ 設定（必ずここを変更してください）
// ──────────────────────────────────────────────────────────────

/** スプレッドシートID（URLの /d/〇〇/ の部分）*/
const SPREADSHEET_ID = '1z-vxdy-MafwMPFHSwv_4zxGUgOAWq3rEQ_CeQX_GNOg';

/** シート名 */
const SHEET_NAME = 'リンク';

/**
 * リクエストトークン
 * フロント側の「設定 → リクエストトークン」と同じ値を設定する。
 * 空文字の場合はトークン検証をスキップ（開発時のみ推奨）。
 */
const REQUEST_TOKEN = 'metamor2026';

/** スロット最大数（フロントの TOTAL_SLOTS と合わせる）*/
const TOTAL_SLOTS = 28;

// ──────────────────────────────────────────────────────────────
//  列定義（スプレッドシートの列順）
// ──────────────────────────────────────────────────────────────
const COL = {
  ID:    0,  // A: UUID
  NAME:  1,  // B: アプリ名
  URL:   2,  // C: リンクURL
  ICON:  3,  // D: アイコン（絵文字 or https://...）
  COLOR: 4,  // E: 背景色（rgba形式）
  SLOT:  5,  // F: スロット番号（0〜23）
};

// ================================================================
//  ② トークン検証（セキュリティコア）
// ================================================================
function validateToken(token) {
  // トークン未設定の場合は検証をスキップ
  if (!REQUEST_TOKEN || REQUEST_TOKEN === 'YOUR_SHARED_TOKEN_HERE') {
    return true;
  }
  return token === REQUEST_TOKEN;
}

// ================================================================
//  ⑤ エントリ検証（フロントの validateEntry と対称）
// ================================================================
function validateEntry(entry) {
  if (!entry || typeof entry !== 'object') return false;
  if (typeof entry.name !== 'string' || !entry.name || entry.name.length > 50) return false;
  if (typeof entry.url !== 'string') return false;
  // URLはhttps:// または http:// のみ許可
  if (!/^https?:\/\/.+/i.test(entry.url)) return false;
  return true;
}

// ================================================================
//  ⑧ URL安全性チェック
// ================================================================
function isSafeUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return /^https?:\/\/.+/i.test(url);
}

// ================================================================
//  GET: スロットデータ一覧を返す
// ================================================================
function doGet(e) {
  try {
    const token = (e.parameter && e.parameter.token) || '';

    // ② トークン検証
    if (!validateToken(token)) {
      return buildError('認証エラー：トークンが一致しません', 403);
    }

    const sheet = getSheet();
    const rows  = sheet.getDataRange().getValues();
    const data  = new Array(TOTAL_SLOTS).fill(null);

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row[COL.ID]) continue;

      const slotNum = parseInt(row[COL.SLOT]);
      if (isNaN(slotNum) || slotNum < 0 || slotNum >= TOTAL_SLOTS) continue;

      const entry = {
        id:    String(row[COL.ID]),
        name:  String(row[COL.NAME] || ''),
        url:   String(row[COL.URL]  || ''),
        icon:  String(row[COL.ICON] || ''),
        color: String(row[COL.COLOR] || 'rgba(99,102,241,0.6)'),
      };

      // ⑤ 各エントリを検証してから返す
      if (validateEntry(entry)) {
        data[slotNum] = entry;
      }
    }

    // null を除いた配列（フロントの validateEntry に準拠した形式）
    const filtered = data.filter(Boolean);

    return buildResponse({ status: 'ok', data: filtered });

  } catch (err) {
    return buildError(err.message, 500);
  }
}

// ================================================================
//  POST: 追加 / 削除 / 更新
// ================================================================
function doPost(e) {
  try {
    if (!e.postData || !e.postData.contents) {
      return buildError('リクエストボディが空です', 400);
    }

    const body   = JSON.parse(e.postData.contents);
    const token  = body.token || '';
    const action = body.action;

    // ② トークン検証
    if (!validateToken(token)) {
      return buildError('認証エラー：トークンが一致しません', 403);
    }

    switch (action) {
      case 'add':    return handleAdd(body);
      case 'delete': return handleDelete(body);
      case 'update': return handleUpdate(body);
      default:       return buildError(`未知のアクション: ${action}`, 400);
    }

  } catch (err) {
    return buildError(err.message, 500);
  }
}

// ================================================================
//  CRUD ハンドラ
// ================================================================

/** アイコン追加（スロット指定） */
function handleAdd(body) {
  require(body, ['name', 'url']);

  // ⑤ ⑥ 検証
  if (!isSafeUrl(body.url)) {
    return buildError('URLはhttps://またはhttp://で始まる必要があります', 400);
  }
  if (!validateEntry(body)) {
    return buildError('入力値が不正です', 400);
  }

  const sheet = getSheet();
  const id    = body.id || Utilities.getUuid();
  const slot  = (body.slot !== undefined) ? parseInt(body.slot) : findNextSlot(sheet);
  const color = sanitizeColor(body.color);

  // スロット番号の範囲チェック（不正値をそのまま書き込むとdoGetで返らなくなり
  // データが消えたように見えてしまうため、appendRow前に必ず弾く）
  if (isNaN(slot) || slot < 0 || slot >= TOTAL_SLOTS) {
    return buildError(`スロット番号が不正です（0〜${TOTAL_SLOTS - 1}の範囲で指定してください）`, 400);
  }

  // 既存スロットの上書き防止（同スロットが埋まっていれば拒否）
  const existing = findRowBySlot(sheet, slot);
  if (existing > 0) {
    return buildError(`スロット${slot}はすでに使用中です`, 409);
  }

  sheet.appendRow([
    id,
    sanitizeText(body.name, 50),
    body.url,
    sanitizeText(body.icon || '', 100),
    color,
    slot,
  ]);

  formatLastRow(sheet);
  return buildResponse({ status: 'ok', id: id, slot: slot, message: '追加しました' });
}

/** アイコン削除（ID指定） */
function handleDelete(body) {
  require(body, ['id']);

  const sheet = getSheet();
  const rowNum = findRowById(sheet, String(body.id));

  if (rowNum < 0) {
    return buildError(`ID "${body.id}" が見つかりません`, 404);
  }

  sheet.deleteRow(rowNum);
  return buildResponse({ status: 'ok', message: '削除しました' });
}

/** アイコン更新（ID指定） */
function handleUpdate(body) {
  require(body, ['id']);

  if (body.url && !isSafeUrl(body.url)) {
    return buildError('URLはhttps://またはhttp://で始まる必要があります', 400);
  }

  // スロット番号の範囲チェック（不正値を書き込むとdoGetで返らなくなりデータが
  // 消えたように見えてしまうため、更新前に必ず弾く）
  let newSlot;
  if (body.slot !== undefined) {
    newSlot = parseInt(body.slot);
    if (isNaN(newSlot) || newSlot < 0 || newSlot >= TOTAL_SLOTS) {
      return buildError(`スロット番号が不正です（0〜${TOTAL_SLOTS - 1}の範囲で指定してください）`, 400);
    }
  }

  const sheet  = getSheet();
  const rowNum = findRowById(sheet, String(body.id));

  if (rowNum < 0) {
    return buildError(`ID "${body.id}" が見つかりません`, 404);
  }

  if (body.name  !== undefined) sheet.getRange(rowNum, COL.NAME  + 1).setValue(sanitizeText(body.name, 50));
  if (body.url   !== undefined) sheet.getRange(rowNum, COL.URL   + 1).setValue(body.url);
  if (body.icon  !== undefined) sheet.getRange(rowNum, COL.ICON  + 1).setValue(sanitizeText(body.icon, 100));
  if (body.color !== undefined) sheet.getRange(rowNum, COL.COLOR + 1).setValue(sanitizeColor(body.color));
  if (newSlot    !== undefined) sheet.getRange(rowNum, COL.SLOT  + 1).setValue(newSlot);

  return buildResponse({ status: 'ok', message: '更新しました' });
}

// ================================================================
//  ユーティリティ
// ================================================================

/** シートを取得（なければ自動作成） */
function getSheet() {
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  let   sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    const header = ['ID', 'アプリ名', 'URL', 'アイコン', '背景色', 'スロット番号'];
    sheet.appendRow(header);
    sheet.getRange(1, 1, 1, header.length)
      .setBackground('#0d1f17')
      .setFontColor('#34d399')
      .setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.setColumnWidths(1, 6, [220, 150, 320, 200, 220, 80]);
    // 入力規則：スロット番号は 0〜(TOTAL_SLOTS-1) の数値
    const slotRule = SpreadsheetApp.newDataValidation()
      .requireNumberBetween(0, TOTAL_SLOTS - 1)
      .setAllowInvalid(false)
      .build();
    sheet.getRange(2, COL.SLOT + 1, 100).setDataValidation(slotRule);
  }
  return sheet;
}

/** ID でシート行番号を取得（見つからなければ -1） */
function findRowById(sheet, id) {
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][COL.ID]) === id) return i + 1;
  }
  return -1;
}

/** スロット番号 でシート行番号を取得 */
function findRowBySlot(sheet, slot) {
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (parseInt(rows[i][COL.SLOT]) === slot) return i + 1;
  }
  return -1;
}

/** 空きスロット番号を探す */
function findNextSlot(sheet) {
  const rows = sheet.getDataRange().getValues();
  const usedSlots = new Set();
  for (let i = 1; i < rows.length; i++) {
    const s = parseInt(rows[i][COL.SLOT]);
    if (!isNaN(s)) usedSlots.add(s);
  }
  for (let i = 0; i < TOTAL_SLOTS; i++) {
    if (!usedSlots.has(i)) return i;
  }
  return -1; // 全スロット埋まり
}

/** 最終行にフォーマット適用 */
function formatLastRow(sheet) {
  const last = sheet.getLastRow();
  if (last < 2) return;
  sheet.getRange(last, 1, 1, 6)
    .setBackground('#f0faf5')
    .setBorder(
      false, false, true, false, false, false,
      '#b2dfdb', SpreadsheetApp.BorderStyle.SOLID
    );
}

/** 必須パラメータ検証 */
function require(obj, keys) {
  for (const key of keys) {
    if (obj[key] === undefined || obj[key] === null || obj[key] === '') {
      throw new Error(`"${key}" は必須パラメータです`);
    }
  }
}

/** テキストのサニタイズ（長さ制限・タグ除去） */
function sanitizeText(text, maxLen) {
  if (typeof text !== 'string') return '';
  return text.replace(/<[^>]*>/g, '').slice(0, maxLen);
}

/** 背景色のサニタイズ（rgba形式のみ許可） */
function sanitizeColor(color) {
  if (typeof color !== 'string') return 'rgba(99,102,241,0.6)';
  // rgba(...) 形式のみ許可
  if (/^rgba?\(\s*[\d.,\s]+\)$/.test(color)) return color;
  return 'rgba(99,102,241,0.6)';
}

/**
 * JSONレスポンスを生成
 * GASをデプロイ設定「全員（匿名ユーザー含む）」にするとCORSは自動許可される
 */
function buildResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function buildError(message, code) {
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'error', code: code || 500, message: message }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ================================================================
//  テスト関数（GASエディタから実行して動作確認）
// ================================================================

function test_doGet() {
  const result = doGet({ parameter: { token: REQUEST_TOKEN } });
  Logger.log(result.getContent());
}

function test_add() {
  const result = doPost({
    postData: {
      contents: JSON.stringify({
        action: 'add',
        token:  REQUEST_TOKEN,
        name:   'テストアプリ',
        url:    'https://example.com',
        icon:   '🧪',
        color:  'rgba(99,102,241,0.6)',
        slot:   0,
      })
    }
  });
  Logger.log(result.getContent());
}

function test_delete() {
  // test_doGet() でIDを確認してから実行
  const result = doPost({
    postData: {
      contents: JSON.stringify({
        action: 'delete',
        token:  REQUEST_TOKEN,
        id:     'ここにIDを貼り付け',
      })
    }
  });
  Logger.log(result.getContent());
}

function test_invalidToken() {
  const result = doGet({ parameter: { token: 'wrongtoken' } });
  Logger.log(result.getContent()); // {"status":"error","code":403,...} が返るはず
}

function test_invalidUrl() {
  const result = doPost({
    postData: {
      contents: JSON.stringify({
        action: 'add',
        token:  REQUEST_TOKEN,
        name:   '危険テスト',
        url:    'javascript:alert(1)',
        icon:   '💀',
      })
    }
  });
  Logger.log(result.getContent()); // {"status":"error","code":400,...} が返るはず
}
