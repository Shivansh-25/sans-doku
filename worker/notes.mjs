import { isAdmin } from "./access.mjs";
import { sessionUser } from "./account.mjs";
// Notes from the owner to the sans account: free-form messages and milestone texts.
const notesMilestoneKeys = ["first", "ten", "fifty", "hundred", "streak7", "hard"];
const notesHeaders = { "Content-Type": "application/json", "Cache-Control": "no-store" };
const notesReply = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: notesHeaders });
async function notesRead(env) {
  const [messages, milestones] = await env.DB.batch([
    env.DB.prepare("SELECT id, text, created_at AS at FROM sans_messages ORDER BY id DESC LIMIT 30").bind(),
    env.DB.prepare("SELECT key, text FROM milestone_notes").bind(),
  ]);
  return {
    messages: messages.results,
    milestones: Object.fromEntries(milestones.results.map((r) => [r.key, r.text])),
  };
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
    if (request.method === "GET") return notesReply(await notesRead(env));
    if (!admin || request.method !== "POST") return notesReply({ error: "Method not allowed" }, 405);
    if (request.headers.get("Origin") !== url.origin) return notesReply({ error: "Origin not allowed" }, 403);
    if (!request.headers.get("Content-Type")?.startsWith("application/json"))
      return notesReply({ error: "JSON required" }, 415);
    const text = await request.text();
    if (text.length > 4000) return notesReply({ error: "Request too large" }, 413);
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
    } else return notesReply({ error: "Unknown action" }, 400);
    return notesReply(await notesRead(env));
  } catch {
    return notesReply({ error: "Notes are temporarily unavailable." }, 503);
  }
}
