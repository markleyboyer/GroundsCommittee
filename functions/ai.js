// Reads Grounds Committee minutes and asks Claude to summarize them and suggest issues.
// Nothing is written to the Issues page directly: results become documents in
// `suggestions`, which a member accepts or dismisses on issues.html.
const Anthropic = require("@anthropic-ai/sdk");
const mammoth = require("mammoth");
const logger = require("firebase-functions/logger");

const MODEL = "claude-opus-5-5";
const STATUSES = ["open", "in progress", "waiting", "resolved"];
const MAX_DOCS_PER_CALL = 8; // older minutes are processed in chronological batches

const SYSTEM = `You help the Grounds Committee of Morningside Gardens, a co-op of six apartment buildings (Building 1-6) in Manhattan, keep track of the issues it works on: trees, plantings, lawns, irrigation, contractors, signage, budget and similar grounds matters.

You will receive one or more sets of meeting minutes, oldest first, plus the committee's current issue list and any issues already suggested and awaiting review. For each set of minutes:
- Write a short plain-English summary (3-6 sentences) of what was discussed and decided.
- Identify ongoing matters the committee will need to follow up on across meetings. One-off announcements, thanks and social items are not issues.
- If a matter is already on the current issue list, report it as an update to that issue (use its exact id) rather than a new issue. The same applies to issues awaiting review: use their exact id.
- Otherwise suggest a new issue with a short, specific title, a one or two sentence description, an area (a building such as "Building 4", or a topic such as "Trees", "Lawns", "Plantings & beds", "Irrigation", "Paths & lighting", "Signage", "Vegetable garden", "Budget", "Contractors"), a status, and the committee member leading it if the minutes say so (otherwise an empty string).
- For a matter that appears in several of the minutes you were given, suggest it once, with one dated update per meeting where it came up, in date order.
- Updates should be one or two factual sentences saying what changed or was decided, written so they make sense on their own.
- Status: "open" when not yet being worked on, "in progress" when someone is acting on it, "waiting" when blocked on someone outside the committee (management, the board, a contractor, insurance), "resolved" when the minutes say it is done.
Only use what the minutes say. Do not invent names, dates or decisions. Dates are YYYY-MM-DD; use the meeting date for updates.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summaries", "newIssues", "issueUpdates"],
  properties: {
    summaries: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["minutesId", "summary"],
        properties: { minutesId: { type: "string" }, summary: { type: "string" } },
      },
    },
    newIssues: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["title", "description", "area", "status", "lead", "firstRaised", "updates"],
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          area: { type: "string" },
          status: { type: "string", enum: STATUSES },
          lead: { type: "string" },
          firstRaised: { type: "string" },
          updates: {
            type: "array",
            items: {
              type: "object", additionalProperties: false, required: ["date", "text", "minutesId"],
              properties: { date: { type: "string" }, text: { type: "string" }, minutesId: { type: "string" } },
            },
          },
        },
      },
    },
    issueUpdates: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["issueId", "date", "text", "status", "minutesId"],
        properties: {
          issueId: { type: "string" },
          date: { type: "string" },
          text: { type: "string" },
          status: { type: "string", enum: STATUSES },
          minutesId: { type: "string" },
        },
      },
    },
  },
};

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

/** Turn one uploaded minutes file into Claude content blocks, or null if the format can't be read. */
async function fileToContent(buffer, fileName, contentType) {
  const name = (fileName || "").toLowerCase();
  if (contentType === "application/pdf" || name.endsWith(".pdf")) {
    return { type: "document", source: { type: "base64", media_type: "application/pdf", data: buffer.toString("base64") } };
  }
  if (IMAGE_TYPES.includes(contentType)) {
    return { type: "image", source: { type: "base64", media_type: contentType, data: buffer.toString("base64") } };
  }
  if (name.endsWith(".docx")) {
    const { value } = await mammoth.extractRawText({ buffer });
    return { type: "text", text: value };
  }
  if (/\.(txt|md|markdown|rtf|text|csv)$/.test(name) || (contentType || "").startsWith("text/")) {
    return { type: "text", text: buffer.toString("utf8") };
  }
  return null; // e.g. old .doc or .odt
}

const FORMAT_SYSTEM = `You convert Grounds Committee meeting minutes from Morningside Gardens (a Manhattan co-op) into one standard Markdown layout. The input may be an email body, a Word document, a PDF or a photo of paper notes, and may include email headers, signatures, mailing-list footers or forwarding text.

Output only the Markdown, in this layout (leave out a section the minutes don't support):

# Grounds Committee Meeting, <Weekday, Month D, YYYY>

**Present:** names, comma-separated
**Absent:** names
**Minutes taken by:** name

## <Topic heading>
- points as bullets

## Decisions
- decisions or votes taken

## Action items
- [ ] task: who (by when)

Rules: keep the original wording and every substantive point; only reorganize, fix obvious typos, and use consistent headings and bullets. Drop email headers, signatures, "sent from my iPhone", forwarding lines and mailing-list footers. Do not add facts, names, dates or decisions that aren't in the minutes. If the meeting date isn't stated, use the date you are given.`;

/** Rewrite one file's minutes into the standard Markdown layout. */
async function formatMinutes(client, doc) {
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: FORMAT_SYSTEM,
    output_config: { effort: "low" },
    messages: [{ role: "user", content: [
      { type: "text", text: `Meeting date on file: ${doc.meetingDate}. Original file: "${doc.fileName}".` },
      doc.block,
    ] }],
  });
  if (response.stop_reason === "refusal") throw new Error("Claude declined to format these minutes.");
  if (response.stop_reason === "max_tokens") throw new Error("These minutes are too long to format in one pass.");
  return response.content.filter(b => b.type === "text").map(b => b.text).join("").trim();
}

function issueContext(issues, pending) {
  const fmt = i => `- id ${i.id}: "${i.title}" [${i.status || "open"}${i.area ? `, ${i.area}` : ""}]` +
    ((i.updates || []).length ? ` latest: ${i.updates[i.updates.length - 1].text}` : "");
  return `Current issue list:\n${issues.length ? issues.map(fmt).join("\n") : "(none yet)"}\n\n` +
    `Issues already suggested and awaiting review:\n${pending.length ? pending.map(fmt).join("\n") : "(none)"}`;
}

/** One Claude call over a batch of minutes. Returns the parsed result. */
async function askClaude(client, docs, issues, pending) {
  const content = [];
  for (const d of docs) {
    content.push({ type: "text", text: `Minutes id ${d.id}, meeting of ${d.meetingDate}:

${d.markdown}` });
  }
  content.push({ type: "text", text: issueContext(issues, pending) });

  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default", // if a safety classifier declines, Anthropic re-runs on its recommended fallback model
    system: SYSTEM,
    output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
    messages: [{ role: "user", content }],
  });

  if (response.stop_reason === "refusal") {
    throw new Error(`Claude declined to process these minutes (${response.stop_details?.category || "no category"}).`);
  }
  if (response.stop_reason === "max_tokens") throw new Error("Claude's answer was cut off; try fewer minutes at once.");
  const text = response.content.filter(b => b.type === "text").map(b => b.text).join("");
  logger.info("claude usage", response.usage);
  return JSON.parse(text);
}

/**
 * Analyze the given minutes documents (ids), oldest first, writing summaries onto each
 * minutes doc and new/updated-issue suggestions into `suggestions`.
 */
async function analyzeMinutes({ db, bucket, apiKey, minutesIds }) {
  const client = new Anthropic({ apiKey });
  const snaps = await Promise.all(minutesIds.map(id => db.doc(`minutes/${id}`).get()));
  const all = snaps.filter(s => s.exists).map(s => ({ id: s.id, ...s.data() }))
    .sort((a, b) => a.meetingDate.localeCompare(b.meetingDate));
  const result = { analyzed: 0, skipped: 0, failed: 0, newIssues: 0, updates: 0 };

  // Load and convert each file; mark unreadable ones as skipped.
  const readable = [];
  for (const m of all) {
    const ref = db.doc(`minutes/${m.id}`);
    try {
      const saved = (await db.doc(`minutesText/${m.id}`).get()).data();
      if (saved?.markdown) { readable.push({ ...m, markdown: saved.markdown }); continue; } // already formatted
      const [buffer] = await bucket.file(m.storagePath).download();
      const block = await fileToContent(buffer, m.fileName, m.contentType);
      if (!block) {
        await ref.update({ aiStatus: "skipped", aiError: "This file type can't be read. Upload a PDF, Word (.docx), text or photo instead." });
        result.skipped++;
        continue;
      }
      await ref.update({ aiStatus: "working" });
      const markdown = await formatMinutes(client, { ...m, block });
      // Text lives in minutesText (members only), not on the minutes doc the guest demo can list.
      await db.doc(`minutesText/${m.id}`).set({ markdown }, { merge: true });
      readable.push({ ...m, markdown });
    } catch (e) {
      logger.error("read/format failed", m.id, e);
      await ref.update({ aiStatus: "error", aiError: `Couldn't read or format the file: ${friendly(e)}` });
      result.failed++;
    }
  }

  for (let i = 0; i < readable.length; i += MAX_DOCS_PER_CALL) {
    const batch = readable.slice(i, i + MAX_DOCS_PER_CALL);
    await Promise.all(batch.map(m => db.doc(`minutes/${m.id}`).update({ aiStatus: "working" })));
    try {
      // Re-read each round so later batches see suggestions made by earlier ones.
      const issues = (await db.collection("issues").get()).docs.map(d => ({ id: d.id, ...d.data() }));
      const pendingDocs = (await db.collection("suggestions").where("state", "==", "pending").where("kind", "==", "new").get()).docs;
      const pending = pendingDocs.map(d => ({ id: d.id, ...d.data() }));
      const out = await askClaude(client, batch, issues, pending);

      const ids = new Set(batch.map(m => m.id));
      const dateOf = Object.fromEntries(batch.map(m => [m.id, m.meetingDate]));
      const issueIds = new Set(issues.map(x => x.id));
      const pendingById = Object.fromEntries(pending.map(p => [p.id, p]));
      const writes = db.batch();
      const now = new Date();

      for (const s of out.summaries || []) {
        if (ids.has(s.minutesId)) writes.set(db.doc(`minutesText/${s.minutesId}`), { summary: s.summary }, { merge: true });
      }
      for (const n of out.newIssues || []) {
        const updates = (n.updates || []).filter(u => u.text)
          .map(u => ({ date: u.date || dateOf[u.minutesId] || "", text: u.text, minutesId: ids.has(u.minutesId) ? u.minutesId : null }));
        writes.set(db.collection("suggestions").doc(), {
          kind: "new", state: "pending", createdAt: now,
          title: n.title, description: n.description, area: n.area, status: STATUSES.includes(n.status) ? n.status : "open",
          lead: n.lead || "", firstRaised: n.firstRaised || updates[0]?.date || batch[0].meetingDate, updates,
          minutesIds: [...new Set(updates.map(u => u.minutesId).filter(Boolean))],
        });
        result.newIssues++;
      }
      for (const u of out.issueUpdates || []) {
        const update = { date: u.date || dateOf[u.minutesId] || "", text: u.text, minutesId: ids.has(u.minutesId) ? u.minutesId : null };
        if (issueIds.has(u.issueId)) {
          writes.set(db.collection("suggestions").doc(), {
            kind: "update", state: "pending", createdAt: now, issueId: u.issueId,
            status: STATUSES.includes(u.status) ? u.status : null, updates: [update],
            minutesIds: update.minutesId ? [update.minutesId] : [],
          });
          result.updates++;
        } else if (pendingById[u.issueId]) {
          // News about an issue that is itself still awaiting review: fold it into that suggestion.
          const p = pendingById[u.issueId];
          p.updates = [...(p.updates || []), update];
          writes.update(db.doc(`suggestions/${p.id}`), {
            updates: p.updates, status: STATUSES.includes(u.status) ? u.status : p.status,
            minutesIds: [...new Set([...(p.minutesIds || []), update.minutesId].filter(Boolean))],
          });
          result.updates++;
        } else {
          logger.warn("update for unknown issue dropped", u.issueId);
        }
      }
      for (const m of batch) writes.update(db.doc(`minutes/${m.id}`), { aiStatus: "done", aiError: null, aiAt: now });
      await writes.commit();
      result.analyzed += batch.length;
    } catch (e) {
      logger.error("analysis failed", e);
      const msg = friendly(e);
      await Promise.all(batch.map(m => db.doc(`minutes/${m.id}`).update({ aiStatus: "error", aiError: msg })));
      result.failed += batch.length;
    }
  }
  return result;
}

function friendly(e) {
  if (e instanceof Anthropic.AuthenticationError) return "The Claude API key isn't valid. Ask the admin to check it.";
  if (e instanceof Anthropic.RateLimitError) return "Claude is busy right now. Try again in a few minutes.";
  if (e instanceof Anthropic.APIError) return `Claude API error ${e.status}: ${e.message}`;
  return e.message;
}

module.exports = { analyzeMinutes, fileToContent, SCHEMA };
