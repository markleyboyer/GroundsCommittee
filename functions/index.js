const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { setGlobalOptions } = require("firebase-functions/v2");
const { defineSecret, defineString } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");
const { createMember } = require("./members");

admin.initializeApp();
const db = admin.firestore();
const auth = admin.auth();

// Must match functionsRegion in docs/js/firebase-config.js, and suits a Firestore database in nam5 (US).
setGlobalOptions({ region: "us-central1", maxInstances: 3 });

// Email goes out through a Gmail (or other SMTP) account. Set with:
//   firebase functions:secrets:set SMTP_USER   (e.g. mggrounds@gmail.com)
//   firebase functions:secrets:set SMTP_PASS   (a Gmail "app password")
const SMTP_USER = defineSecret("SMTP_USER");
const SMTP_PASS = defineSecret("SMTP_PASS");
const SITE_URL = defineString("SITE_URL", { default: "https://markleyboyer.github.io/morningside-gardens-tree-map/" });
const SMTP_HOST = defineString("SMTP_HOST", { default: "smtp.gmail.com" });

/* ---------------- helpers ---------------- */
async function requireAdmin(req) {
  if (!req.auth) throw new HttpsError("unauthenticated", "Please log in.");
  const m = await db.doc(`members/${req.auth.uid}`).get();
  if (!m.exists || m.data().role !== "admin" || m.data().active === false) throw new HttpsError("permission-denied", "Admins only.");
}

function mailer() {
  return nodemailer.createTransport({ host: SMTP_HOST.value(), port: 465, secure: true, auth: { user: SMTP_USER.value(), pass: SMTP_PASS.value() } });
}

async function send(to, subject, text) {
  const list = [].concat(to).filter(Boolean);
  if (!list.length) return;
  const from = `"MG Grounds Committee" <${SMTP_USER.value()}>`;
  // group mail goes out as BCC so members' addresses aren't shared with each other
  const addressing = list.length > 1 ? { to: from, bcc: list.join(", ") } : { to: list[0] };
  await mailer().sendMail({ from, ...addressing, subject, text });
  logger.info("sent", { subject, to: list.length });
}

const nyToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
function addDays(iso, n) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const longDate = iso => new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" });
function time12(hhmm = "18:30") {
  const [h, m] = hhmm.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}
const page = p => SITE_URL.value().replace(/\/?$/, "/") + p;

/* ---------------- member management (admin only) ---------------- */
exports.createMember = onCall(async req => {
  await requireAdmin(req);
  try { return { uid: await createMember(auth, db, req.data || {}) }; }
  catch (e) { throw new HttpsError("invalid-argument", e.message); }
});

exports.setMemberPassword = onCall(async req => {
  await requireAdmin(req);
  const { uid, password } = req.data || {};
  if (!uid || !password || password.length < 8) throw new HttpsError("invalid-argument", "Password must be at least 8 characters.");
  await auth.updateUser(uid, { password });
  await auth.revokeRefreshTokens(uid);
  return { ok: true };
});

exports.setMemberActive = onCall(async req => {
  await requireAdmin(req);
  const { uid, active } = req.data || {};
  if (!uid || uid === req.auth.uid) throw new HttpsError("invalid-argument", "You can't deactivate yourself.");
  await auth.updateUser(uid, { disabled: !active });
  if (!active) await auth.revokeRefreshTokens(uid);
  await db.doc(`members/${uid}`).update({ active: !!active });
  await db.doc(`roster/${uid}`).update({ active: !!active });
  return { ok: true };
});

exports.deleteMember = onCall(async req => {
  await requireAdmin(req);
  const { uid } = req.data || {};
  if (!uid || uid === req.auth.uid) throw new HttpsError("invalid-argument", "You can't remove yourself.");
  await auth.deleteUser(uid).catch(e => { if (e.code !== "auth/user-not-found") throw e; });
  await db.doc(`members/${uid}`).delete();
  await db.doc(`roster/${uid}`).delete();
  return { ok: true };
});

/* ---------------- daily meeting reminders ---------------- */
async function runReminders() {
  const settings = (await db.doc("settings/site").get()).data() || {};
  const days = settings.reminderDays?.length ? settings.reminderDays : [7, 1];
  const furthest = Math.max(...days);
  const members = Object.fromEntries((await db.collection("members").get()).docs.map(d => [d.id, d.data()]));
  const today = nyToday();

  for (const n of days) {
    const date = addDays(today, n);
    const snap = await db.collection("meetings").where("date", "==", date).get();
    for (const doc of snap.docs) {
      const m = doc.data();
      if (m.status === "cancelled") continue;
      const where = m.location || settings.defaultLocation || "";
      const when = `${longDate(m.date)} at ${time12(m.time)}${where ? `, ${where}` : ""}`;
      const taker = members[m.minuteTaker], backup = members[m.backup];
      const soon = n === 1 ? "tomorrow" : `in ${n} days`;

      if (taker?.email && taker.active !== false) {
        await send(taker.email, `Reminder: you're taking minutes ${soon} (${longDate(m.date)})`,
          `Hi ${taker.name.split(" ")[0]},\n\nThis is a reminder that you signed up to take minutes at the Grounds Committee meeting on ${when}.\n\n` +
          `Afterwards, please upload them here:\n${page("minutes.html#upload")}\n\n` +
          `If you can't make it, withdraw on the schedule page so someone else can step in${backup ? ` (${backup.name} is the backup)` : ""}:\n${page("schedule.html")}\n\nThank you!`);
      }
      if (backup?.email && backup.active !== false && n === 1) {
        await send(backup.email, `You're the backup minute-taker tomorrow (${longDate(m.date)})`,
          `Hi ${backup.name.split(" ")[0]},\n\nYou're the backup minute-taker for the Grounds Committee meeting on ${when}` +
          `${taker ? `; ${taker.name} is down to take them` : ""}.\n\n${page("schedule.html")}`);
      }
      if (!taker && n === furthest && settings.askForVolunteer !== false) {
        const all = Object.values(members).filter(x => x.active !== false && x.email).map(x => x.email);
        await send(all, `Volunteer needed: minutes for ${longDate(m.date)}`,
          `Nobody has signed up yet to take minutes at the Grounds Committee meeting on ${when}.\n\n` +
          `If you can do it, sign up here:\n${page("schedule.html")}\n\nThank you!`);
      }
    }
  }
}

exports.dailyReminders = onSchedule(
  { schedule: "0 9 * * *", timeZone: "America/New_York", secrets: [SMTP_USER, SMTP_PASS] },
  runReminders,
);

/* ---------------- tell the treasurer about new receipts ---------------- */
exports.notifyTreasurer = onDocumentCreated({ document: "receipts/{id}", secrets: [SMTP_USER, SMTP_PASS] }, async event => {
  const r = event.data?.data();
  if (!r) return;
  const all = (await db.collection("members").get()).docs.map(d => d.data()).filter(m => m.active !== false && m.email);
  let to = all.filter(m => m.treasurer);
  if (!to.length) to = all.filter(m => m.role === "admin");
  const by = (await db.doc(`members/${r.uploadedBy}`).get()).data()?.name || "A member";
  await send(to.map(m => m.email), `New bulb receipt: ${r.building}, $${Number(r.amount).toFixed(2)}`,
    `${by} uploaded a receipt for reimbursement.\n\nBuilding: ${r.building}\nSupplier: ${r.supplier}\nAmount: $${Number(r.amount).toFixed(2)}\n` +
    `Purchased: ${r.purchased}\n${r.notes ? `Notes: ${r.notes}\n` : ""}\nView it and mark it reimbursed:\n${page("bulbs.html#receipts-h")}`);
});
