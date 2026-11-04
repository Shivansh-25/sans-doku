import {
  BUILTIN_MILESTONES,
  RULE_KINDS,
  ruleOf,
  ruleText,
  type CustomRow,
  type RuleKind,
} from "./milestones";
import type { Difficulty } from "./game";
type NotesData = {
  messages: { id: number; text: string; at: number }[];
  milestones: Record<string, string>;
  custom: CustomRow[];
};
const levels: Difficulty[] = ["easy", "medium", "hard"];
const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { class?: string } = {},
  ...kids: (string | Node)[]
) => {
  const node = document.createElement(tag);
  const { class: cls, ...rest } = props as Record<string, unknown>;
  if (cls) node.className = String(cls);
  Object.assign(node, rest);
  node.append(...kids);
  return node;
};
async function call(body?: object): Promise<NotesData> {
  const r = await fetch(
    "/admin/api/notes",
    body
      ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
      : { cache: "no-store" },
  );
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || "Something went wrong");
  return data;
}
// A text box with a live character count and a preview of the card she will see.
function messageBox(initial: string, placeholder: string, title: () => string) {
  const area = el("textarea", { rows: 3, maxLength: 600, placeholder, value: initial });
  const count = el("span", { class: "count" });
  const preview = el("div", { class: "preview" });
  const update = () => {
    count.textContent = `${area.value.length}/600`;
    preview.replaceChildren(
      el("strong", {}, title() || "A little note for you ♡"),
      el("p", {}, area.value.trim() || placeholder),
    );
  };
  area.addEventListener("input", update);
  update();
  return { area, count, preview, update };
}
export function mountNotes(root: HTMLElement) {
  root.replaceChildren();
  const status = el("p", { class: "status", role: "status" });
  const flash = (text: string, bad = false) => {
    status.textContent = text;
    status.classList.toggle("bad", bad);
  };
  let data: NotesData = { messages: [], milestones: {}, custom: [] };
  const render = () => {
    root.replaceChildren(status, sendCard(), milestoneCard());
  };
  async function act(body: object, done: string): Promise<boolean> {
    flash("Saving…");
    try {
      data = await call(body);
      flash(done);
      render();
      return true;
    } catch (e) {
      flash(e instanceof Error ? e.message : "Something went wrong", true);
      return false;
    }
  }
  function sendCard() {
    const box = messageBox("", "Good morning ♡", () => "A little note for you ♡");
    const send = el("button", { class: "primary" }, "Send note");
    send.onclick = async () => {
      if (await act({ action: "send", text: box.area.value }, "Sent ♡ She'll see it the next time she opens the app.")) return;
    };
    const sent = el("div", { class: "sent" });
    for (const m of data.messages) {
      const del = el("button", { class: "link" }, "Delete");
      del.onclick = () => void act({ action: "delete", id: m.id }, "Deleted");
      sent.append(el("div", { class: "sent-note" }, el("span", {}, `${new Date(m.at).toLocaleString()} · ${m.text}`), del));
    }
    return el(
      "section",
      { class: "panel" },
      el("h2", {}, "Send her a note ♡"),
      el("p", { class: "hint" }, "It appears once, the next time she opens the app signed in, and stays under Stats → Little notes."),
      box.area,
      el("div", { class: "row" }, send, box.count),
      el("p", { class: "hint" }, "What she'll see:"),
      box.preview,
      data.messages.length ? el("h3", {}, "Sent notes") : "",
      sent,
    );
  }
  function milestoneCard() {
    const list = el("div", { class: "milestones" });
    for (const b of BUILTIN_MILESTONES) {
      const custom = data.milestones[b.key];
      list.append(
        row({
          title: b.title,
          rule: ruleText(b.rule),
          text: custom || b.defaultText,
          tag: custom ? "your wording" : "built-in",
          onEdit: () => builtinEditor(b.key, b.title, ruleText(b.rule), custom || "", b.defaultText),
        }),
      );
    }
    for (const c of data.custom) {
      list.append(
        row({
          title: c.title,
          rule: ruleText(ruleOf(c)),
          text: c.text,
          tag: c.enabled ? "custom" : "off",
          dim: !c.enabled,
          onEdit: () => customEditor(c),
        }),
      );
    }
    const add = el("button", { class: "primary" }, "+ Add a milestone");
    add.onclick = () => customEditor();
    return el(
      "section",
      { class: "panel" },
      el("h2", {}, "Milestones ♡"),
      el("p", { class: "hint" }, "Special moments that unlock a message for her automatically, based on what she's done. She sees each one once and can reread them under Stats → Little notes."),
      list,
      el("div", { class: "row" }, add),
      editorHost,
    );
  }
  const editorHost = el("div", { class: "editor-host" });
  function row(o: { title: string; rule: string; text: string; tag: string; dim?: boolean; onEdit: () => void }) {
    const edit = el("button", {}, "Edit");
    edit.onclick = o.onEdit;
    return el(
      "div",
      { class: "milestone" + (o.dim ? " dim" : "") },
      el(
        "div",
        { class: "milestone-main" },
        el("strong", {}, o.title, " ", el("span", { class: "tag" }, o.tag)),
        el("span", { class: "rule" }, o.rule),
        el("span", { class: "msg" }, o.text),
      ),
      edit,
    );
  }
  function open(form: HTMLElement) {
    editorHost.replaceChildren(form);
    form.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  function builtinEditor(key: string, title: string, rule: string, current: string, fallback: string) {
    const box = messageBox(current, fallback, () => title);
    const save = el("button", { class: "primary" }, "Save wording");
    save.onclick = async () => {
      if (await act({ action: "milestone", key, text: box.area.value }, "Saved")) editorHost.replaceChildren();
    };
    const reset = el("button", {}, "Use the built-in wording");
    reset.onclick = async () => {
      if (await act({ action: "milestone", key, text: "" }, "Back to the built-in wording")) editorHost.replaceChildren();
    };
    const cancel = el("button", { class: "link" }, "Cancel");
    cancel.onclick = () => editorHost.replaceChildren();
    open(
      el(
        "div",
        { class: "editor" },
        el("h3", {}, `Edit: ${title}`),
        el("p", { class: "hint" }, `Unlocks when she does this: ${rule}. The rule is built in; you choose the words.`),
        box.area,
        el("div", { class: "row" }, save, reset, cancel, box.count),
        el("p", { class: "hint" }, "What she'll see:"),
        box.preview,
      ),
    );
  }
  function customEditor(existing?: CustomRow) {
    const title = el("input", { type: "text", maxLength: 60, placeholder: "e.g. Twenty-five puzzles", value: existing?.title || "" });
    const kind = el("select", {});
    for (const k of RULE_KINDS) kind.append(el("option", { value: k.kind, selected: (existing?.kind || "total") === k.kind }, k.label));
    const value = el("input", { type: "number", min: "1", step: "1", value: String(existing?.value || 10) });
    const level = el("select", {});
    level.append(el("option", { value: "" }, "any level"));
    for (const l of levels) level.append(el("option", { value: l, selected: existing?.difficulty === l }, l));
    const date = el("input", { type: "date", min: "2025-01-01", max: "2100-12-31", value: existing?.on_date || "" });
    const unit = el("span", { class: "unit" });
    const valueRow = el("label", { class: "field" }, "How many ", value, unit);
    const levelRow = el("label", { class: "field" }, "Level ", level);
    const dateRow = el("label", { class: "field" }, "Date ", date);
    const enabled = el("input", { type: "checkbox", checked: existing ? Boolean(existing.enabled) : true });
    const rulePreview = el("p", { class: "rule-preview" });
    const box = messageBox(existing?.text || "", "Write what you want her to read ♡", () => title.value);
    const sync = () => {
      const k = kind.value as RuleKind;
      const info = RULE_KINDS.find((x) => x.kind === k)!;
      valueRow.hidden = k === "date";
      levelRow.hidden = !(k === "difficulty" || k === "fast");
      dateRow.hidden = k !== "date";
      (level.firstChild as HTMLOptionElement).textContent = k === "fast" ? "any level" : "choose a level";
      (level.firstChild as HTMLOptionElement).disabled = k === "difficulty";
      if (k === "difficulty" && !level.value) level.value = existing?.difficulty || "easy";
      unit.textContent = info.unit ? ` ${info.unit}` : "";
      value.max = String(info.max || 1);
      rulePreview.textContent =
        "Unlocks when: " +
        ruleText({
          kind: k,
          value: Number(value.value) || 1,
          ...(level.value ? { difficulty: level.value as Difficulty } : {}),
          ...(date.value ? { date: date.value } : {}),
        });
      box.update();
    };
    [kind, value, level, date, title].forEach((i) => i.addEventListener("input", sync));
    sync();
    const save = el("button", { class: "primary" }, existing ? "Save changes" : "Add milestone");
    save.onclick = async () => {
      const k = kind.value as RuleKind;
      const ok = await act(
        {
          action: "custom_save",
          ...(existing ? { id: existing.id } : {}),
          title: title.value,
          kind: k,
          value: k === "date" ? 0 : Number(value.value),
          difficulty: level.value || null,
          on_date: k === "date" ? date.value : null,
          text: box.area.value,
          enabled: enabled.checked,
        },
        existing ? "Saved" : "Added ♡",
      );
      if (ok) editorHost.replaceChildren();
    };
    const cancel = el("button", { class: "link" }, "Cancel");
    cancel.onclick = () => editorHost.replaceChildren();
    const del = el("button", { class: "danger" }, "Delete");
    del.onclick = async () => {
      if (existing && confirm(`Delete “${existing.title}”?`) && (await act({ action: "custom_delete", id: existing.id }, "Deleted")))
        editorHost.replaceChildren();
    };
    open(
      el(
        "div",
        { class: "editor" },
        el("h3", {}, existing ? "Edit milestone" : "New milestone"),
        el("label", { class: "field" }, "Title ", title),
        el("label", { class: "field" }, "Unlocks on ", kind),
        valueRow,
        levelRow,
        dateRow,
        rulePreview,
        el("label", { class: "field check" }, enabled, " Active (she can unlock it)"),
        el("p", { class: "hint" }, "Message"),
        box.area,
        el("p", { class: "hint" }, "What she'll see:"),
        box.preview,
        el("div", { class: "row" }, save, cancel, existing ? del : "", box.count),
      ),
    );
  }
  flash("Loading…");
  call().then(
    (d) => {
      data = d;
      flash("");
      render();
    },
    () => flash("Couldn't load notes.", true),
  );
}
