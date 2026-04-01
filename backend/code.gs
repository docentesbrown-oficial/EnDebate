const SHEET_NAME = 'Comentarios';
const HEADERS = ['id', 'note_id', 'parent_id', 'author', 'comment', 'status', 'created_at', 'updated_at', 'user_agent'];

function doGet(e) {
  try {
    const action = String((e && e.parameter && e.parameter.action) || 'list').toLowerCase();
    if (action !== 'list') {
      return output_({ ok: false, error: 'Acción no válida' }, e);
    }

    const noteId = sanitizeText_((e.parameter.note_id || '').trim(), 120);
    if (!noteId) {
      return output_({ ok: true, comments: [] }, e);
    }

    const sheet = getSheet_();
    ensureHeaders_(sheet);

    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) {
      return output_({ ok: true, comments: [] }, e);
    }

    const values = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
    const comments = values
      .filter(function (row) {
        return String(row[1]) === noteId && String(row[5]).toLowerCase() === 'publicado';
      })
      .map(function (row) {
        return {
          id: String(row[0] || ''),
          note_id: String(row[1] || ''),
          parent_id: String(row[2] || ''),
          author: String(row[3] || ''),
          comment: String(row[4] || ''),
          status: String(row[5] || ''),
          created_at: toIsoString_(row[6]),
          updated_at: toIsoString_(row[7])
        };
      });

    return output_({ ok: true, comments: comments }, e);
  } catch (error) {
    return output_({ ok: false, error: error.message || 'Error inesperado' }, e);
  }
}

function doPost(e) {
  try {
    const params = getParams_(e);
    const honeypot = String(params.website || '').trim();
    if (honeypot) {
      return htmlResponse_('ok');
    }

    const noteId = sanitizeText_(params.note_id || '', 120);
    const parentId = sanitizeText_(params.parent_id || '', 120);
    const author = sanitizeText_(params.author || '', 80) || 'Anónimo';
    const comment = sanitizeComment_(params.comment || '');
    const userAgent = sanitizeText_(params.ua || '', 400);

    if (!noteId) {
      return htmlResponse_('missing_note');
    }

    if (comment.length < 3) {
      return htmlResponse_('invalid_comment');
    }

    const sheet = getSheet_();
    ensureHeaders_(sheet);

    if (isDuplicate_(sheet, noteId, author, comment)) {
      return htmlResponse_('duplicate');
    }

    const now = new Date();
    const id = Utilities.getUuid();

    sheet.appendRow([
      id,
      noteId,
      parentId,
      author,
      comment,
      'publicado',
      now.toISOString(),
      now.toISOString(),
      userAgent
    ]);

    return htmlResponse_('saved');
  } catch (error) {
    return htmlResponse_('error');
  }
}

function getSheet_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) {
    throw new Error('Abrí este script desde una hoja de cálculo de Google.');
  }

  let sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME);
  }
  return sheet;
}

function ensureHeaders_(sheet) {
  const headerRange = sheet.getRange(1, 1, 1, HEADERS.length);
  const currentHeaders = headerRange.getValues()[0];

  const needsHeaders = HEADERS.some(function (header, index) {
    return currentHeaders[index] !== header;
  });

  if (needsHeaders) {
    headerRange.setValues([HEADERS]);
    sheet.setFrozenRows(1);
  }
}

function getParams_(e) {
  if (!e || !e.parameter) {
    return {};
  }
  return e.parameter;
}

function sanitizeText_(value, maxLength) {
  return String(value || '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength || 500);
}

function sanitizeComment_(value) {
  return String(value || '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim()
    .slice(0, 3000);
}

function isDuplicate_(sheet, noteId, author, comment) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return false;

  const maxRows = Math.min(50, lastRow - 1);
  const values = sheet.getRange(lastRow - maxRows + 1, 1, maxRows, HEADERS.length).getValues();

  return values.some(function (row) {
    return (
      String(row[1]) === noteId &&
      String(row[3]) === author &&
      String(row[4]) === comment
    );
  });
}

function toIsoString_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value)) {
    return value.toISOString();
  }
  const asDate = new Date(value);
  if (!isNaN(asDate)) {
    return asDate.toISOString();
  }
  return '';
}

function output_(payload, e) {
  const json = JSON.stringify(payload);
  const callback = e && e.parameter && e.parameter.callback;

  if (callback && /^[a-zA-Z0-9_$.]+$/.test(callback)) {
    return ContentService
      .createTextOutput(callback + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

function htmlResponse_(message) {
  return HtmlService.createHtmlOutput(
    '<!doctype html><html><body style="font-family:Arial,sans-serif;padding:12px;">' +
    String(message || 'ok') +
    '</body></html>'
  );
}