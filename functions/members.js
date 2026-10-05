// Member-account helpers shared by the Cloud Functions and scripts/seed.mjs.
// Members sign in by picking their name; behind the scenes each has a Firebase Auth
// account with a private, never-mailed login address (<slug>@LOGIN_DOMAIN). Their real
// email lives only in members/{uid}, readable by signed-in members.
const LOGIN_DOMAIN = "members.mg-grounds.local";

const slugify = name => name.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_-]+/g, ".") || "member";

async function uniqueLoginEmail(auth, name) {
  const base = slugify(name);
  for (let i = 0; i < 50; i++) {
    const email = `${base}${i ? i + 1 : ""}@${LOGIN_DOMAIN}`;
    try { await auth.getUserByEmail(email); } catch (e) { if (e.code === "auth/user-not-found") return email; throw e; }
  }
  throw new Error("Could not find a free login name");
}

/** Create the Auth account plus members/{uid} and roster/{uid}. Returns the uid. */
async function createMember(auth, db, { name, email = "", building = "", role = "member", treasurer = false, password }) {
  name = String(name || "").trim();
  if (!name) throw new Error("Name is required");
  if (!password || password.length < 8) throw new Error("Password must be at least 8 characters");
  if (!["member", "admin"].includes(role)) throw new Error("Bad role");
  const loginEmail = await uniqueLoginEmail(auth, name);
  const user = await auth.createUser({ email: loginEmail, password, displayName: name });
  const batch = db.batch();
  batch.set(db.doc(`members/${user.uid}`), { name, email: String(email).trim(), building, role, treasurer: !!treasurer, active: true, loginEmail });
  batch.set(db.doc(`roster/${user.uid}`), { name, loginEmail, active: true });
  await batch.commit();
  return user.uid;
}

module.exports = { LOGIN_DOMAIN, createMember };
