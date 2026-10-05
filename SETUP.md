# Setting up the Grounds Committee site

The website is plain HTML in `docs/`, served by GitHub Pages. Logins, sign-ups, issues, bulb orders and uploaded files live in a Firebase project. Email reminders are sent by Firebase Cloud Functions.

This is a one-time setup and takes about 30–45 minutes.

## 1. Create the Firebase project

1. Go to <https://console.firebase.google.com> → **Add project** (e.g. `mg-grounds`). Google Analytics isn't needed.
2. **Upgrade to the Blaze (pay-as-you-go) plan** (gear icon → Usage and billing). File uploads and scheduled email both require it. A committee this size stays well inside the free allowance, so expect $0/month. Set a **budget alert** (e.g. $5) in the Google Cloud billing page so you'd hear about any surprise.
3. **Build → Authentication → Get started → Email/Password → Enable.**
   Then **Settings → Authorized domains → Add domain** `markleyboyer.github.io`.
4. **Build → Firestore Database → Create database.** Choose **production mode**, location **nam5 (United States)**.
5. **Build → Storage → Get started.** Choose production mode and the same US location.
6. **Project settings (gear) → General → Your apps → Web (`</>`)**. Register an app (no hosting needed) and copy the `firebaseConfig` values into [`docs/js/firebase-config.js`](docs/js/firebase-config.js).

## 2. An email account for reminders

Use a dedicated Gmail account (e.g. `mggroundscommittee@gmail.com`) so reminders don't come from someone's personal address.

1. Turn on **2-Step Verification** for that account.
2. Create an **App password** at <https://myaccount.google.com/apppasswords>. Keep the 16-character password for step 3.

## 3. Deploy the rules and functions

You need Node 22 and the Firebase CLI (`npm install -g firebase-tools`), both already on this computer.

```bash
firebase login
```

Put your project ID into `.firebaserc` (replace `REPLACE_WITH_YOUR_PROJECT_ID`), then:

```bash
cd functions
npm install
firebase functions:secrets:set SMTP_USER
firebase functions:secrets:set SMTP_PASS
cd ..
firebase deploy
```

`SMTP_USER` is the Gmail address; `SMTP_PASS` is the app password. If the site address changes, update `SITE_URL` in `functions/.env` (it's used for links in emails) and redeploy.

## 4. Create the members, meetings and draft calendar

1. Firebase console → **Project settings → Service accounts → Generate new private key**. Save it as `functions/service-account.json` (git-ignored, so **never commit it**).
2. Run:

   ```bash
   cd functions
   node scripts/seed.mjs --key service-account.json
   ```

   This creates the 10 committee members (Markley Boyer as admin), a meeting on the first Monday of each month from today through next year (no July or August, and the second Monday in September because of Labor Day), the draft committee-year calendar, and default reminder settings. It is safe to re-run.
3. The starting passwords are in `functions/initial-passwords.txt`. Hand them out, then **delete that file and `service-account.json`.**

## 5. Publish

Commit and push. GitHub Pages already serves `docs/` from `main`, so the committee home page is at the repo's Pages URL and the tree map moves to `/trees/`.

If you rename the repository (e.g. to `morningside-gardens-grounds`), GitHub redirects the old URL. Update `SITE_URL` in `functions/.env` and the authorized domain if the domain changes.

## Day-to-day (admin)

- **Members:** Admin page → add, edit (email, building, treasurer), reset password, deactivate, remove.
- **Meetings:** Admin page → *Generate a year of meetings* (tick the months that have meetings). On the Schedule page, **Edit** any meeting to move it, cancel it, or assign the minute-taker.
- **Committee year:** Committee Year page → **edit** any month.
- **Reminders:** Admin page → *Reminders*. Default: the minute-taker is emailed 7 days and 1 day before, and if nobody has signed up 7 days out, all members get a "volunteer needed" email (BCC).
- **Treasurer:** tick *Treasurer* on a member. They see every receipt, get an email for each new one, and can mark receipts reimbursed. If no treasurer is set, the admins get those emails.

## Testing locally (no real data)

Firestore and Storage emulators need Java (any JRE 11+).

```bash
firebase emulators:start --project demo-grounds
```

In another terminal:

```bash
cd functions
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 node scripts/seed.mjs --project demo-grounds
```

Then serve `docs/` (`python -m http.server 8000 --directory docs`) and open <http://localhost:8000/login.html?emu=1>. Emulator-mode test passwords are written to `functions/initial-passwords.txt`.
