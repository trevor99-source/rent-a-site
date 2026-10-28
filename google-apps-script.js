/**
 * RentMyWebsite: Google Sheet for orders, leads and payment dates
 * Sign in as phibion96@gmail.com and create the sheet from that account.
 *
 * WHAT IT DOES
 * - Your website (Cloudflare) sends every receipt/order and every contact message, free-call request and job
 *   application to this script. They appear in the "Orders" and "Leads" tabs. Cloudflare keeps its own copy too.
 * - Orders start as Pending (yellow). When you change Status to Done (green) the sheet stamps the date and TIME
 *   the payment was confirmed and works out the NEXT PAYMENT date and time, then tells Cloudflare.
 * - Every morning at 08:00 you get an email listing payments that are due within 3 days or overdue.
 * - When a client pays again, select their row and use the menu: RentMyWebsite > Mark renewal paid.
 *
 * SETUP (about 10 minutes)
 * 1. Go to sheets.google.com and create a Sheet called "RentMyWebsite Orders".
 *    Then File > Settings > Time zone: (GMT+02:00) Johannesburg.
 * 2. Extensions > Apps Script. Delete the sample code and paste ALL of this file in.
 * 3. Set the four values below:
 *      KEY       a long secret you make up. Use the SAME value as SHEET_KEY in Cloudflare.
 *      ADMIN_KEY another long secret. Use the SAME value as ADMIN_KEY in Cloudflare.
 *      CF_URL    your website address, for example https://rentasite.co.za (or your *.pages.dev address).
 *      NOTIFY    where emails go.
 * 4. Click Save. Pick the function "setup" and click Run. Approve the permissions Google asks for.
 *    This creates the tabs, the Pending/Done drop-down, colours, and the 08:00 reminder and edit triggers.
 * 5. Click Deploy > New deployment > type "Web app". Execute as: Me. Who has access: Anyone. Deploy.
 *    Copy the Web app URL and put it in Cloudflare as SHEET_URL.
 * 6. Redeploy the website (Cloudflare picks up the new variables).
 *
 * If you change this code later: Deploy > Manage deployments > pencil > Version: New version > Deploy.
 */

var KEY = 'CHANGE_THIS_SECRET_SAME_AS_SHEET_KEY';
var ADMIN_KEY = 'CHANGE_THIS_SECRET_SAME_AS_ADMIN_KEY';
var CF_URL = 'https://rentasite.co.za';
var NOTIFY = 'phibion96@gmail.com, admin@rentasite.co.za';
var REMIND_DAYS = 3;

var ORDERS = 'Orders', LEADS = 'Leads';
var OH = ['Receipt No', 'Created', 'Status', 'Name', 'Company', 'Reg no', 'Email', 'Phone', 'Business type', 'Payment method', 'Plan',
  'Plan months', 'Packages', 'Discounts', 'Amount due today (R)', 'Then pay every period (R)', 'Billed separately', 'Notes',
  'POP received', 'Paid on (date and time)', 'Next payment due (date and time)', 'Days until due'];
var LH = ['Received', 'Type', 'Name', 'Email', 'Phone', 'Message', 'Extra', 'Handled'];
// column numbers (1-based) in Orders
var C_STATUS = 3, C_MONTHS = 12, C_POP = 19, C_PAID = 20, C_NEXT = 21, C_DAYS = 22;

function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var o = ss.getSheetByName(ORDERS) || ss.insertSheet(ORDERS);
  var l = ss.getSheetByName(LEADS) || ss.insertSheet(LEADS);
  head_(o, OH); head_(l, LH);
  o.getRange('C2:C5000').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['Pending', 'Done'], true).setAllowInvalid(false).build());
  o.getRange('S2:S5000').insertCheckboxes();
  l.getRange('H2:H5000').insertCheckboxes();
  o.getRange('B2:B5000').setNumberFormat('yyyy-mm-dd hh:mm');
  o.getRange('T2:U5000').setNumberFormat('yyyy-mm-dd hh:mm');
  l.getRange('A2:A5000').setNumberFormat('yyyy-mm-dd hh:mm');
  var all = o.getRange('A2:V5000');
  o.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=AND($C2="Done",$U2<>"",$U2<NOW())').setBackground('#F8D7DA').setRanges([all]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=AND($C2="Done",$U2<>"",$U2-NOW()<=' + REMIND_DAYS + ')').setBackground('#FFE5B4').setRanges([all]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$C2="Pending"').setBackground('#FFF3CD').setRanges([all]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$C2="Done"').setBackground('#D4EDDA').setRanges([all]).build()
  ]);
  o.setColumnWidths(1, OH.length, 130); o.setColumnWidth(13, 280);
  l.setColumnWidths(1, LH.length, 140); l.setColumnWidth(6, 360);
  // triggers (remove old ones first so they are not duplicated)
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('onEditInstalled').forSpreadsheet(ss).onEdit().create();
  ScriptApp.newTrigger('sendReminders').timeBased().everyDays(1).atHour(8).create();
  ScriptApp.newTrigger('onOpenMenu').forSpreadsheet(ss).onOpen().create();
}

function head_(sh, cols) {
  sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold').setBackground('#0A1F44').setFontColor('#FFFFFF').setWrap(true);
  sh.setFrozenRows(1);
}
function onOpenMenu() {
  SpreadsheetApp.getUi().createMenu('RentMyWebsite').addItem('Mark renewal paid (selected row)', 'markRenewalPaid').addToUi();
}

function clean_(v) { v = String(v == null ? '' : v).slice(0, 500); return /^[=+\-@]/.test(v) ? "'" + v : v; }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function doGet() { return json_({ ok: true, message: 'RentMyWebsite sheet is running' }); }

// Same rule as Cloudflare: keeps the time of day and handles month ends
function addMonths_(date, m) {
  var d = new Date(date.getTime()), day = d.getUTCDate();
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + m);
  var last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
}

function doPost(e) {
  try {
    var d = JSON.parse(e.postData.contents);
    if (d.key !== KEY) return json_({ ok: false, error: 'unauthorised' });
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var lock = LockService.getScriptLock(); lock.waitLock(20000);
    try {
      if (d.type === 'order') {
        var o = ss.getSheetByName(ORDERS);
        var found = o.getRange(2, 1, Math.max(o.getLastRow() - 1, 1), 1).getValues().some(function (r) { return r[0] === d.receipt; });
        if (!found) {
          o.appendRow([d.receipt, new Date(d.created_at), 'Pending', clean_(d.name), clean_(d.company), clean_(d.reg), clean_(d.email), clean_(d.phone),
            clean_(d.biz), clean_(d.method), clean_(d.plan), Number(d.months) || 1, clean_(d.packages), clean_(d.discounts), Number(d.due) || 0,
            Number(d.recurring) || 0, clean_(d.fees), clean_(d.notes), false, '', '', '']);
          var r = o.getLastRow();
          o.getRange(r, C_DAYS).setFormula('=IF(U' + r + '="","",INT(U' + r + '-NOW()))');
        }
        mail_('New receipt ' + d.receipt + ' (Pending)', 'Receipt: ' + d.receipt + '\nName: ' + d.name + '\nCompany: ' + (d.company || '-') + '\nPhone: ' + d.phone +
          '\nEmail: ' + d.email + '\nMethod: ' + d.method + '\nPlan: ' + d.plan + '\nPackages: ' + d.packages + '\nAmount due today: R' + d.due +
          '\n\nThe client will send proof of payment on WhatsApp. Mark the row Done in the sheet when you have confirmed it.');
      } else if (d.type === 'lead') {
        ss.getSheetByName(LEADS).appendRow([new Date(d.created_at), clean_(d.type_label || d.type), clean_(d.name), clean_(d.email), clean_(d.phone),
          clean_(d.message), clean_(d.extra), false]);
        mail_('New ' + (d.type_label || 'lead') + ' from ' + d.name, 'Name: ' + d.name + '\nEmail: ' + (d.email || '-') + '\nPhone: ' + (d.phone || '-') + '\n\n' + d.message + (d.extra ? '\n\n' + d.extra : ''));
      } else {
        return json_({ ok: false, error: 'unknown type' });
      }
    } finally { lock.releaseLock(); }
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function mail_(subject, body) { if (NOTIFY) MailApp.sendEmail(NOTIFY, subject, body); }

function sync_(receipt, status, paidAt, renewal) { // tell Cloudflare (best effort)
  try {
    UrlFetchApp.fetch(CF_URL + '/api/status', { method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { 'x-admin-key': ADMIN_KEY }, payload: JSON.stringify({ receipt: receipt, status: status, paidAt: paidAt ? paidAt.toISOString() : undefined, renewal: !!renewal }) });
  } catch (e) { }
}

function onEditInstalled(e) { // runs when you edit the sheet
  var sh = e.range.getSheet();
  if (sh.getName() !== ORDERS || e.range.getColumn() !== C_STATUS || e.range.getRow() < 2) return;
  var row = e.range.getRow(), receipt = sh.getRange(row, 1).getValue(), months = Number(sh.getRange(row, C_MONTHS).getValue()) || 1, v = e.range.getValue();
  if (v === 'Done') {
    var paid = new Date(), next = addMonths_(paid, months);
    sh.getRange(row, C_PAID).setValue(paid); sh.getRange(row, C_NEXT).setValue(next); sh.getRange(row, C_POP).setValue(true);
    sh.getRange(row, C_DAYS).setFormula('=IF(U' + row + '="","",INT(U' + row + '-NOW()))');
    sync_(receipt, 'Done', paid, false);
  } else if (v === 'Pending') {
    sh.getRange(row, C_PAID, 1, 2).clearContent(); sh.getRange(row, C_POP).setValue(false);
    sync_(receipt, 'Pending');
  }
}

function markRenewalPaid() { // when a client pays their next period
  var sh = SpreadsheetApp.getActiveSheet();
  if (sh.getName() !== ORDERS || sh.getActiveRange().getRow() < 2) { SpreadsheetApp.getUi().alert('Select a client row in the Orders tab first.'); return; }
  var row = sh.getActiveRange().getRow(), months = Number(sh.getRange(row, C_MONTHS).getValue()) || 1;
  var paid = new Date(), next = addMonths_(paid, months);
  sh.getRange(row, C_STATUS).setValue('Done'); sh.getRange(row, C_PAID).setValue(paid); sh.getRange(row, C_NEXT).setValue(next);
  sh.getRange(row, C_DAYS).setFormula('=IF(U' + row + '="","",INT(U' + row + '-NOW()))');
  sync_(sh.getRange(row, 1).getValue(), 'Done', paid, true);
}

function sendReminders() { // every morning at 08:00
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ORDERS);
  if (!sh || sh.getLastRow() < 2) return;
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, OH.length).getValues(), now = new Date(), lim = new Date(now.getTime() + REMIND_DAYS * 86400000), lines = [];
  rows.forEach(function (r) {
    var next = r[C_NEXT - 1];
    if (r[C_STATUS - 1] === 'Done' && next instanceof Date && next <= lim) {
      var late = next < now;
      lines.push((late ? 'OVERDUE  ' : 'Due soon ') + Utilities.formatDate(next, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm') + '  ' + r[0] + '  ' + r[3] +
        (r[4] ? ' (' + r[4] + ')' : '') + '  ' + r[7] + '  R' + r[15] + ' every ' + r[10]);
    }
  });
  if (lines.length) MailApp.sendEmail(NOTIFY, 'Payments due: ' + lines.length, lines.join('\n') + '\n\nAfter the client pays: select their row and use RentMyWebsite > Mark renewal paid.');
}
