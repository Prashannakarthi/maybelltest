# Maybell — Namakkal Store Management App

A mobile-friendly web app for running one Maybell franchise store: employees,
attendance, daily sales, stock in/out, expenses, customer feedback, and
reports — all in one place, on your phone or laptop.

**Database:** a Google Sheet, written to through a small Google Apps Script
"backend" (`Code.gs`). No Firebase, no credit card, no server to maintain —
everything lives in your own Google account.

## 1. Create the Google Sheet

Go to https://sheets.google.com and create a new, blank spreadsheet. Give it
any name (e.g. "Maybell Data"). Copy its **Sheet ID** from the URL:
```
https://docs.google.com/spreadsheets/d/  1AbCdEfGhIjKlMnOpQrStUvWxYz  /edit
                                          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^ this part
```
You don't need to create any tabs yourself — the app creates them
automatically the first time it writes data.

## 2. Create the Apps Script backend

1. Go to https://script.google.com/create — this opens a new, blank
   **standalone** Apps Script project (not bound to the sheet, which keeps
   things simple).
2. Delete the default placeholder code, and paste in the entire contents of
   `Code.gs` from this folder.
3. Click the gear icon (**Project Settings**) on the left → scroll to
   **Script Properties** → **Add script property**, and add two:
   | Property | Value |
   |---|---|
   | `SHEET_ID` | the Sheet ID you copied in step 1 |
   | `APP_PASSWORD` | the password you'll use to log into the app |
4. Click **Deploy → New deployment**. Click the gear next to "Select type"
   and choose **Web app**. Set:
   - Execute as: **Me**
   - Who has access: **Anyone**
   Click **Deploy**, then **Authorize access** and approve the permissions
   (it needs to read/write your Sheet and create files in your Drive for
   Aadhar uploads).
5. Copy the **Web app URL** it gives you (ends in `/exec`).

## 3. Point the app at your backend

Open `js/config.js` in this folder and paste that URL in as
`APPS_SCRIPT_URL`.

## 4. Run it locally (optional, to test before publishing)

Any static file server works, e.g. from this folder:
```
npx serve .
```
Then open the printed local URL and log in with the `APP_PASSWORD` you set
in step 2.

## 5. Publish for free on GitHub Pages

1. Create a new GitHub repository and push everything in this folder to it
   (keep the folder structure as-is — `Code.gs` doesn't need to go to
   GitHub, but it's harmless if it does).
2. Repo → **Settings → Pages** → Source: **Deploy from a branch** →
   Branch: `main`, folder `/ (root)` → Save.
3. GitHub gives you a URL like `https://yourname.github.io/reponame/`.
   Open it and log in with your `APP_PASSWORD`.

## Everyday use

- **Dashboard** — monthly sale, stock count/value, this month's target
  progress, and a Qty-vs-Value trend chart. Tap the Target Value card to
  jump to the Target page.
- **Employees** — add staff, upload their Aadhar proof (auto-compressed
  before upload, stored in a "Maybell Aadhar Files" folder in your Drive),
  mark them inactive by setting a Last Date instead of deleting them.
- **Attendance** — pick a date and every active employee shows up
  defaulting to **Present**; tap anyone who's absent to switch them, then
  save everyone in one go. Month view shows a calendar for one employee, or
  a summary table for all.
- **Daily Sales** — one entry per date. Saving a date also silently keeps
  the Stock In/Out numbers in sync (see note below).
- **Stock In/Out** — running qty/value totals. "Add Stock Entry" lets you
  manually add **Opening Stock** (a one-time starting balance, with its own
  ₹ value), **Category A (Brand Stock)**, or **Category C (Inter-store
  Transfer)** — **Category B (Customer Sale/Return)** is generated
  automatically from what you enter in Daily Sales, so the two screens
  never drift apart. This stays correct even if two people save at the
  same moment from different devices, since the backend serializes all
  writes.
- **Expenses** — set up recurring items once (Rent, Salary, EB Bill, etc.)
  under "Manage Recurring"; the app flags any that haven't been logged yet
  for the current month with an "Add now" banner.
- **Feedback** — description field suggests past entries as you type, so
  repeat complaints are tracked as one "type" with a repeat count.
- **Target** — set a sales target for any month, with a full history table.
  The Dashboard, the Month-wise Sales Report, and the Month-End Summary
  Report all pull from whatever target is set for that month automatically.
- **Reports** — A through G, each with a date-range (or month) filter and a
  CSV export button. B and G both show target vs. actual and achievement %.
- **Settings & Backup** — download every collection as one JSON file, or
  restore from a previous backup file (choose Merge to add/update, or
  Replace to wipe and reload fully).

## Updating the app later

Two different places hold code, and they update separately:

- **Everything in this folder except `Code.gs`** (HTML/CSS/JS) — just
  commit the changed files to your GitHub repo; Pages redeploys
  automatically within a minute or two.
- **`Code.gs`** — GitHub doesn't run this file at all; it only runs inside
  your Apps Script project. If `Code.gs` changes, open your Apps Script
  project, replace its contents with the new version, then **Deploy →
  Manage deployments → edit (pencil icon) → New version → Deploy**. Reusing
  the same deployment keeps your existing Web app URL working, so you
  don't need to touch `js/config.js` again.

## A couple of things worth knowing

- **Auth is a single shared password**, not a real user-account system —
  the app has exactly one login by design. Anyone with the password (and
  the app URL) can get in; that's roughly the same trust model as a shared
  Wi-Fi password or a PIN-locked till, appropriate for one person running
  one store. Don't share the password or commit it into a public GitHub
  repo (it lives only in Apps Script's Script Properties, never in the
  code you push to GitHub).
- **Stock value** is tracked in aggregate (total qty + total ₹ value), not
  per garment/SKU. Category A and C entries carry a ₹ value you enter at
  the time of the movement; Category B (customer sales) only affects
  quantity, since per-sale cost of goods isn't tracked separately — see
  the note in `js/stockSync.js` if you want to extend this later.
- **Daily Sales** includes a "Sale Qty" field alongside the fields in the
  original brief, so the Dashboard's "Qty Sale vs Sale Value" chart and
  Stock category B have something concrete to work from.
- You can open the Google Sheet directly any time to eyeball or manually
  fix raw data — each tab is a plain, readable table. Just avoid changing
  header names, since the app matches columns by name.
- The app caches read-only data for about a minute per screen to make
  navigation feel instant, and automatically clears that cache the moment
  you save something. If you edit the Sheet directly outside the app,
  give it a minute (or just refresh the page) to pick up the change.
- If something ever looks wrong with a saved date or number, it's almost
  certainly a Sheets formatting quirk — select the affected column(s),
  Format → Number → **Plain text**, and re-save the record from the app.
