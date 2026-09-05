const CONFIG = {
  COMPANY_NAME: 'Sahyadri Sthapatya Private Limited',
  SHEET_NAME: 'Applications',

  POSITION: 'Senior HR - Infrastructure Projects (Head Office)',
  LOCATION: 'Pune Head Office - Baner, Pune',
  HO_LOCATION: 'Baner, Pune',

  TOTAL_EXPERIENCE: '15-20 Years',
  MIN_TOTAL_EXPERIENCE: 15,
  MAX_TOTAL_EXPERIENCE: 20,

  JOINING_PREFERENCE: 'Immediate Joiner Preferred',
  INDUSTRY_REQUIREMENT: 'Construction / Infrastructure Project HR Experience Mandatory',

  PROJECT_TYPES: [
    'Road / Highway Project',
    'Building / Construction Project',
    'Dam / Water Infrastructure Project',
    'Railway Infrastructure Project',
    'Bridge / Flyover Project',
    'Other Infrastructure Project'
  ],

  MAX_FILE_SIZE_MB: 5,
  MAX_CERTIFICATES: 5
};


/* =========================================================
   GOOGLE SHEET HEADERS
   Existing columns are preserved. The new HO confirmation
   column is appended at the end to avoid shifting old data.
   ========================================================= */

const HEADERS = [
  'Timestamp',
  'Vacancy / Position Applying For',
  'Preferred Location / Site',
  'Full Name',
  'Mobile Number',
  'Email',
  'Date of Birth',
  'Current City',
  'Highest Qualification',
  'Total Experience',
  'Current Company',
  'Current Designation',
  'Construction / Infrastructure Project HR Experience',
  'Construction Project HR Experience (Years)',
  'Project Types Handled',
  'Key Skills',
  'Current salary CTC',
  'Expected Salary CTC',
  'Notice Period',
  'Are you willing to relocate?',
  'Upload Resume',
  'Upload Certificates',
  'Any remarks',
  'If Reference (Please mention Name And Employee ID)',
  'Willing to Work from Pune Head Office - Baner?'
];


/* =========================================================
   ONE-TIME SETUP

   IMPORTANT:
   Open the target Google Sheet -> Extensions -> Apps Script.
   Paste this Code.gs there and run setup() once.

   The Spreadsheet ID is saved in Script Properties, so it is
   NOT exposed in the GitHub frontend or public repository.
   ========================================================= */

function setup() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();

  if (!spreadsheet) {
    throw new Error(
      'Open Apps Script from the target Google Sheet using Extensions > Apps Script, then run setup() again.'
    );
  }

  const properties = PropertiesService.getScriptProperties();
  properties.setProperty('SPREADSHEET_ID', spreadsheet.getId());

  let folderId = properties.getProperty('UPLOAD_FOLDER_ID');

  if (!folderId) {
    const folder = DriveApp.createFolder(
      CONFIG.COMPANY_NAME + ' - Recruitment Uploads'
    );

    folderId = folder.getId();
    properties.setProperty('UPLOAD_FOLDER_ID', folderId);
  }

  const sheet = ensureSheet_();
  SpreadsheetApp.flush();

  Logger.log('Setup completed successfully.');
  Logger.log('Sheet Name: ' + sheet.getName());
  Logger.log('Upload Folder ID: ' + folderId);

  return 'Setup completed successfully.';
}


/* =========================================================
   WEB APP - PUBLIC STATUS / JSONP
   Used by GitHub Pages only for the application count.
   The Sheet URL/ID is never returned.
   ========================================================= */

function doGet(e) {
  const action = String((e && e.parameter && e.parameter.action) || '').trim();

  if (action === 'count') {
    const callback = sanitizeCallback_(
      String((e && e.parameter && e.parameter.callback) || '')
    );

    const data = getDashboardData_();
    const json = JSON.stringify(data);

    if (callback) {
      return ContentService
        .createTextOutput(callback + '(' + json + ');')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }

    return ContentService
      .createTextOutput(json)
      .setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService
    .createTextOutput(
      JSON.stringify({
        success: true,
        service: 'SSPL Recruitment API'
      })
    )
    .setMimeType(ContentService.MimeType.JSON);
}


/* =========================================================
   WEB APP - FORM SUBMISSION

   GitHub Pages submits a hidden HTML form to this endpoint.
   We answer with a tiny HTML page that uses postMessage() to
   notify the parent page. This avoids exposing the Sheet URL
   and avoids browser CORS problems for file submissions.
   ========================================================= */

function doPost(e) {
  try {
    const raw = String(
      (e && e.parameter && e.parameter.payload) || ''
    );

    if (!raw) {
      throw new Error('Application payload was not received.');
    }

    const data = JSON.parse(raw);
    const result = submitApplication_(data);

    return iframeResponse_({
      source: 'SSPL_RECRUITMENT',
      success: true,
      applicationId: result.applicationId,
      message: result.message
    });

  } catch (error) {
    return iframeResponse_({
      source: 'SSPL_RECRUITMENT',
      success: false,
      message: error && error.message
        ? error.message
        : 'Unable to submit application.'
    });
  }
}


/* =========================================================
   DASHBOARD DATA
   ========================================================= */

function getDashboardData_() {
  const sheet = ensureSheet_();

  return {
    success: true,
    applicantCount: Math.max(sheet.getLastRow() - 1, 0)
  };
}


/* =========================================================
   SUBMIT APPLICATION
   ========================================================= */

function submitApplication_(data) {
  if (!data) {
    throw new Error('Application data was not received.');
  }

  if (
    data.website &&
    String(data.website).trim() !== ''
  ) {
    throw new Error('Unable to process this application.');
  }

  validateApplication_(data);

  const timestamp = new Date();
  const rootFolder = getUploadRoot_();

  const candidateFolderName =
    sanitizeFileName_(data.fullName) +
    ' - ' +
    Utilities.formatDate(
      timestamp,
      Session.getScriptTimeZone(),
      'yyyyMMdd-HHmmss'
    );

  const candidateFolder = rootFolder.createFolder(candidateFolderName);

  let resumeUrl = '';

  if (data.resume && data.resume.base64) {
    validateFile_(data.resume, 'resume');

    const resumeFile = uploadFile_(
      data.resume,
      candidateFolder,
      'Resume'
    );

    resumeUrl = resumeFile.getUrl();
  }

  const certificateUrls = [];
  const certificates = Array.isArray(data.certificates)
    ? data.certificates
    : [];

  if (certificates.length > CONFIG.MAX_CERTIFICATES) {
    throw new Error(
      'Maximum ' + CONFIG.MAX_CERTIFICATES + ' certificates can be uploaded.'
    );
  }

  certificates.forEach(function(fileData, index) {
    if (!fileData || !fileData.base64) {
      return;
    }

    validateFile_(fileData, 'certificate');

    const file = uploadFile_(
      fileData,
      candidateFolder,
      'Certificate-' + (index + 1)
    );

    certificateUrls.push(file.getUrl());
  });

  const dob = parseDate_(data.dob);

  const row = [
    timestamp,
    CONFIG.POSITION,
    CONFIG.LOCATION,
    sheetSafe_(data.fullName),
    sheetSafe_(data.mobile),
    sheetSafe_(String(data.email).toLowerCase()),
    dob,
    sheetSafe_(data.currentCity),
    sheetSafe_(data.qualification),
    Number(data.totalExperience),
    sheetSafe_(data.currentCompany),
    sheetSafe_(data.currentDesignation),
    'Yes',
    Number(data.constructionExperienceYears),
    sheetSafe_(data.projectTypes),
    sheetSafe_(data.keySkills),
    sheetSafe_(data.currentSalary),
    sheetSafe_(data.expectedSalary),
    sheetSafe_(data.noticePeriod),
    sheetSafe_(data.relocation),
    resumeUrl,
    certificateUrls.join('\n'),
    sheetSafe_(data.remarks),
    sheetSafe_(data.reference),
    'Yes'
  ];

  if (row.length !== HEADERS.length) {
    throw new Error('Internal configuration error: Sheet columns do not match submitted values.');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  let rowNumber;

  try {
    const sheet = ensureSheet_();
    rowNumber = sheet.getLastRow() + 1;

    sheet
      .getRange(rowNumber, 1, 1, HEADERS.length)
      .setValues([row]);

    sheet
      .getRange(rowNumber, 1)
      .setNumberFormat('dd-mmm-yyyy hh:mm:ss');

    sheet
      .getRange(rowNumber, 7)
      .setNumberFormat('dd-mmm-yyyy');

    sheet
      .getRange(rowNumber, 1, 1, HEADERS.length)
      .setVerticalAlignment('middle')
      .setWrap(true);

    SpreadsheetApp.flush();

  } finally {
    lock.releaseLock();
  }

  const applicationId =
    'SSPL-HR-' +
    Utilities.formatDate(
      timestamp,
      Session.getScriptTimeZone(),
      'yyyyMMdd'
    ) +
    '-' +
    String(rowNumber).padStart(4, '0');

  return {
    success: true,
    applicationId: applicationId,
    message: 'Application submitted successfully.'
  };
}


/* =========================================================
   SERVER-SIDE VALIDATION
   ========================================================= */

function validateApplication_(data) {
  const requiredFields = {
    fullName: 'Full Name',
    mobile: 'Mobile Number',
    email: 'Email',
    dob: 'Date of Birth',
    currentCity: 'Current City',
    qualification: 'Highest Qualification',
    totalExperience: 'Total Experience',
    currentCompany: 'Current Company',
    currentDesignation: 'Current Designation',
    constructionExperience: 'Construction / Infrastructure Project HR Experience',
    constructionExperienceYears: 'Construction Project HR Experience Years',
    projectTypes: 'Project Types Handled',
    keySkills: 'Key Skills',
    currentSalary: 'Current Salary CTC',
    expectedSalary: 'Expected Salary CTC',
    noticePeriod: 'Notice Period',
    relocation: 'Relocation Preference',
    hoLocationAcceptance: 'Pune Head Office work-location confirmation'
  };

  Object.keys(requiredFields).forEach(function(key) {
    if (
      data[key] === undefined ||
      data[key] === null ||
      String(data[key]).trim() === ''
    ) {
      throw new Error(requiredFields[key] + ' is required.');
    }
  });

  if (
    String(data.constructionExperience)
      .trim()
      .toLowerCase() !== 'yes'
  ) {
    throw new Error(
      'Construction / Infrastructure Project HR experience is mandatory for this vacancy.'
    );
  }

  if (
    String(data.hoLocationAcceptance)
      .trim()
      .toLowerCase() !== 'yes'
  ) {
    throw new Error(
      'This vacancy is for Pune Head Office at Baner, Pune. Please confirm that you are willing to work from this office.'
    );
  }

  const constructionYears = Number(data.constructionExperienceYears);
  const totalExperience = Number(data.totalExperience);

  if (
    isNaN(constructionYears) ||
    constructionYears <= 0
  ) {
    throw new Error(
      'Please enter valid Construction / Infrastructure Project HR experience.'
    );
  }

  if (
    isNaN(totalExperience) ||
    totalExperience < CONFIG.MIN_TOTAL_EXPERIENCE ||
    totalExperience > CONFIG.MAX_TOTAL_EXPERIENCE
  ) {
    throw new Error(
      'This position requires total experience between ' +
      CONFIG.MIN_TOTAL_EXPERIENCE +
      ' and ' +
      CONFIG.MAX_TOTAL_EXPERIENCE +
      ' years.'
    );
  }

  if (constructionYears > totalExperience) {
    throw new Error(
      'Construction Project HR experience cannot be greater than Total Experience.'
    );
  }

  const email = String(data.email).trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailRegex.test(email)) {
    throw new Error('Please enter a valid email address.');
  }

  const mobile = String(data.mobile).replace(/\D/g, '');

  if (mobile.length < 10 || mobile.length > 15) {
    throw new Error('Please enter a valid mobile number.');
  }

  const dob = parseDate_(data.dob);

  if (dob.getTime() > new Date().getTime()) {
    throw new Error('Date of Birth cannot be in the future.');
  }

  if (!data.resume || !data.resume.base64) {
    throw new Error('Please upload your resume.');
  }
}


/* =========================================================
   FILE VALIDATION
   ========================================================= */

function validateFile_(fileData, type) {
  const fileName = String(fileData.name || '').toLowerCase();
  const mimeType = String(fileData.mimeType || '').toLowerCase();

  let extensionAllowed = false;
  let mimeAllowed = false;

  if (type === 'resume') {
    extensionAllowed =
      fileName.endsWith('.pdf') ||
      fileName.endsWith('.doc') ||
      fileName.endsWith('.docx');

    mimeAllowed =
      mimeType === '' ||
      mimeType === 'application/pdf' ||
      mimeType === 'application/msword' ||
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mimeType === 'application/octet-stream';
  }

  if (type === 'certificate') {
    extensionAllowed =
      fileName.endsWith('.pdf') ||
      fileName.endsWith('.jpg') ||
      fileName.endsWith('.jpeg') ||
      fileName.endsWith('.png');

    mimeAllowed =
      mimeType === '' ||
      mimeType === 'application/pdf' ||
      mimeType === 'image/jpeg' ||
      mimeType === 'image/png' ||
      mimeType === 'application/octet-stream';
  }

  if (!extensionAllowed || !mimeAllowed) {
    throw new Error('Invalid file type: ' + (fileData.name || 'Document'));
  }
}


/* =========================================================
   UPLOAD FILE
   ========================================================= */

function uploadFile_(fileData, folder, prefix) {
  const bytes = Utilities.base64Decode(fileData.base64);
  const maxBytes = CONFIG.MAX_FILE_SIZE_MB * 1024 * 1024;

  if (bytes.length > maxBytes) {
    throw new Error(
      fileData.name +
      ' exceeds maximum file size of ' +
      CONFIG.MAX_FILE_SIZE_MB +
      ' MB.'
    );
  }

  const cleanName = sanitizeFileName_(
    fileData.name || 'Document'
  );

  const finalName = prefix + ' - ' + cleanName;

  const blob = Utilities.newBlob(
    bytes,
    fileData.mimeType || 'application/octet-stream',
    finalName
  );

  return folder.createFile(blob);
}


/* =========================================================
   GET SPREADSHEET
   ========================================================= */

function getSpreadsheet_() {
  const spreadsheetId = PropertiesService
    .getScriptProperties()
    .getProperty('SPREADSHEET_ID');

  if (!spreadsheetId) {
    throw new Error(
      'System is not configured. Open Apps Script from the target Google Sheet and run setup() once.'
    );
  }

  return SpreadsheetApp.openById(spreadsheetId);
}


/* =========================================================
   CREATE / FORMAT APPLICATION SHEET
   ========================================================= */

function ensureSheet_() {
  const spreadsheet = getSpreadsheet_();

  let sheet = spreadsheet.getSheetByName(CONFIG.SHEET_NAME);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(CONFIG.SHEET_NAME);
  }

  sheet
    .getRange(1, 1, 1, HEADERS.length)
    .setValues([HEADERS]);

  const header = sheet.getRange(1, 1, 1, HEADERS.length);

  header
    .setFontWeight('bold')
    .setFontColor('#ffffff')
    .setBackground('#12395f')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setWrap(true);

  sheet.setFrozenRows(1);
  sheet.setRowHeight(1, 70);

  const widths = [
    160, 230, 190, 190, 150,
    220, 140, 160, 200, 150,
    200, 200, 260, 210, 300,
    320, 170, 180, 170, 190,
    300, 300, 300, 320, 320
  ];

  widths.forEach(function(width, index) {
    sheet.setColumnWidth(index + 1, width);
  });

  return sheet;
}


/* =========================================================
   GET / CREATE RECRUITMENT FOLDER
   ========================================================= */

function getUploadRoot_() {
  const properties = PropertiesService.getScriptProperties();
  let folderId = properties.getProperty('UPLOAD_FOLDER_ID');

  if (folderId) {
    try {
      return DriveApp.getFolderById(folderId);
    } catch (error) {
      folderId = '';
    }
  }

  const folder = DriveApp.createFolder(
    CONFIG.COMPANY_NAME + ' - Recruitment Uploads'
  );

  properties.setProperty('UPLOAD_FOLDER_ID', folder.getId());
  return folder;
}


/* =========================================================
   SAFE DATE
   ========================================================= */

function parseDate_(dateString) {
  const text = String(dateString || '');
  const parts = text.split('-');

  if (parts.length !== 3) {
    throw new Error('Invalid Date of Birth.');
  }

  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);

  const date = new Date(year, month - 1, day);

  if (
    isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    throw new Error('Invalid Date of Birth.');
  }

  return date;
}


/* =========================================================
   GOOGLE SHEET SAFETY
   ========================================================= */

function sheetSafe_(value) {
  if (value === undefined || value === null) {
    return '';
  }

  const text = String(value).trim();

  if (/^[=+\-@]/.test(text)) {
    return "'" + text;
  }

  return text;
}


/* =========================================================
   SAFE FILE / FOLDER NAME
   ========================================================= */

function sanitizeFileName_(name) {
  return String(name || 'Candidate')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 120);
}


/* =========================================================
   JSONP CALLBACK SAFETY
   ========================================================= */

function sanitizeCallback_(value) {
  const callback = String(value || '').trim();

  if (!callback) {
    return '';
  }

  if (!/^[A-Za-z_$][0-9A-Za-z_$\.]*$/.test(callback)) {
    return '';
  }

  return callback;
}


/* =========================================================
   HIDDEN IFRAME RESPONSE
   ========================================================= */

function iframeResponse_(data) {
  const safeJson = JSON.stringify(data).replace(/</g, '\\u003c');

  const html =
    '<!doctype html><html><head><meta charset="utf-8"></head><body>' +
    '<script>' +
    'window.parent.postMessage(' + safeJson + ', "*");' +
    '</script>' +
    '</body></html>';

  return HtmlService
    .createHtmlOutput(html)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
