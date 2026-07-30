/**
 * Google Apps Script for DE Funded Startups → PM Targets
 *
 * SETUP:
 * 1. In spreadsheet 1pZiI5OdkdTCTR3ztXLer2seIQ9JT3SF4wUBJwP_JXsY
 *    Extensions → Apps Script → replace code with this file
 * 2. Run setupStartupTargetsSheet once
 * 3. Deploy → Manage deployments → Edit → New version
 *    (Web app: Execute as Me, Who has access: Anyone)
 *    This fixes "Script function not found: doGet"
 *
 * Web app: https://script.google.com/macros/s/AKfycbyau3n_6m-2zRv6l68aoe69l3w3z3qacu_pICVqD6wO-dP4Sh2GaGZxo9f1CGSwFOdCtA/exec
 * n8n uses Google Sheets OAuth directly; the web app is a health/status helper.
 */

var SHEET_NAME = 'Target Companies';
var META_NAME = 'Targets Meta';

var HEADERS = [
  'company',
  'location',
  'one_liner',
  'funding_stage',
  'funding_amount',
  'funding_date',
  'total_raised_note',
  'source',
  'website',
  'linkedin_url',
  'careers_url',
  'apply_email',
  'next_action',
  'next_action_url',
  'hiring_pm',
  'pm_job_urls',
  'pm_job_titles',
  'priority',
  'priority_score',
  'status',
  'last_funded_check',
  'last_hiring_check',
  'last_draft_at',
  'notes',
];

function setupStartupTargetsSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (sheet) sheet.clear();
  else sheet = ss.insertSheet(SHEET_NAME);

  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  var headerRange = sheet.getRange(1, 1, 1, HEADERS.length);
  headerRange.setBackground('#0f766e');
  headerRange.setFontColor('#ffffff');
  headerRange.setFontWeight('bold');
  sheet.setFrozenRows(1);

  // Columns: apply_email=L, next_action=M, hiring_pm=O, priority=R, status=T, last_draft_at=W
  sheet
    .getRange('M2:M2000')
    .setDataValidation(
      SpreadsheetApp.newDataValidation()
        .requireValueInList(
          ['Apply now', 'Find contact', 'Watch', 'Applied', 'Contacted', 'Skip'],
          true,
        )
        .build(),
    );
  sheet
    .getRange('O2:O2000')
    .setDataValidation(
      SpreadsheetApp.newDataValidation()
        .requireValueInList(['Yes', 'No', 'Unknown'], true)
        .build(),
    );
  sheet
    .getRange('R2:R2000')
    .setDataValidation(
      SpreadsheetApp.newDataValidation()
        .requireValueInList(['High', 'Medium', 'Low'], true)
        .build(),
    );
  sheet
    .getRange('T2:T2000')
    .setDataValidation(
      SpreadsheetApp.newDataValidation()
        .requireValueInList(
          ['Watch', 'Ready to Apply', 'Applied', 'Contacted', 'Skip'],
          true,
        )
        .build(),
    );

  var meta = ss.getSheetByName(META_NAME);
  if (!meta) meta = ss.insertSheet(META_NAME);
  else meta.clear();
  meta.getRange(1, 1, 2, 2).setValues([
    ['key', 'value'],
    ['last_run', ''],
  ]);

  SpreadsheetApp.getUi().alert(
    'Target Companies + Targets Meta ready.\nRedeploy the web app (New version) so doGet works.',
  );
}

/** Web app health check — fixes "Script function not found: doGet" */
function doGet(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  var meta = ss.getSheetByName(META_NAME);
  var count = 0;
  if (sheet && sheet.getLastRow() > 1) count = sheet.getLastRow() - 1;
  var lastRun = '';
  if (meta && meta.getLastRow() >= 2) {
    lastRun = String(meta.getRange(2, 2).getValue() || '');
  }
  var out = {
    ok: true,
    spreadsheetId: ss.getId(),
    sheet: SHEET_NAME,
    companyCount: count,
    last_run: lastRun,
    hasTargetCompanies: !!sheet,
    hasMeta: !!meta,
  };
  return ContentService.createTextOutput(JSON.stringify(out, null, 2)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

function doPost(e) {
  // Optional: { "action": "ping" } — sheet writes are done by n8n Google Sheets OAuth
  var out = { ok: true, message: 'Use n8n Google Sheets nodes for upserts. GET for status.' };
  try {
    if (e && e.postData && e.postData.contents) {
      var body = JSON.parse(e.postData.contents);
      if (body && body.action === 'setup') {
        setupStartupTargetsSheet();
        out.message = 'setupStartupTargetsSheet completed';
      }
    }
  } catch (err) {
    out.ok = false;
    out.error = String(err);
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
