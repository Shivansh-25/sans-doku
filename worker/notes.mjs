import { isAdmin } from "./access.mjs";
import { sessionUser } from "./account.mjs";
// Notes from the owner to the sans account: free-form messages and milestone texts.
const notesMilestoneKeys = ["first", "ten", "fifty", "hundred", "streak7", "hard"];
const notesHeaders = { "Content-Type": "application/json", "Cache-Control": "no-store" };
const notesReply = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: notesHeaders });
async function notesRead(env, admin) {
  const [messages, milestones, custom] = await env.DB.batch([
    env.DB.prepare("SELECT id, text, created_at AS at FROM sans_messages ORDER BY id DESC LIMIT 30").bind(),
    env.DB.prepare("SELECT key, text FROM milestone_notes").bind(),
    env.DB.prepare(
      `SELECT id, title, kind, difficulty, value, on_date, text, enabled FROM custom_milestones
       ${admin ? "" : "WHERE enabled = 1"} ORDER BY id`,
    ).bind(),
  ]);
  return {
    messages: messages.results,
    milestones: Object.fromEntries(milestones.results.map((r) => [r.key, r.text])),
    custom: custom.results,
  };
}
// Rule kinds and their allowed numeric ranges (kept in step with src/milestones.ts).
const notesRuleLimits = { total: 5000, difficulty: 5000, streak: 365, days: 2000, nohint: 5000, fast: 600 };
const notesLevels = ["easy", "medium", "hard"];
function notesCleanCustom(body) {
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!title || title.length > 60) return { error: "Give it a title (up to 60 characters)." };
  if (!text || text.length > 600) return { error: "Write the message (up to 600 characters)." };
  const kind = body.kind;
  let value = body.value;
  let difficulty = null;
  let onDate = null;
  if (kind === "date") {
    if (typeof body.on_date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.on_date) || Number.isNaN(Date.parse(body.on_date)))
      return { error: "Pick a valid date." };
    if (body.on_date < "2025-01-01" || body.on_date > "2100-12-31") return { error: "Pick a date between 2025 and 2100." };
    onDate = body.on_date;
    value = 0;
  } else {
    if (typeof kind !== "string" || !Object.hasOwn(notesRuleLimits, kind)) return { error: "Unknown rule." };
    if (!Number.isSafeInteger(value) || value < 1 || value > notesRuleLimits[kind])
      return { error: `Choose a number between 1 and ${notesRuleLimits[kind]}.` };
    if (kind === "difficulty" || kind === "fast") {
      if (body.difficulty && !notesLevels.includes(body.difficulty)) return { error: "Unknown level." };
      if (kind === "difficulty" && !body.difficulty) return { error: "Choose a level." };
      difficulty = body.difficulty || null;
    }
  }
  return { title, text, kind, value, difficulty, onDate, enabled: body.enabled === false ? 0 : 1 };
}
export async function handleNotes(request, env) {
  const url = new URL(request.url);
  if (!env.DB) return notesReply({ error: "Notes are unavailable." }, 503);
  const admin = url.pathname === "/admin/api/notes";
  if (admin) {
    if (!(await isAdmin(request, env))) return notesReply({ error: "Admin sign-in required" }, 401);
  } else if (!(await sessionUser(request, env))) {
    return notesReply({ error: "Please sign in." }, 401);
  }
  try {
    if (request.method === "GET") return notesReply(await notesRead(env, admin));
    if (!admin || request.method !== "POST") return notesReply({ error: "Method not allowed" }, 405);
    if (request.headers.get("Origin") !== url.origin) return notesReply({ error: "Origin not allowed" }, 403);
    if (!request.headers.get("Content-Type")?.startsWith("application/json"))
      return notesReply({ error: "JSON required" }, 415);
    const text = await request.text();
    if (text.length > 6000) return notesReply({ error: "Request too large" }, 413);
    const body = JSON.parse(text);
    const note = typeof body.text === "string" ? body.text.trim() : "";
    if (note.length > 600) return notesReply({ error: "Keep it under 600 characters." }, 400);
    const now = Date.now();
    if (body.action === "send") {
      if (!note) return notesReply({ error: "Write something first." }, 400);
      await env.DB.batch([
        env.DB.prepare("INSERT INTO sans_messages (text, created_at) VALUES (?, ?)").bind(note, now),
      ]);
    } else if (body.action === "delete") {
      if (!Number.isSafeInteger(body.id)) return notesReply({ error: "Invalid note" }, 400);
      await env.DB.batch([env.DB.prepare("DELETE FROM sans_messages WHERE id = ?").bind(body.id)]);
    } else if (body.action === "milestone") {
      if (!notesMilestoneKeys.includes(body.key)) return notesReply({ error: "Unknown milestone" }, 400);
      await env.DB.batch([
        note
          ? env.DB.prepare(
              `INSERT INTO milestone_notes (key, text, updated_at) VALUES (?, ?, ?)
               ON CONFLICT(key) DO UPDATE SET text = excluded.text, updated_at = excluded.updated_at`,
            ).bind(body.key, note, now)
          : env.DB.prepare("DELETE FROM milestone_notes WHERE key = ?").bind(body.key),
      ]);
    } else if (body.action === "custom_save") {
      const c = notesCleanCustom(body);
      if (c.error) return notesReply({ error: c.error }, 400);
      if (body.id === undefined || body.id === null) {
        const count = (await env.DB.batch([env.DB.prepare("SELECT COUNT(*) AS n FROM custom_milestones").bind()]))[0].results[0].n;
        if (count >= 50) return notesReply({ error: "That's plenty of milestones (50 max)." }, 400);
        await env.DB.batch([
          env.DB.prepare(
            `INSERT INTO custom_milestones (title, kind, difficulty, value, on_date, text, enabled, created_at)
             VALUES (?,?,?,?,?,?,?,?)`,
          ).bind(c.title, c.kind, c.difficulty, c.value, c.onDate, c.text, c.enabled, now),
        ]);
      } else {
        if (!Number.isSafeInteger(body.id)) return notesReply({ error: "Invalid milestone" }, 400);
        await env.DB.batch([
          env.DB.prepare(
            `UPDATE custom_milestones SET title=?, kind=?, difficulty=?, value=?, on_date=?, text=?, enabled=? WHERE id=?`,
          ).bind(c.title, c.kind, c.difficulty, c.value, c.onDate, c.text, c.enabled, body.id),
        ]);
      }
    } else if (body.action === "custom_delete") {
      if (!Number.isSafeInteger(body.id)) return notesReply({ error: "Invalid milestone" }, 400);
      await env.DB.batch([env.DB.prepare("DELETE FROM custom_milestones WHERE id = ?").bind(body.id)]);
    } else return notesReply({ error: "Unknown action" }, 400);
    return notesReply(await notesRead(env, true));
  } catch {
    return notesReply({ error: "Notes are temporarily unavailable." }, 503);
  }
}
