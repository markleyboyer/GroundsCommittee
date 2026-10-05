// Shared bootstrapping for every page: Firebase, auth guard, header/footer, helpers.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, connectAuthEmulator } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, getDocs, query, orderBy, connectFirestoreEmulator } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { getStorage, connectStorageEmulator } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js";
import { getFunctions, httpsCallable, connectFunctionsEmulator } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js";
import { firebaseConfig, functionsRegion } from "./firebase-config.js";

export const configured = !String(firebaseConfig.apiKey).includes("REPLACE_ME");
const useEmulators = ["localhost", "127.0.0.1"].includes(location.hostname) && new URLSearchParams(location.search).has("emu")
  || sessionStorage.getItem("mg-emu") === "1";
if (useEmulators) sessionStorage.setItem("mg-emu", "1");

// Emulator mode always uses the throwaway "demo-grounds" project, never the real one.
export const app = initializeApp(useEmulators
  ? { ...firebaseConfig, apiKey: "demo-key", projectId: "demo-grounds", storageBucket: "demo-grounds.appspot.com" }
  : configured ? firebaseConfig : { ...firebaseConfig, apiKey: "placeholder", projectId: "placeholder" });
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, functionsRegion);
if (useEmulators) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  connectStorageEmulator(storage, "127.0.0.1", 9199);
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
}
export const callFn = (name, data) => httpsCallable(functions, name)(data).then(r => r.data);

/* ---------------- helpers ---------------- */
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);

/** Today's date in New York as YYYY-MM-DD. */
export const todayISO = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());

const asDate = iso => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); };
export function fmtDate(iso, opts = { weekday: "short", month: "short", day: "numeric", year: "numeric" }) {
  if (!iso) return "";
  return asDate(iso).toLocaleDateString("en-US", opts);
}
export function fmtTime(hhmm) {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}
export function fmtStamp(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const BUILDINGS = ["Building 1", "Building 2", "Building 3", "Building 4", "Building 5", "Building 6"];

export function toast(msg, isError = false) {
  const el = document.createElement("div");
  el.className = "toast" + (isError ? " error" : "");
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), isError ? 6000 : 3000);
}
export function fail(err) {
  console.error(err);
  toast(err?.message?.replace(/^Firebase: /, "") || String(err), true);
}

/** Wire a <dialog> close button + return a promise-free open helper. */
export function openDialog(dlg) {
  dlg.querySelectorAll("[data-close]").forEach(b => b.onclick = e => { e.preventDefault(); dlg.close(); });
  dlg.showModal();
}

/* ---------------- layout ---------------- */
const TREE_SVG = `<svg viewBox="0 0 30 46" aria-hidden="true"><path d="M15 2C6 2 2 13 2 22c0 8 5 14 12 14.5V44h2v-7.5C23 36 28 30 28 22 28 13 24 2 15 2z" fill="currentColor"/><path d="M15 8v28M15 16l-6-4M15 22l7-5M15 28l-6-4" stroke="#fffef9" stroke-width="1.6" fill="none" stroke-linecap="round"/><circle cx="8.5" cy="11.5" r="1.6" fill="#fffef9"/><circle cx="22.5" cy="16.5" r="1.6" fill="#fffef9"/><circle cx="8.5" cy="23.5" r="1.6" fill="#fffef9"/></svg>`;

const NAV = [
  ["index.html", "Home"],
  ["schedule.html", "Minutes Schedule"],
  ["minutes.html", "Minutes Archive"],
  ["issues.html", "Issues"],
  ["calendar.html", "Committee Year"],
  ["bulbs.html", "Bulbs"],
  ["trees/", "Tree Map"],
];

// Pages in a subfolder (the tree map at trees/) need links that point back up one level.
const ROOT = location.pathname.includes("/trees/") ? "../" : "";

function renderChrome(page, ctx, { footer: withFooter = true } = {}) {
  const header = document.createElement("header");
  header.className = "site-header";
  const links = [...NAV, ...(ctx?.isAdmin ? [["admin.html", "Admin"]] : [])]
    .map(([href, label]) => `<a href="${ROOT}${href}" class="${href === page ? "active" : ""}">${label}</a>`).join("");
  header.innerHTML = `<div class="inner">
      <a class="brand" href="${ROOT}index.html">${TREE_SVG}<span class="word">Morningside<br>Gardens<small>Grounds Committee</small></span></a>
      <button class="btn secondary small menu-toggle" type="button">Menu</button>
      <nav class="nav">${links}</nav>
      <div class="userbox">${ctx?.isDemo
        ? `Guest (read-only) · <button class="linklike" id="signout">Sign out</button>`
        : ctx?.member
        ? `${esc(ctx.member.name)} · <a href="${ROOT}account.html">Account</a> · <button class="linklike" id="signout">Sign out</button>`
        : `<a href="${ROOT}login.html">Committee log in</a>`}</div>
    </div>`;
  document.body.prepend(header);
  if (ctx?.isDemo) {
    document.body.classList.add("demo");
    document.querySelector("main")?.insertAdjacentHTML("afterbegin", `<div class="notice">You're looking around as a <strong>guest</strong>. Everything is read-only, and uploaded files, member emails and receipts are hidden. <a href="login.html">Committee members log in here.</a></div>`);
  }
  header.querySelector(".menu-toggle").onclick = () => header.querySelector(".nav").classList.toggle("open");
  header.querySelector("#signout")?.addEventListener("click", () => signOut(auth).then(() => location.href = ROOT + "login.html"));

  if (!withFooter) return;
  const footer = document.createElement("footer");
  footer.className = "site-footer";
  footer.innerHTML = `<div class="inner"><span>Morningside Gardens Grounds Committee · meets the first Monday of the month</span><a href="https://www.morningsidegardens.com/">morningsidegardens.com</a></div>`;
  document.body.append(footer);
}

async function loadRoster() {
  const snap = await getDocs(query(collection(db, "roster"), orderBy("name")));
  const list = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
  return { list, byId: Object.fromEntries(list.map(r => [r.uid, r])) };
}

/**
 * Call at the top of every page.
 * Resolves with { user, member, isAdmin, isTreasurer, roster, nameOf } or redirects to login.
 */
export function startPage({ page, requireAuth = true, adminOnly = false, footer = true } = {}) {
  const main = document.querySelector("main");
  if (!configured && !useEmulators) {
    renderChrome(page, null, { footer });
    main?.insertAdjacentHTML("afterbegin", `<div class="notice"><strong>Setup needed:</strong> this site isn't connected to Firebase yet. Follow <code>SETUP.md</code> in the repository and paste your config into <code>docs/js/firebase-config.js</code>.</div>`);
    return new Promise(() => {}); // never resolves; page stays in its static state
  }
  return new Promise(resolve => {
    const unsub = onAuthStateChanged(auth, async user => {
      unsub();
      let ctx = { user: null, member: null, isAdmin: false, isTreasurer: false };
      try {
        if (user) {
          const m = await getDoc(doc(db, "members", user.uid));
          if (m.exists() && m.data().active !== false) {
            const member = { uid: user.uid, ...m.data() };
            ctx = { user, member, isAdmin: member.role === "admin", isTreasurer: member.role === "admin" || !!member.treasurer, isDemo: member.role === "demo" };
          }
        }
        if ((requireAuth || adminOnly) && !ctx.member) {
          location.href = "login.html?next=" + encodeURIComponent(location.pathname.split("/").pop() + location.search);
          return;
        }
        if (adminOnly && !ctx.isAdmin) { location.href = "index.html"; return; }
        if (ctx.isDemo && page === "account.html") { location.href = "index.html"; return; }
        if (ctx.member) {
          ctx.roster = await loadRoster();
          ctx.nameOf = uid => ctx.roster.byId[uid]?.name || (uid ? "(former member)" : "");
        }
      } catch (e) { fail(e); }
      renderChrome(page, ctx, { footer });
      resolve(ctx);
    });
  });
}
