# SSPL Pune Head Office Recruitment Portal

A GitHub Pages frontend connected to a Google Apps Script backend for recruitment applications.

## Important privacy design

- The **Google Sheet URL and Spreadsheet ID are not stored in the GitHub frontend**.
- The backend is installed as a **bound Apps Script project inside the target Google Sheet**.
- Running `setup()` stores the Spreadsheet ID privately in **Apps Script Script Properties**.
- The public frontend contains only the deployed Apps Script Web App `/exec` URL.
- Resume/certificate files are uploaded to a Google Drive folder created by the backend.

> Note: A public browser website cannot hide its own backend Web App URL from browser developer tools. This project hides the **Google Sheet URL/ID**, not the public API endpoint.

## Project structure

```text
pune-ho-recruitment/
├── index.html
├── config.js
├── .nojekyll
├── assets/
│   ├── app.js
│   └── styles.css
└── apps-script/
    ├── Code.gs
    └── appsscript.json
```

## 1. Connect the Google Sheet privately

1. Open the Google Sheet that will receive applications.
2. Click **Extensions -> Apps Script**.
3. Replace the default `Code.gs` with the contents of `apps-script/Code.gs` from this project.
4. In Apps Script, open **Project Settings** and enable **Show appsscript.json manifest file in editor** if you want to use the included manifest. Replace the manifest with `apps-script/appsscript.json`.
5. Select the `setup` function and click **Run** once.
6. Approve the Google permissions requested for Sheets and Drive.

`setup()` creates/updates the `Applications` sheet, creates the recruitment upload folder, and privately stores the target Spreadsheet ID in Script Properties.

## 2. Deploy the Apps Script backend

1. In Apps Script click **Deploy -> New deployment**.
2. Select **Web app**.
3. Set **Execute as:** `Me`.
4. Set **Who has access:** `Anyone`.
5. Click **Deploy** and approve permissions if requested.
6. Copy the Web App URL. Use the URL ending in `/exec`.

If you later change `Code.gs`, create a **new version/update the deployment** so the live `/exec` endpoint uses the latest code.

## 3. Connect the GitHub frontend

Open `config.js` and replace:

```js
WEB_APP_URL: 'PASTE_YOUR_APPS_SCRIPT_WEB_APP_EXEC_URL_HERE'
```

with your deployed `/exec` URL, for example:

```js
WEB_APP_URL: 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec'
```

Do **not** paste the Google Sheet link or Spreadsheet ID anywhere in the frontend.

## 4. Publish on GitHub Pages

1. Create a new GitHub repository.
2. Upload the contents of this project folder to the repository root.
3. Commit and push to the `main` branch.
4. Open **Repository Settings -> Pages**.
5. Under **Build and deployment**, choose **Deploy from a branch**.
6. Select `main` and `/ (root)` and save.
7. Open the GitHub Pages URL shown by GitHub.

## Data saved to the Sheet

The application stores:

- Timestamp
- Vacancy / Position
- Pune Head Office location
- Full Name
- Mobile Number
- Email
- Date of Birth
- Current City
- Qualification
- Total Experience
- Current Company
- Current Designation
- Construction / Infrastructure Project HR confirmation
- Construction Project HR experience in years
- Project types handled
- Key skills
- Current CTC
- Expected CTC
- Notice period
- Relocation preference
- Resume Drive URL
- Certificate Drive URLs
- Remarks
- Reference details
- Pune Head Office / Baner work-location confirmation

The new Head Office confirmation column is appended as the last column so older application rows are not shifted.

## Mandatory vacancy rules

- Position: **Senior HR - Infrastructure Projects (Head Office)**
- Work location: **Pune Head Office - Baner, Pune**
- Total experience: **15-20 years**
- Construction / Infrastructure Project HR experience: **Mandatory**
- Candidate must confirm willingness to work from **Baner, Pune Head Office**
- Resume: **Mandatory**
- Resume formats: PDF / DOC / DOCX, maximum 5 MB
- Certificates: PDF / JPG / JPEG / PNG, maximum 5 files, 5 MB each

## Google Drive uploads

When `setup()` runs, the backend creates a folder named:

```text
Sahyadri Sthapatya Private Limited - Recruitment Uploads
```

Each candidate receives a separate subfolder. The Sheet receives Drive links for the resume and uploaded certificates.

## Updating the vacancy later

Backend vacancy rules are in `apps-script/Code.gs` inside `CONFIG`.
Frontend display text is in `index.html` and `config.js`.

After backend changes, update the Apps Script deployment. After frontend changes, push the changes to GitHub.

## Troubleshooting

**Website says backend is not configured**  
Check that `config.js` contains the deployed Apps Script URL ending in `/exec`.

**Submission receives no response**  
Confirm the Apps Script deployment is a Web App, executes as you, and access is set to `Anyone`. Also make sure the deployment was updated after the latest backend code was pasted.

**System is not configured**  
Open Apps Script from the target Google Sheet and run `setup()` once.

**Files are not visible in the Sheet**  
The Sheet stores clickable Google Drive URLs. Check the recruitment upload folder created in the Google account that owns/runs the Apps Script.
