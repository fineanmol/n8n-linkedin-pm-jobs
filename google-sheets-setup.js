/**
 * Google Apps Script - Run this in your Google Sheet to set up all required sheets
 * 
 * HOW TO USE:
 * 1. Open your Google Sheet
 * 2. Go to Extensions > Apps Script
 * 3. Paste this entire script
 * 4. Click Run > setupAllSheets
 * 5. Authorize when prompted
 */

function setupAllSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  setupJobsSheet(ss);
  setupMySkillsSheet(ss);
  setupCoverLettersSheet(ss);
  setupStatsSheet(ss);
  
  SpreadsheetApp.getUi().alert('✅ All sheets set up successfully!\n\nSheets created:\n- Jobs\n- My Skills\n- Cover Letters\n- Stats');
}

function setupJobsSheet(ss) {
  let sheet = ss.getSheetByName('Jobs');
  if (sheet) sheet.clear();
  else sheet = ss.insertSheet('Jobs');
  
  const headers = [
    'job_id', 'company', 'position', 'location', 'job_url',
    'apply_type', 'is_linkedin', 'is_remote', 'employment_type',
    'status', 'priority', 'skill_match_score', 'missing_skills',
    'posted_date', 'applied_date', 'last_checked',
    'application_id', 'cover_letter_generated', 'resume_optimized',
    'job_summary', 'notes', 'description',
    // Years / seniority parsed from JD (e.g. "3+", "3-5", "Mid-Senior")
    'experience_required',
    // German CEFR from JD (None | B1 | B2 | C1 | C2 | Fluent | Native)
    'german_required',

    // Tailored Designer CV/CL used for each application (local path or Drive link)
    'resume_used', 'cover_letter_used', 'resume_variant_id', 'ats_score'
  ];
  
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  
  // Style header row
  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setBackground('#1a73e8');
  headerRange.setFontColor('#ffffff');
  headerRange.setFontWeight('bold');
  headerRange.setFontSize(11);
  
  // Set column widths
  sheet.setColumnWidth(1, 200);  // job_id
  sheet.setColumnWidth(2, 150);  // company
  sheet.setColumnWidth(3, 200);  // position
  sheet.setColumnWidth(4, 150);  // location
  sheet.setColumnWidth(5, 200);  // job_url
  sheet.setColumnWidth(6, 150);  // apply_type
  sheet.setColumnWidth(10, 150); // status
  sheet.setColumnWidth(11, 80);  // priority
  sheet.setColumnWidth(12, 80);  // skill_match
  sheet.setColumnWidth(13, 200); // missing_skills
  
  // Freeze header
  sheet.setFrozenRows(1);
  
  // Add data validation for Status column
  // Manual-apply pipeline only — unused interview/offer statuses omitted
  const statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList([
      'Not Applied', 'Ready to Apply', 'Applied', 'Already Applied', 'Rejected',
      'not qualified', 'Only German Required', 'Not Available Now',
    ], true)
    .build();
  // Live Jobs sheet: status is column E (legacy templates used J)
  sheet.getRange('E2:E5000').setDataValidation(statusRule);
  
  // Add data validation for Priority column
  const priorityRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['High', 'Medium', 'Low'], true)
    .build();
  sheet.getRange('K2:K1000').setDataValidation(priorityRule);
  
  // Conditional formatting for status (live sheet: column E)
  // Not Applied + Ready to Apply = transparent (no rule).
  // Closed listings use a single status: Not Available Now.
  const range = sheet.getRange('E2:E5000');
  const statusColors = [
    ['Applied', '#C8E6C9', null],
    ['Already Applied', '#A5D6A7', null],
    ['Rejected', '#FFCDD2', null],
    ['not qualified', '#FFCCBC', null],
    ['Only German Required', '#D1C4E9', null],
    ['Not Available Now', '#BDBDBD', null],
  ];
  const rules = statusColors.map(([status, bg, fg]) => {
    let b = SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo(status)
      .setBackground(bg)
      .setRanges([range]);
    if (fg) b = b.setFontColor(fg);
    return b.build();
  });
  sheet.setConditionalFormatRules(rules);
  
  // Add sample row
  const sampleRow = [
    'SAMPLE_001', 'Example GmbH', 'Software Engineer', 'Berlin, Germany',
    'https://www.linkedin.com/jobs/view/123456', 'LinkedIn Easy Apply', 'Yes', 'No', 'FULLTIME',
    'Not Applied', 'High', '85', 'Docker, Kubernetes',
    new Date().toISOString().split('T')[0], '', new Date().toISOString().split('T')[0],
    '', 'No', 'No',
    'Looking for a senior software engineer to join their platform team.',
    'Sample entry - delete this row',
    'Full job description would go here...'
  ];
  sheet.getRange(2, 1, 1, sampleRow.length).setValues([sampleRow]);
  
  Logger.log('Jobs sheet created ✅');
}

function setupMySkillsSheet(ss) {
  let sheet = ss.getSheetByName('My Skills');
  if (sheet) sheet.clear();
  else sheet = ss.insertSheet('My Skills');
  
  const headers = ['skill', 'category', 'proficiency', 'years_experience', 'notes'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  
  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setBackground('#0f9d58');
  headerRange.setFontColor('#ffffff');
  headerRange.setFontWeight('bold');
  
  sheet.setFrozenRows(1);
  
  // Add proficiency validation
  const proficiencyRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Beginner', 'Intermediate', 'Advanced', 'Expert'], true)
    .build();
  sheet.getRange('C2:C1000').setDataValidation(proficiencyRule);
  
  // Sample skills - UPDATE THESE WITH YOUR ACTUAL SKILLS
  const sampleSkills = [
    ['JavaScript', 'Programming', 'Advanced', '4', 'React, Node.js'],
    ['Python', 'Programming', 'Advanced', '3', 'Django, FastAPI, pandas'],
    ['SQL', 'Database', 'Advanced', '4', 'PostgreSQL, MySQL'],
    ['Docker', 'DevOps', 'Intermediate', '2', 'Containerization'],
    ['Git', 'Tools', 'Advanced', '5', 'GitHub, GitLab'],
    ['REST API', 'Backend', 'Advanced', '3', 'Design and consumption'],
    ['Linux', 'Systems', 'Intermediate', '3', 'Ubuntu, bash scripting'],
    ['TypeScript', 'Programming', 'Intermediate', '2', ''],
    ['React', 'Frontend', 'Advanced', '3', 'Hooks, Redux'],
    ['Node.js', 'Backend', 'Advanced', '3', 'Express.js'],
    ['AWS', 'Cloud', 'Beginner', '1', 'EC2, S3, Lambda basics'],
    ['Agile', 'Methodology', 'Advanced', '4', 'Scrum, Jira'],
    ['Machine Learning', 'AI/ML', 'Intermediate', '2', 'scikit-learn, TensorFlow basics'],
    ['MongoDB', 'Database', 'Intermediate', '2', 'NoSQL'],
    ['CI/CD', 'DevOps', 'Intermediate', '2', 'GitHub Actions, Jenkins'],
  ];
  
  sheet.getRange(2, 1, sampleSkills.length, 5).setValues(sampleSkills);
  
  // Set column widths
  sheet.setColumnWidth(1, 180);
  sheet.setColumnWidth(2, 130);
  sheet.setColumnWidth(3, 120);
  sheet.setColumnWidth(4, 120);
  sheet.setColumnWidth(5, 250);
  
  Logger.log('My Skills sheet created ✅');
}

function setupCoverLettersSheet(ss) {
  let sheet = ss.getSheetByName('Cover Letters');
  if (sheet) sheet.clear();
  else sheet = ss.insertSheet('Cover Letters');
  
  const headers = ['job_id', 'company', 'position', 'cover_letter', 'generated_date', 'used'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  
  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setBackground('#f4511e');
  headerRange.setFontColor('#ffffff');
  headerRange.setFontWeight('bold');
  
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(4, 500);
  
  Logger.log('Cover Letters sheet created ✅');
}

/**
 * Stats dashboard — formulas must match the LIVE Jobs column layout:
 *   E status | O is_remote | Q priority | T apply_type | Y ats_score
 * (Older templates used J=status / F=apply_type — those counts were wrong/missing.)
 *
 * Re-run: setupStatsSheet or updateStatsSheetOnly
 */
function setupStatsSheet(ss) {
  let sheet = ss.getSheetByName('Stats');
  if (sheet) {
    sheet.clear();
    sheet.getCharts().forEach((c) => sheet.removeChart(c));
  } else {
    sheet = ss.insertSheet('Stats');
  }

  // Live Jobs cols: E status | O is_remote | T apply_type | Y ats_score
  const S = 'Jobs!E2:E';
  const grid = [
    ['Job Hunt Dashboard', '', '', '', ''],
    ['Live from Jobs · closed = Not Available Now · formulas auto-update', '', '', '', ''],
    ['', '', '', '', ''],
    ['TOTAL JOBS', 'READY TO APPLY', 'APPLIED', 'CLOSED', ''],
    [
      '=COUNTA(Jobs!A2:A)',
      `=COUNTIF(${S},"Ready to Apply")`,
      `=COUNTIF(${S},"Applied")+COUNTIF(${S},"Already Applied")`,
      `=COUNTIF(${S},"Not Available Now")`,
      '',
    ],
    ['all tracked', 'pack ready', 'Applied + Already Applied', 'unavailable listings', ''],
    ['', '', '', '', ''],
    ['Status mix', 'Count', '', 'Quick rollups', 'Value'],
    ['Not Applied', `=COUNTIF(${S},"Not Applied")`, '', 'Pack ready', '=B10'],
    ['Ready to Apply', `=COUNTIF(${S},"Ready to Apply")`, '', 'Applied total', '=C5'],
    ['Applied', `=COUNTIF(${S},"Applied")`, '', 'Filtered out', '=B14+B15'],
    ['Already Applied', `=COUNTIF(${S},"Already Applied")`, '', 'Closed', '=B16'],
    ['Rejected', `=COUNTIF(${S},"Rejected")`, '', 'Remote jobs', '=COUNTIF(Jobs!O2:O,"Yes")'],
    ['not qualified', `=COUNTIF(${S},"not qualified")`, '', 'Avg ATS (packed)', '=IFERROR(ROUND(AVERAGEIF(Jobs!Y2:Y,">0"),1),"—")'],
    ['Only German Required', `=COUNTIF(${S},"Only German Required")`, '', 'Easy Apply', '=COUNTIF(Jobs!T2:T,"LinkedIn Easy Apply")'],
    ['Not Available Now', `=COUNTIF(${S},"Not Available Now")`, '', 'External Apply', '=COUNTIF(Jobs!T2:T,"LinkedIn External")+COUNTIF(Jobs!T2:T,"Direct Website")+COUNTIF(Jobs!T2:T,"LinkedIn")'],
  ];
  sheet.getRange(1, 1, grid.length, 5).setValues(grid);

  sheet.getRange('A1').setFontSize(22).setFontWeight('bold').setFontColor('#1A237E');
  sheet.getRange('A2').setFontColor('#607D8B').setFontSize(10);

  const kpiColors = ['#1565C0', '#2E7D32', '#6A1B9A', '#546E7A'];
  kpiColors.forEach((c, i) => {
    const col = i + 1;
    sheet.getRange(4, col).setBackground(c).setFontColor('#fff').setFontWeight('bold').setHorizontalAlignment('center');
    sheet.getRange(5, col).setBackground('#F5F7FA').setFontColor(c).setFontSize(26).setFontWeight('bold').setHorizontalAlignment('center');
    sheet.getRange(6, col).setFontColor('#90A4AE').setFontSize(9).setHorizontalAlignment('center');
  });
  sheet.setRowHeight(5, 52);

  sheet.getRange('A8:B8').setBackground('#263238').setFontColor('#fff').setFontWeight('bold');
  sheet.getRange('D8:E8').setBackground('#263238').setFontColor('#fff').setFontWeight('bold');
  sheet.getRange('B9:B16').setHorizontalAlignment('center').setFontWeight('bold');

  sheet.setColumnWidths(1, 5, 110);
  sheet.setColumnWidth(1, 200);
  sheet.setColumnWidth(3, 24);
  sheet.setColumnWidth(4, 160);
  sheet.setFrozenRows(2);

  const mixRange = sheet.getRange('A8:B16');
  sheet.addChart(
    sheet.newChart()
      .setChartType(Charts.ChartType.PIE)
      .addRange(mixRange)
      .setOption('title', 'Status mix')
      .setPosition(4, 7, 0, 0)
      .build(),
  );
  sheet.addChart(
    sheet.newChart()
      .setChartType(Charts.ChartType.BAR)
      .addRange(mixRange)
      .setOption('title', 'Counts by status')
      .setOption('legend', { position: 'none' })
      .setPosition(21, 1, 0, 0)
      .build(),
  );

  Logger.log('Stats dashboard created ✅');
}

/** Re-apply Stats formulas without wiping other sheets. Run from Apps Script: updateStatsSheetOnly */
function updateStatsSheetOnly() {
  setupStatsSheet(SpreadsheetApp.getActiveSpreadsheet());
  SpreadsheetApp.getUi().alert('Stats sheet updated (closed = Not Available Now).');
}

/** Ensure Jobs!E status dropdown matches the manual-apply status set. */
function updateJobsStatusValidationOnly() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Jobs');
  if (!sheet) throw new Error('Jobs sheet not found');
  const statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList([
      'Not Applied', 'Ready to Apply', 'Applied', 'Already Applied', 'Rejected',
      'not qualified', 'Only German Required', 'Not Available Now',
    ], true)
    .build();
  sheet.getRange('E2:E5000').setDataValidation(statusRule);
  SpreadsheetApp.getUi().alert('Jobs status dropdown updated (manual-apply statuses only).');
}

/**
 * Safe migration for an EXISTING Jobs sheet: append tracking columns if missing.
 * Run: addApplicationDocColumns
 */
function addApplicationDocColumns() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Jobs') || ss.getSheets()[0];
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, Math.max(lastCol, 1)).getValues()[0];
  const needed = [
    'resume_used',
    'cover_letter_used',
    'resume_variant_id',
    'ats_score',
    'pack_folder',
    'apply_channel',
    'external_apply_url',
  ];
  const missing = needed.filter((h) => headers.indexOf(h) === -1);
  if (!missing.length) {
    SpreadsheetApp.getUi().alert('Columns already present: ' + needed.join(', '));
    return;
  }
  const start = lastCol + 1;
  sheet.getRange(1, start, 1, missing.length).setValues([missing]);
  sheet.getRange(1, start, 1, missing.length)
    .setBackground('#1a73e8')
    .setFontColor('#ffffff')
    .setFontWeight('bold');
  SpreadsheetApp.getUi().alert('Added columns: ' + missing.join(', '));
}
