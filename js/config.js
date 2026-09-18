// Preencha com os valores reais do seu projeto Google Cloud.
//
// CLIENT_ID is committed with its real value on purpose (same for
// SPREADSHEET_ID routing in js/tenants.js) — this app has no backend, so
// anything the browser needs is visible in the deployed JS to anyone who
// opens the live app regardless of what's in the git repo. The real access
// boundary is each spreadsheet's Google Drive sharing + the OAuth Client's
// "Authorized JavaScript origins", not secrecy of these IDs.
//
// SPREADSHEET_ID / SHEET_NAME are no longer fixed here — they're resolved per
// logged-in user from js/tenants.js (multi-company support) and written onto
// this object at sign-in, in js/app.js.
const CONFIG = {
  CLIENT_ID: "421144448289-jfiiagc3pij4qoaoq0m2dhnjuda4ua8t.apps.googleusercontent.com",
  SPREADSHEET_ID: "",
  SHEET_NAME: "Lançamento",
  // Read+write on Sheets (form writes), plus email so we can identify which
  // company's spreadsheet to load (see js/tenants.js).
  SCOPES: "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/userinfo.email",
};
