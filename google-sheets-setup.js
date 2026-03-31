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
    'job_summary', 'notes', 'description'
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
  const statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList([
      'Not Applied', 'Applied', 'Manual Apply Required',
      'Under Review', 'Interview Scheduled', 'Rejected', 'Offer', 'Withdrawn'
    ], true)
    .build();
  sheet.getRange('J2:J1000').setDataValidation(statusRule);
  
  // Add data validation for Priority column
  const priorityRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['High', 'Medium', 'Low'], true)
    .build();
  sheet.getRange('K2:K1000').setDataValidation(priorityRule);
  
  // Conditional formatting for status
  const range = sheet.getRange('J2:J1000');
  
  const appliedFormat = SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('Applied')
    .setBackground('#c8e6c9')
    .setRanges([range])
    .build();
    
  const rejectedFormat = SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('Rejected')
    .setBackground('#ffcdd2')
    .setRanges([range])
    .build();
    
  const interviewFormat = SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('Interview Scheduled')
    .setBackground('#fff9c4')
    .setRanges([range])
    .build();
    
  const offerFormat = SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('Offer')
    .setBackground('#b2dfdb')
    .setFontColor('#004d40')
    .setRanges([range])
    .build();
    
  sheet.setConditionalFormatRules([appliedFormat, rejectedFormat, interviewFormat, offerFormat]);
  
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

function setupStatsSheet(ss) {
  let sheet = ss.getSheetByName('Stats');
  if (sheet) sheet.clear();
  else sheet = ss.insertSheet('Stats');
  
  sheet.getRange('A1').setValue('📊 Job Application Dashboard');
  sheet.getRange('A1').setFontSize(18).setFontWeight('bold');
  
  const metrics = [
    ['Metric', 'Count'],
    ['Total Jobs Found', "=COUNTA(Jobs!A2:A)"],
    ['Not Applied', "=COUNTIF(Jobs!J2:J,\"Not Applied\")"],
    ['Applied', "=COUNTIF(Jobs!J2:J,\"Applied\")"],
    ['Manual Apply Required', "=COUNTIF(Jobs!J2:J,\"Manual Apply Required\")"],
    ['Under Review', "=COUNTIF(Jobs!J2:J,\"Under Review\")"],
    ['Interview Scheduled', "=COUNTIF(Jobs!J2:J,\"Interview Scheduled\")"],
    ['Offers', "=COUNTIF(Jobs!J2:J,\"Offer\")"],
    ['Rejected', "=COUNTIF(Jobs!J2:J,\"Rejected\")"],
    ['', ''],
    ['LinkedIn Easy Apply', "=COUNTIF(Jobs!F2:F,\"LinkedIn Easy Apply\")"],
    ['External Apply', "=COUNTIF(Jobs!F2:F,\"LinkedIn External\")+COUNTIF(Jobs!F2:F,\"Direct Website\")"],
    ['', ''],
    ['Avg Skill Match Score', "=IFERROR(AVERAGE(Jobs!L2:L),0)&\"%\""],
    ['High Priority Jobs', "=COUNTIF(Jobs!K2:K,\"High\")"],
    ['Remote Jobs', "=COUNTIF(Jobs!H2:H,\"Yes\")"],
  ];
  
  sheet.getRange(3, 1, metrics.length, 2).setValues(metrics);
  
  const headerRange2 = sheet.getRange(3, 1, 1, 2);
  headerRange2.setBackground('#4285f4');
  headerRange2.setFontColor('#ffffff');
  headerRange2.setFontWeight('bold');
  
  sheet.setColumnWidth(1, 220);
  sheet.setColumnWidth(2, 120);
  sheet.getRange(4, 2, metrics.length - 1, 1).setHorizontalAlignment('center');
  
  Logger.log('Stats sheet created ✅');
}
