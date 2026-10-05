// One-time setup: creates the committee members, the draft committee-year calendar,
// default settings, and meetings from today through the end of next year.
// Safe to re-run: existing members (matched by name), calendar months and meeting months are skipped.
//
//   cd functions
//   node scripts/seed.mjs --key service-account.json
//
// Starting passwords are written to functions/initial-passwords.txt (git-ignored). Hand them out, then delete the file.
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { randomInt } from "node:crypto";
import { CALENDAR_DRAFT } from "../../docs/js/calendar-draft.js";

const require = createRequire(import.meta.url);
const admin = require("firebase-admin");
const { createMember } = require("../members.js");

const MEMBERS = [
  "Skip Delano", "Ellen Fried", "Dana Minaya", "Lisa Greco", "Carl Mahaney",
  "Claudia Leacock", "Stephen Shafer", "Tiana Norgren", "Bez Khosrovi", "Markley Boyer",
];
const ADMINS = ["Markley Boyer"];

const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const keyPath = arg("--key");
if (keyPath) {
  const key = JSON.parse(readFileSync(keyPath, "utf8"));
  admin.initializeApp({ credential: admin.credential.cert(key), projectId: key.project_id });
} else {
  admin.initializeApp({ projectId: arg("--project") || process.env.GCLOUD_PROJECT || "demo-grounds" });
}
const db = admin.firestore(), auth = admin.auth();

const pw = () => Array.from({ length: 10 }, () => "abcdefghjkmnpqrstuvwxyz23456789"[randomInt(31)]).join("").replace(/^(.{5})/, "$1-");

// --- members
const existing = new Set((await db.collection("roster").get()).docs.map(d => d.data().name));
const out = [];
for (const name of MEMBERS) {
  if (existing.has(name)) { console.log(`exists   ${name}`); continue; }
  const password = pw();
  await createMember(auth, db, { name, password, role: ADMINS.includes(name) ? "admin" : "member"});
  out.push(`${name.padEnd(20)} ${password}`);
  console.log(`created  ${name}`);
}
if (out.length) {
  writeFileSync(new URL("../initial-passwords.txt", import.meta.url), out.join("\n") + "\n");
  console.log(`\nStarting passwords written to functions/initial-passwords.txt`);
}

// --- calendar draft
for (const [month, data] of Object.entries(CALENDAR_DRAFT)) {
  const ref = db.doc(`calendar/${month}`);
  if (!(await ref.get()).exists) await ref.set(data);
}

// --- settings
const sref = db.doc("settings/site");
if (!(await sref.get()).exists) await sref.set({ reminderDays: [7, 1], askForVolunteer: true, defaultLocation: "" });

// --- meetings: first Monday of each month (second Monday if it's Labor Day / New Year's Day), skipping summer
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
const have = new Set((await db.collection("meetings").get()).docs.map(d => d.data().date.slice(0, 7)));
const startY = Number(today.slice(0, 4));
let made = 0;
for (let y = startY; y <= startY + 1; y++) {
  for (let m = 0; m < 12; m++) {
    if (CALENDAR_DRAFT[m + 1]?.skip) continue;
    const d = new Date(Date.UTC(y, m, 1));
    while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
    if (m === 8 || (m === 0 && d.getUTCDate() === 1)) d.setUTCDate(d.getUTCDate() + 7);
    const date = d.toISOString().slice(0, 10);
    if (date < today || have.has(date.slice(0, 7))) continue;
    await db.collection("meetings").add({ date, time: "18:30", location: "", status: "scheduled", note: m === 8 ? "Second Monday because of Labor Day" : "", minuteTaker: null, backup: null });
    made++;
  }
}
console.log(`meetings created: ${made}`);
process.exit(0);
