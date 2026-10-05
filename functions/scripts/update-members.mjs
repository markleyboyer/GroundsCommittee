// Adds new members and fills in members' reminder emails. Safe to re-run.
//
//   cd functions
//   node scripts/update-members.mjs --key service-account.json
//
// Starting passwords for anyone newly added are appended to functions/initial-passwords.txt.
import { createRequire } from "node:module";
import { readFileSync, appendFileSync } from "node:fs";
import { randomInt } from "node:crypto";
import { treePassword } from "../../docs/js/tree-password.js";

const require = createRequire(import.meta.url);
const admin = require("firebase-admin");
const { createMember } = require("../members.js");

// {"Name": "email", ...} lives in functions/members-update.json, which is git-ignored so
// members' addresses never reach the public repo. Names not already on the roster are added.
const PEOPLE = JSON.parse(readFileSync(new URL("../members-update.json", import.meta.url), "utf8"));

const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const keyPath = arg("--key");
if (keyPath) {
  const key = JSON.parse(readFileSync(keyPath, "utf8"));
  admin.initializeApp({ credential: admin.credential.cert(key), projectId: key.project_id });
} else {
  admin.initializeApp({ projectId: arg("--project") || "demo-grounds" });
}
const db = admin.firestore(), auth = admin.auth();

const members = (await db.collection("members").get()).docs.map(d => ({ uid: d.id, ...d.data() }));
const added = [];
for (const [name, email] of Object.entries(PEOPLE)) {
  const m = members.find(x => x.name === name);
  if (m) {
    if (email && m.email !== email) { await db.doc(`members/${m.uid}`).update({ email }); console.log(`email    ${name}`); }
    else console.log(`ok       ${name}`);
  } else {
    const password = treePassword(randomInt);
    await createMember(auth, db, { name, email, password, role: "member" });
    added.push(`${name.padEnd(20)} ${password}`);
    console.log(`added    ${name}`);
  }
}
if (added.length) {
  appendFileSync(new URL("../initial-passwords.txt", import.meta.url), added.join("\n") + "\n");
  console.log(`\nStarting passwords for new members appended to functions/initial-passwords.txt`);
}
process.exit(0);
