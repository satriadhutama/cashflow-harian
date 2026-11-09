/**
 * Cashflow Harian — Telegram bot + Google Sheets.
 * Runtime: Google Apps Script (V8).
 *
 * Script Properties yang wajib:
 * - BOT_TOKEN: token dari @BotFather
 * - WEB_APP_URL: URL deployment Web App Apps Script
 *
 * Opsional:
 * - ADMIN_USER_ID: Telegram user ID admin. Jika diisi, hanya admin dan user
 *   yang sudah diizinkan melalui /izinkan <user_id> yang dapat memakai bot.
 */

const APP = Object.freeze({
  NAME: 'Cashflow Harian',
  TZ: 'Asia/Jakarta',
  USERS_SHEET: 'Pengguna',
  TX_SHEET: 'Transaksi',
  DASHBOARD_SHEET: 'Ringkasan',
  BUDGET_SHEET: 'Anggaran',
  CATEGORIES_SHEET: 'Kategori',
  MAX_MESSAGE: 3900,
  INCOME_CATEGORIES: ['Gaji', 'Bonus', 'Freelance', 'Penjualan', 'Hadiah', 'Investasi', 'Lainnya'],
  EXPENSE_CATEGORIES: [
    'Makan & Minum', 'Transportasi', 'Belanja', 'Tagihan', 'Kesehatan',
    'Pendidikan', 'Hiburan', 'Keluarga', 'Sedekah', 'Cicilan', 'Investasi', 'Lainnya'
  ],
  PAYMENT_METHODS: ['Tunai', 'Transfer Bank', 'Kartu Debit', 'Kartu Kredit', 'GoPay', 'OVO', 'DANA', 'ShopeePay', 'Lainnya']
});

function doGet() {
  return ContentService.createTextOutput(APP.NAME + ' aktif.');
}

function doPost(e) {
  try {
    const update = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    handleUpdate_(update);
  } catch (err) {
    console.error(err && err.stack ? err.stack : err);
  }
  return ContentService.createTextOutput('ok');
}

function handleUpdate_(update) {
  const message = update.message;
  if (!message || !message.chat || !message.from) return;
  const chatId = String(message.chat.id);
  const userId = String(message.from.id);

  if (message.chat.type !== 'private') {
    sendMessage_(chatId, 'Demi privasi, gunakan bot ini melalui chat pribadi.');
    return;
  }
  if (!message.text) {
    sendMessage_(chatId, 'Saya hanya menerima input berupa teks. Ketik /bantuan untuk melihat contoh.');
    return;
  }

  const text = message.text.trim();
  if (!isAllowed_(userId)) {
    sendMessage_(chatId, 'Akun Anda belum diizinkan.\n\nUser ID Anda: ' + userId + '\nKirim ID ini kepada pengelola bot.');
    return;
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    routeText_(chatId, userId, message.from, text);
  } finally {
    lock.releaseLock();
  }
}

function routeText_(chatId, userId, from, text) {
  const first = text.split(/\s+/)[0].toLowerCase().split('@')[0];
  const command = first.charAt(0) === '/' ? first : '';

  if (command === '/start' || command === '/mulai') return showWelcome_(chatId, userId, from);
  if (command === '/bantuan' || command === '/help') return showHelp_(chatId);
  if (command === '/id') return sendMessage_(chatId, 'User ID Anda: ' + userId);
  if (command === '/izinkan') return allowUserCommand_(chatId, userId, text);
  if (command === '/blokir') return blockUserCommand_(chatId, userId, text);

  const user = getOrCreateUser_(userId, from);
  if (command === '/sheet') return sendMessage_(chatId, 'Sheet pribadi Anda:\n' + user.spreadsheetUrl);
  if (command === '/hariini') return sendPeriodReport_(chatId, user, 'today');
  if (command === '/mingguini') return sendPeriodReport_(chatId, user, 'week');
  if (command === '/bulanini') return sendPeriodReport_(chatId, user, 'month');
  if (command === '/saldo') return sendBalance_(chatId, user);
  if (command === '/laporan') return sendPeriodReport_(chatId, user, parseReportPeriod_(text));
  if (command === '/anggaran') return handleBudgetCommand_(chatId, user, text);
  if (command === '/hapus') return deleteLastTransaction_(chatId, user);
  if (command) return sendMessage_(chatId, 'Perintah tidak dikenal. Ketik /bantuan untuk melihat daftar perintah.');

  const parsed = parseTransaction_(text, new Date());
  if (!parsed.ok) {
    sendMessage_(chatId, parsed.error + '\n\nContoh: keluar 25rb makan siang tunai');
    return;
  }
  appendTransaction_(user, parsed, text);
  const sign = parsed.type === 'Pemasukan' ? '+' : '-';
  sendMessage_(chatId,
    'Tercatat.\n\n' +
    parsed.type + ': ' + sign + formatRupiah_(parsed.amount) + '\n' +
    'Kategori: ' + parsed.category + '\n' +
    'Keterangan: ' + parsed.description + '\n' +
    'Pembayaran: ' + parsed.paymentMethod + '\n' +
    'Tanggal: ' + formatDateLong_(parsed.date) + '\n\n' +
    'Ketik /hariini untuk melihat ringkasan hari ini.'
  );
}

function showWelcome_(chatId, userId, from) {
  const user = getOrCreateUser_(userId, from);
  sendMessage_(chatId,
    'Selamat datang di ' + APP.NAME + '.\n\n' +
    'Catat transaksi cukup dengan chat, misalnya:\n' +
    '• makan siang 25rb tunai\n' +
    '• masuk 5jt gaji transfer\n' +
    '• kemarin bensin 100rb gopay\n\n' +
    'Setiap pengguna memiliki file terpisah. Data Anda tidak tercampur dengan pengguna lain.\n\n' +
    'Sheet pribadi:\n' + user.spreadsheetUrl + '\n\n' +
    'Ketik /bantuan untuk semua perintah.'
  );
}

function showHelp_(chatId) {
  sendMessage_(chatId,
    'Cara mencatat\n' +
    '• keluar 25000 makan siang tunai\n' +
    '• makan siang 25rb\n' +
    '• masuk 5jt gaji transfer\n' +
    '• kemarin bensin 100rb gopay\n' +
    '• 5 november bayar listrik 450rb\n\n' +
    'Ringkasan\n' +
    '/hariini — laporan hari ini\n' +
    '/mingguini — laporan minggu ini\n' +
    '/bulanini — laporan bulan ini\n' +
    '/laporan 2026-11 — laporan bulan tertentu\n' +
    '/saldo — saldo sepanjang waktu\n\n' +
    'Anggaran\n' +
    '/anggaran — status anggaran bulan ini\n' +
    '/anggaran makan 1500000 — pasang batas bulanan\n\n' +
    'Lainnya\n' +
    '/sheet — buka Google Sheet pribadi\n' +
    '/hapus — hapus transaksi terakhir\n' +
    '/id — lihat user ID\n' +
    '/bantuan — tampilkan panduan ini'
  );
}

function parseTransaction_(input, now) {
  const original = String(input || '').trim();
  let text = original.toLowerCase().replace(/\s+/g, ' ');
  const amountResult = extractAmount_(text);
  if (!amountResult) return { ok: false, error: 'Nominal belum terbaca.' };

  const type = detectType_(text);
  const dateResult = extractDate_(text, now);
  const payment = detectPaymentMethod_(text);
  const category = detectCategory_(text, type);

  let description = text;
  [amountResult.raw, dateResult.raw, payment.raw].forEach(function (part) {
    if (part) description = description.replace(part, ' ');
  });
  description = description
    .replace(/\b(masuk|pemasukan|pendapatan|terima|dapat|dapet|gaji masuk|keluar|pengeluaran|belanja|bayar|beli)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!description) description = category;
  description = titleCase_(description);

  if (!isFinite(amountResult.amount) || amountResult.amount <= 0) {
    return { ok: false, error: 'Nominal harus lebih besar dari nol.' };
  }
  if (dateResult.date.getTime() > endOfDay_(now).getTime()) {
    return { ok: false, error: 'Tanggal transaksi tidak boleh berada di masa depan.' };
  }
  return {
    ok: true,
    date: dateResult.date,
    type: type,
    category: category,
    description: description,
    amount: Math.round(amountResult.amount),
    paymentMethod: payment.method,
    rawText: original
  };
}

function extractAmount_(text) {
  const matches = [];
  const regex = /(?:rp\s*)?(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)(?:\s*)(jt|juta|rb|ribu|k)?\b/gi;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const raw = match[0];
    const suffix = (match[2] || '').toLowerCase();
    let numeric = match[1];
    let value;
    if (suffix) {
      numeric = numeric.replace(',', '.');
      value = parseFloat(numeric.replace(/\.(?=\d{3}(?:\D|$))/g, ''));
      if (suffix === 'jt' || suffix === 'juta') value *= 1000000;
      else if (suffix === 'rb' || suffix === 'ribu' || suffix === 'k') value *= 1000;
    } else {
      value = parseFloat(numeric.replace(/[.,]/g, ''));
    }
    if (isFinite(value)) matches.push({ raw: raw, amount: value, index: match.index });
  }
  if (!matches.length) return null;
  const likely = matches.filter(function (item) { return item.amount >= 1000 || /rp|jt|juta|rb|ribu|k/i.test(item.raw); });
  return (likely.length ? likely : matches)[0];
}

function detectType_(text) {
  if (/\b(masuk|pemasukan|pendapatan|terima|diterima|dapat|dapet|gaji|bonus|freelance|honor|penjualan)\b/i.test(text)) {
    return 'Pemasukan';
  }
  return 'Pengeluaran';
}

function extractDate_(text, now) {
  const base = startOfDay_(now);
  if (/\bkemarin\b/i.test(text)) return { date: addDays_(base, -1), raw: 'kemarin' };
  if (/\b(lusa lalu|2 hari lalu)\b/i.test(text)) {
    const raw = text.match(/\b(lusa lalu|2 hari lalu)\b/i)[0];
    return { date: addDays_(base, -2), raw: raw };
  }
  const daysAgo = text.match(/\b(\d{1,3})\s+hari\s+lalu\b/i);
  if (daysAgo) return { date: addDays_(base, -Number(daysAgo[1])), raw: daysAgo[0] };

  const iso = text.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) return { date: safeDate_(Number(iso[1]), Number(iso[2]), Number(iso[3]), base), raw: iso[0] };
  const slash = text.match(/\b(\d{1,2})[\/-](\d{1,2})(?:[\/-](20\d{2}))?\b/);
  if (slash) return { date: safeDate_(Number(slash[3] || base.getFullYear()), Number(slash[2]), Number(slash[1]), base), raw: slash[0] };

  const months = { januari: 1, jan: 1, februari: 2, feb: 2, maret: 3, mar: 3, april: 4, apr: 4, mei: 5, juni: 6, jun: 6, juli: 7, jul: 7, agustus: 8, agu: 8, september: 9, sep: 9, oktober: 10, okt: 10, november: 11, nov: 11, desember: 12, des: 12 };
  const named = text.match(/\b(\d{1,2})\s+(januari|jan|februari|feb|maret|mar|april|apr|mei|juni|jun|juli|jul|agustus|agu|september|sep|oktober|okt|november|nov|desember|des)(?:\s+(20\d{2}))?\b/i);
  if (named) return { date: safeDate_(Number(named[3] || base.getFullYear()), months[named[2].toLowerCase()], Number(named[1]), base), raw: named[0].toLowerCase() };
  return { date: base, raw: /\bhari ini\b/i.test(text) ? text.match(/\bhari ini\b/i)[0] : '' };
}

function safeDate_(year, month, day, fallback) {
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return fallback;
  return date;
}

function detectPaymentMethod_(text) {
  const rules = [
    [/\b(gopay|go pay)\b/i, 'GoPay'], [/\bovo\b/i, 'OVO'], [/\bdana\b/i, 'DANA'],
    [/\b(shopeepay|shopee pay)\b/i, 'ShopeePay'], [/\b(kartu kredit|credit card|cc)\b/i, 'Kartu Kredit'],
    [/\b(kartu debit|debit)\b/i, 'Kartu Debit'], [/\b(transfer|bank|mbanking|m-banking)\b/i, 'Transfer Bank'],
    [/\b(tunai|cash)\b/i, 'Tunai']
  ];
  for (let i = 0; i < rules.length; i++) {
    const match = text.match(rules[i][0]);
    if (match) return { method: rules[i][1], raw: match[0].toLowerCase() };
  }
  return { method: 'Tidak disebutkan', raw: '' };
}

function detectCategory_(text, type) {
  const rules = type === 'Pemasukan' ? [
    [/\b(gaji|salary)\b/i, 'Gaji'], [/\bbonus\b/i, 'Bonus'], [/\b(freelance|proyek|project|honor)\b/i, 'Freelance'],
    [/\b(jual|penjualan)\b/i, 'Penjualan'], [/\b(hadiah|gift)\b/i, 'Hadiah'], [/\b(dividen|bunga|investasi)\b/i, 'Investasi']
  ] : [
    [/\b(makan|minum|kopi|sarapan|lunch|dinner|warteg|restoran|jajan)\b/i, 'Makan & Minum'],
    [/\b(bensin|bbm|parkir|tol|ojek|grab|gojek|taksi|bus|kereta|transport)\b/i, 'Transportasi'],
    [/\b(listrik|air|internet|wifi|pulsa|token|tagihan)\b/i, 'Tagihan'],
    [/\b(obat|dokter|rumah sakit|klinik|kesehatan)\b/i, 'Kesehatan'],
    [/\b(sekolah|kuliah|kursus|buku|pendidikan)\b/i, 'Pendidikan'],
    [/\b(nonton|bioskop|game|liburan|hiburan)\b/i, 'Hiburan'],
    [/\b(anak|orang tua|keluarga)\b/i, 'Keluarga'],
    [/\b(sedekah|zakat|donasi)\b/i, 'Sedekah'],
    [/\b(cicilan|kredit|angsuran)\b/i, 'Cicilan'],
    [/\b(saham|reksa dana|reksadana|emas|crypto|kripto|investasi)\b/i, 'Investasi'],
    [/\b(beli|belanja|shopping|baju|sepatu|perabot)\b/i, 'Belanja']
  ];
  for (let i = 0; i < rules.length; i++) if (rules[i][0].test(text)) return rules[i][1];
  return 'Lainnya';
}

function getOrCreateUser_(userId, from) {
  const registry = getRegistrySheet_();
  const values = registry.getDataRange().getValues();
  for (let row = 1; row < values.length; row++) {
    if (String(values[row][0]) === String(userId)) {
      registry.getRange(row + 1, 3, 1, 2).setValues([[telegramName_(from), new Date()]]);
      return { userId: userId, spreadsheetId: values[row][4], spreadsheetUrl: values[row][5] };
    }
  }
  const personal = createPersonalSpreadsheet_(userId, from);
  registry.appendRow([userId, from.username || '', telegramName_(from), new Date(), personal.id, personal.url, 'Aktif']);
  return { userId: userId, spreadsheetId: personal.id, spreadsheetUrl: personal.url };
}

function getRegistrySheet_() {
  const props = PropertiesService.getScriptProperties();
  let registryId = props.getProperty('REGISTRY_SHEET_ID');
  let ss;
  if (!registryId) {
    ss = SpreadsheetApp.create(APP.NAME + ' - Daftar Pengguna');
    registryId = ss.getId();
    props.setProperty('REGISTRY_SHEET_ID', registryId);
  } else {
    ss = SpreadsheetApp.openById(registryId);
  }
  let sheet = ss.getSheetByName(APP.USERS_SHEET);
  if (!sheet) {
    sheet = ss.getSheets()[0];
    sheet.setName(APP.USERS_SHEET);
    sheet.getRange(1, 1, 1, 7).setValues([['Telegram User ID', 'Username', 'Nama', 'Terakhir Aktif', 'Spreadsheet ID', 'Spreadsheet URL', 'Status']]);
    styleHeader_(sheet.getRange('A1:G1'));
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, 7);
  }
  return sheet;
}

function createPersonalSpreadsheet_(userId, from) {
  const ss = SpreadsheetApp.create(APP.NAME + ' - ' + telegramName_(from) + ' (' + userId + ')');
  ss.setSpreadsheetTimeZone(APP.TZ);
  const dashboard = ss.getSheets()[0];
  dashboard.setName(APP.DASHBOARD_SHEET);
  const tx = ss.insertSheet(APP.TX_SHEET);
  const budget = ss.insertSheet(APP.BUDGET_SHEET);
  const categories = ss.insertSheet(APP.CATEGORIES_SHEET);

  setupTransactionSheet_(tx);
  setupBudgetSheet_(budget);
  setupCategorySheet_(categories);
  setupDashboardSheet_(dashboard);
  return { id: ss.getId(), url: ss.getUrl() };
}

function setupTransactionSheet_(sheet) {
  const headers = ['ID', 'Tanggal', 'Waktu Dicatat', 'Jenis', 'Kategori', 'Keterangan', 'Nominal', 'Metode Pembayaran', 'Input Asli'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  styleHeader_(sheet.getRange(1, 1, 1, headers.length));
  sheet.setFrozenRows(1);
  sheet.getRange('B:B').setNumberFormat('dd mmm yyyy');
  sheet.getRange('C:C').setNumberFormat('dd mmm yyyy HH:mm');
  sheet.getRange('G:G').setNumberFormat('Rp#,##0;[Red]-Rp#,##0;–');
  [130, 110, 145, 100, 130, 220, 120, 145, 260].forEach(function (width, i) { sheet.setColumnWidth(i + 1, width); });
  sheet.getRange('A:A').setFontColor('#6B7280');
  sheet.getRange('A1:I1').createFilter();
}

function setupBudgetSheet_(sheet) {
  sheet.getRange('A1:D1').setValues([['Kategori', 'Anggaran Bulanan', 'Terpakai Bulan Ini', 'Sisa']]);
  styleHeader_(sheet.getRange('A1:D1'));
  const rows = APP.EXPENSE_CATEGORIES.map(function (category) { return [category, '', '', '']; });
  sheet.getRange(2, 1, rows.length, 4).setValues(rows);
  for (let row = 2; row < rows.length + 2; row++) {
    sheet.getRange(row, 3).setFormula('=SUMIFS(Transaksi!$G:$G,Transaksi!$D:$D,"Pengeluaran",Transaksi!$E:$E,$A' + row + ',Transaksi!$B:$B,">="&EOMONTH(TODAY(),-1)+1,Transaksi!$B:$B,"<="&EOMONTH(TODAY(),0))');
    sheet.getRange(row, 4).setFormula('=IF(B' + row + '="","",B' + row + '-C' + row + ')');
  }
  sheet.getRange('B2:D100').setNumberFormat('Rp#,##0;[Red]-Rp#,##0;–');
  sheet.getRange('B2:B100').setBackground('#FFF4CC').setFontColor('#1D4ED8');
  sheet.setFrozenRows(1);
  sheet.setColumnWidths(1, 1, 180);
  sheet.setColumnWidths(2, 3, 150);
}

function setupCategorySheet_(sheet) {
  sheet.getRange('A1:C1').setValues([['Jenis', 'Kategori', 'Keterangan']]);
  styleHeader_(sheet.getRange('A1:C1'));
  const rows = [];
  APP.INCOME_CATEGORIES.forEach(function (c) { rows.push(['Pemasukan', c, '']); });
  APP.EXPENSE_CATEGORIES.forEach(function (c) { rows.push(['Pengeluaran', c, '']); });
  sheet.getRange(2, 1, rows.length, 3).setValues(rows);
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(1, 120);
  sheet.setColumnWidth(2, 180);
  sheet.setColumnWidth(3, 260);
}

function setupDashboardSheet_(sheet) {
  sheet.setHiddenGridlines(true);
  sheet.getRange('A2:H2').merge().setValue('Cashflow Harian').setFontSize(16).setFontWeight('bold').setFontColor('#17324D');
  sheet.getRange('A3:H3').merge().setValue('Ringkasan otomatis dalam Rupiah').setFontStyle('italic').setFontColor('#64748B');
  sheet.getRange('A5:B5').merge().setValue('Bulan Ini');
  sheet.getRange('D5:E5').merge().setValue('Pemasukan');
  sheet.getRange('G5:H5').merge().setValue('Pengeluaran');
  sheet.getRange('A6:B7').merge().setFormula('=TEXT(TODAY(),"mmmm yyyy")');
  sheet.getRange('D6:E7').merge().setFormula('=SUMIFS(Transaksi!G:G,Transaksi!D:D,"Pemasukan",Transaksi!B:B,">="&EOMONTH(TODAY(),-1)+1,Transaksi!B:B,"<="&EOMONTH(TODAY(),0))');
  sheet.getRange('G6:H7').merge().setFormula('=SUMIFS(Transaksi!G:G,Transaksi!D:D,"Pengeluaran",Transaksi!B:B,">="&EOMONTH(TODAY(),-1)+1,Transaksi!B:B,"<="&EOMONTH(TODAY(),0))');
  sheet.getRange('A9:B9').merge().setValue('Sisa Cashflow');
  sheet.getRange('D9:E9').merge().setValue('Saldo Keseluruhan');
  sheet.getRange('G9:H9').merge().setValue('Jumlah Transaksi');
  sheet.getRange('A10:B11').merge().setFormula('=D6-G6');
  sheet.getRange('D10:E11').merge().setFormula('=SUMIFS(Transaksi!G:G,Transaksi!D:D,"Pemasukan")-SUMIFS(Transaksi!G:G,Transaksi!D:D,"Pengeluaran")');
  sheet.getRange('G10:H11').merge().setFormula('=COUNTA(Transaksi!A2:A)');
  sheet.getRange('A5:H5').setBackground('#17324D').setFontColor('#FFFFFF').setFontWeight('bold').setHorizontalAlignment('center');
  sheet.getRange('A9:H9').setBackground('#E2E8F0').setFontColor('#17324D').setFontWeight('bold').setHorizontalAlignment('center');
  sheet.getRange('A6:H11').setVerticalAlignment('middle').setHorizontalAlignment('center');
  sheet.getRange('A6:H11').setFontSize(12);
  sheet.getRange('D6:E7').setBackground('#DCFCE7');
  sheet.getRange('G6:H7').setBackground('#FEE2E2');
  sheet.getRange('A10:E11').setBackground('#F8FAFC');
  sheet.getRange('D6:H7').setNumberFormat('Rp#,##0;[Red]-Rp#,##0;–');
  sheet.getRange('A10:E11').setNumberFormat('Rp#,##0;[Red]-Rp#,##0;–');
  sheet.getRange('A14:C14').setValues([['Kategori Pengeluaran', 'Bulan Ini', 'Persentase']]);
  styleHeader_(sheet.getRange('A14:C14'));
  APP.EXPENSE_CATEGORIES.forEach(function (category, index) {
    const row = index + 15;
    sheet.getRange(row, 1).setValue(category);
    sheet.getRange(row, 2).setFormula('=SUMIFS(Transaksi!G:G,Transaksi!D:D,"Pengeluaran",Transaksi!E:E,A' + row + ',Transaksi!B:B,">="&EOMONTH(TODAY(),-1)+1,Transaksi!B:B,"<="&EOMONTH(TODAY(),0))');
    sheet.getRange(row, 3).setFormula('=IFERROR(B' + row + '/$G$6,0)');
  });
  sheet.getRange('B15:B30').setNumberFormat('Rp#,##0;[Red]-Rp#,##0;–');
  sheet.getRange('C15:C30').setNumberFormat('0.0%');
  sheet.setColumnWidths(1, 8, 115);
  sheet.setRowHeights(6, 2, 32);
  sheet.setRowHeights(10, 2, 32);
}

function styleHeader_(range) {
  range.setBackground('#17324D').setFontColor('#FFFFFF').setFontWeight('bold').setHorizontalAlignment('center').setVerticalAlignment('middle');
}

function appendTransaction_(user, tx, rawText) {
  const ss = SpreadsheetApp.openById(user.spreadsheetId);
  const sheet = ss.getSheetByName(APP.TX_SHEET);
  sheet.appendRow([
    Utilities.getUuid(), tx.date, new Date(), tx.type, tx.category,
    tx.description, tx.amount, tx.paymentMethod, rawText
  ]);
}

function readTransactions_(user) {
  const sheet = SpreadsheetApp.openById(user.spreadsheetId).getSheetByName(APP.TX_SHEET);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, 9).getValues().map(function (row, index) {
    return { row: index + 2, id: row[0], date: new Date(row[1]), createdAt: new Date(row[2]), type: row[3], category: row[4], description: row[5], amount: Number(row[6]) || 0, paymentMethod: row[7], rawText: row[8] };
  });
}

function sendPeriodReport_(chatId, user, period) {
  const range = getPeriodRange_(period, new Date());
  const txs = readTransactions_(user).filter(function (tx) { return tx.date >= range.start && tx.date <= range.end; });
  const summary = summarize_(txs);
  let text = 'Laporan ' + range.label + '\n\n' +
    'Pemasukan: ' + formatRupiah_(summary.income) + '\n' +
    'Pengeluaran: ' + formatRupiah_(summary.expense) + '\n' +
    'Cashflow bersih: ' + formatSignedRupiah_(summary.income - summary.expense) + '\n' +
    'Jumlah transaksi: ' + txs.length;
  if (summary.expenseByCategory.length) {
    text += '\n\nPengeluaran terbesar';
    summary.expenseByCategory.slice(0, 5).forEach(function (item) { text += '\n• ' + item.category + ': ' + formatRupiah_(item.amount); });
  }
  text += '\n\nSheet: ' + user.spreadsheetUrl;
  sendMessage_(chatId, text);
}

function sendBalance_(chatId, user) {
  const summary = summarize_(readTransactions_(user));
  sendMessage_(chatId,
    'Saldo Keseluruhan\n\n' +
    'Total pemasukan: ' + formatRupiah_(summary.income) + '\n' +
    'Total pengeluaran: ' + formatRupiah_(summary.expense) + '\n' +
    'Saldo: ' + formatSignedRupiah_(summary.income - summary.expense)
  );
}

function summarize_(txs) {
  const categoryMap = {};
  let income = 0;
  let expense = 0;
  txs.forEach(function (tx) {
    if (tx.type === 'Pemasukan') income += tx.amount;
    else {
      expense += tx.amount;
      categoryMap[tx.category] = (categoryMap[tx.category] || 0) + tx.amount;
    }
  });
  return {
    income: income,
    expense: expense,
    expenseByCategory: Object.keys(categoryMap).map(function (category) { return { category: category, amount: categoryMap[category] }; }).sort(function (a, b) { return b.amount - a.amount; })
  };
}

function handleBudgetCommand_(chatId, user, text) {
  const rest = text.replace(/^\/anggaran(?:@\w+)?/i, '').trim();
  if (!rest) return sendBudgetStatus_(chatId, user);
  const amountResult = extractAmount_(rest.toLowerCase());
  if (!amountResult) return sendMessage_(chatId, 'Format belum tepat. Contoh: /anggaran makan 1500000');
  const categoryText = rest.toLowerCase().replace(amountResult.raw.toLowerCase(), '').trim();
  const category = detectCategory_(categoryText, 'Pengeluaran');
  if (category === 'Lainnya' && categoryText && categoryText !== 'lainnya') {
    return sendMessage_(chatId, 'Kategori belum dikenali. Coba: makan, transportasi, belanja, tagihan, kesehatan, pendidikan, hiburan, keluarga, sedekah, cicilan, investasi, atau lainnya.');
  }
  const sheet = SpreadsheetApp.openById(user.spreadsheetId).getSheetByName(APP.BUDGET_SHEET);
  const categories = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  for (let i = 0; i < categories.length; i++) {
    if (categories[i][0] === category) {
      sheet.getRange(i + 2, 2).setValue(Math.round(amountResult.amount));
      sendMessage_(chatId, 'Anggaran ' + category + ' ditetapkan menjadi ' + formatRupiah_(amountResult.amount) + ' per bulan.');
      return;
    }
  }
}

function sendBudgetStatus_(chatId, user) {
  const sheet = SpreadsheetApp.openById(user.spreadsheetId).getSheetByName(APP.BUDGET_SHEET);
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues();
  const active = rows.filter(function (row) { return Number(row[1]) > 0; });
  if (!active.length) {
    sendMessage_(chatId, 'Belum ada anggaran.\n\nContoh: /anggaran makan 1500000');
    return;
  }
  let text = 'Anggaran Bulan Ini';
  active.forEach(function (row) {
    const budget = Number(row[1]) || 0;
    const used = Number(row[2]) || 0;
    const percentage = budget ? Math.round(used / budget * 100) : 0;
    text += '\n\n' + row[0] + '\nTerpakai ' + formatRupiah_(used) + ' dari ' + formatRupiah_(budget) + ' (' + percentage + '%)';
  });
  sendMessage_(chatId, text);
}

function deleteLastTransaction_(chatId, user) {
  const sheet = SpreadsheetApp.openById(user.spreadsheetId).getSheetByName(APP.TX_SHEET);
  if (sheet.getLastRow() < 2) return sendMessage_(chatId, 'Belum ada transaksi yang bisa dihapus.');
  const row = sheet.getRange(sheet.getLastRow(), 1, 1, 9).getValues()[0];
  sheet.deleteRow(sheet.getLastRow());
  sendMessage_(chatId, 'Transaksi terakhir dihapus:\n' + row[3] + ' ' + formatRupiah_(row[6]) + ' — ' + row[5]);
}

function getPeriodRange_(period, now) {
  const today = startOfDay_(now);
  if (period && period.kind === 'customMonth') {
    const start = new Date(period.year, period.month - 1, 1);
    return { start: start, end: endOfDay_(new Date(period.year, period.month, 0)), label: formatMonthYear_(start) };
  }
  if (period === 'week') {
    const day = today.getDay() || 7;
    const start = addDays_(today, 1 - day);
    return { start: start, end: endOfDay_(addDays_(start, 6)), label: 'Minggu Ini' };
  }
  if (period === 'month') return { start: new Date(today.getFullYear(), today.getMonth(), 1), end: endOfDay_(new Date(today.getFullYear(), today.getMonth() + 1, 0)), label: 'Bulan Ini' };
  return { start: today, end: endOfDay_(today), label: 'Hari Ini' };
}

function parseReportPeriod_(text) {
  const match = text.match(/\b(20\d{2})-(\d{1,2})\b/);
  if (match && Number(match[2]) >= 1 && Number(match[2]) <= 12) return { kind: 'customMonth', year: Number(match[1]), month: Number(match[2]) };
  return 'month';
}

function setWebhook() {
  const props = PropertiesService.getScriptProperties();
  const token = requiredProperty_('BOT_TOKEN');
  const webAppUrl = requiredProperty_('WEB_APP_URL');
  const response = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/setWebhook', {
    method: 'post', contentType: 'application/json', payload: JSON.stringify({ url: webAppUrl }), muteHttpExceptions: true
  });
  console.log(response.getContentText());
}

function removeWebhook() {
  const token = requiredProperty_('BOT_TOKEN');
  console.log(UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/deleteWebhook').getContentText());
}

function setBotCommands() {
  const token = requiredProperty_('BOT_TOKEN');
  const commands = [
    { command: 'hariini', description: 'Ringkasan hari ini' },
    { command: 'mingguini', description: 'Ringkasan minggu ini' },
    { command: 'bulanini', description: 'Ringkasan bulan ini' },
    { command: 'saldo', description: 'Saldo keseluruhan' },
    { command: 'anggaran', description: 'Anggaran bulan ini' },
    { command: 'sheet', description: 'Buka Google Sheet pribadi' },
    { command: 'hapus', description: 'Hapus transaksi terakhir' },
    { command: 'bantuan', description: 'Panduan penggunaan' }
  ];
  console.log(UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/setMyCommands', {
    method: 'post', contentType: 'application/json', payload: JSON.stringify({ commands: commands }), muteHttpExceptions: true
  }).getContentText());
}

function allowUserCommand_(chatId, requesterId, text) {
  const adminId = PropertiesService.getScriptProperties().getProperty('ADMIN_USER_ID');
  if (!adminId || String(requesterId) !== String(adminId)) return sendMessage_(chatId, 'Perintah ini hanya untuk admin.');
  const match = text.match(/\b(\d{5,})\b/);
  if (!match) return sendMessage_(chatId, 'Format: /izinkan USER_ID');
  const allowed = getAllowedUsers_();
  if (allowed.indexOf(match[1]) < 0) allowed.push(match[1]);
  PropertiesService.getScriptProperties().setProperty('ALLOWED_USER_IDS', allowed.join(','));
  sendMessage_(chatId, 'User ' + match[1] + ' sudah diizinkan.');
}

function blockUserCommand_(chatId, requesterId, text) {
  const adminId = PropertiesService.getScriptProperties().getProperty('ADMIN_USER_ID');
  if (!adminId || String(requesterId) !== String(adminId)) return sendMessage_(chatId, 'Perintah ini hanya untuk admin.');
  const match = text.match(/\b(\d{5,})\b/);
  if (!match) return sendMessage_(chatId, 'Format: /blokir USER_ID');
  const allowed = getAllowedUsers_().filter(function (id) { return id !== match[1]; });
  PropertiesService.getScriptProperties().setProperty('ALLOWED_USER_IDS', allowed.join(','));
  sendMessage_(chatId, 'User ' + match[1] + ' sudah diblokir.');
}

function isAllowed_(userId) {
  const adminId = PropertiesService.getScriptProperties().getProperty('ADMIN_USER_ID');
  if (!adminId) return true;
  return String(userId) === String(adminId) || getAllowedUsers_().indexOf(String(userId)) >= 0;
}

function getAllowedUsers_() {
  const raw = PropertiesService.getScriptProperties().getProperty('ALLOWED_USER_IDS') || '';
  return raw.split(',').map(function (id) { return id.trim(); }).filter(Boolean);
}

function sendMessage_(chatId, text) {
  const token = requiredProperty_('BOT_TOKEN');
  const chunks = splitMessage_(String(text), APP.MAX_MESSAGE);
  chunks.forEach(function (chunk) {
    UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'post', contentType: 'application/json',
      payload: JSON.stringify({ chat_id: chatId, text: chunk, disable_web_page_preview: true }),
      muteHttpExceptions: true
    });
  });
}

function requiredProperty_(name) {
  const value = PropertiesService.getScriptProperties().getProperty(name);
  if (!value) throw new Error('Script Property ' + name + ' belum diisi.');
  return value;
}

function splitMessage_(text, maxLength) {
  const parts = [];
  let remaining = text;
  while (remaining.length > maxLength) {
    let cut = remaining.lastIndexOf('\n', maxLength);
    if (cut < maxLength * 0.5) cut = maxLength;
    parts.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut).replace(/^\n+/, '');
  }
  if (remaining) parts.push(remaining);
  return parts;
}

function telegramName_(from) {
  return [from.first_name || '', from.last_name || ''].join(' ').trim() || from.username || String(from.id);
}

function formatRupiah_(amount) {
  const rounded = Math.round(Number(amount) || 0);
  return 'Rp' + String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function formatSignedRupiah_(amount) {
  return (amount >= 0 ? '+' : '-') + formatRupiah_(Math.abs(amount));
}

function formatDateLong_(date) {
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  return days[date.getDay()] + ', ' + date.getDate() + ' ' + months[date.getMonth()] + ' ' + date.getFullYear();
}

function formatMonthYear_(date) {
  const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  return months[date.getMonth()] + ' ' + date.getFullYear();
}

function titleCase_(text) {
  return text.replace(/\b\w/g, function (char) { return char.toUpperCase(); });
}

function startOfDay_(date) { return new Date(date.getFullYear(), date.getMonth(), date.getDate()); }
function endOfDay_(date) { return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999); }
function addDays_(date, days) { const result = new Date(date); result.setDate(result.getDate() + days); return result; }
