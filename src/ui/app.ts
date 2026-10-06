/** The web page. It only talks to `cite` and `parse`; everything about citations lives in ../cmlc.ts. */
import { blank, cite, parse, type Fields } from "../cmlc.ts";
import { GROUPS, SAMPLE, TYPES, type FieldSpec } from "./types.ts";

interface Item { text?: string; missing?: string[]; error?: string; source: string }

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const input = (id: string) => $<HTMLInputElement>(id);
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const italics = (s: string, tag: string) => s.replace(/\*(.+?)\*/g, `<${tag}>$1</${tag}>`);
const prefs = {
  get(key: string): string | null { try { return localStorage.getItem(key); } catch { return null; } },
  set(key: string, value: string): void { try { localStorage.setItem(key, value); } catch { /* storage unavailable */ } },
};

function attempt(fields: () => Fields, source: string): Item {
  try { return { ...cite(fields()), source }; }
  catch (error) { return { error: (error as Error).message, source }; }
}

// ── results view ─────────────────────────────────────────────────────────
const results = {
  items: [] as Item[],

  show(items: Item[]) { this.items = items; this.render(); },

  footnote(item: Item): string {
    let html = italics(esc(item.text!), "em");
    for (const label of new Set(item.missing)) html = html.split(`[${esc(label)}]`).join(`<span class="gap">[${esc(label)}]</span>`);
    return html;
  },

  row(item: Item, i: number): string {
    const source = item.source ? `<div class="src">原文：${esc(item.source)}</div>` : "";
    if (item.error) return `<div class="cite error"><div class="text">${esc(item.error)}</div>${source}<div class="meta"><span class="pill err">无法转换</span></div></div>`;
    const missing = item.missing!;
    const pill = missing.length
      ? `<span class="pill gaps">缺 ${missing.length} 项：${esc(missing.join("、"))}</span>`
      : `<span class="pill ok">要素齐全</span>`;
    return `<div class="cite"><div class="text">${this.footnote(item)}</div>${source}<div class="meta">${pill}<button class="btn small" data-copy="${i}">复制</button></div></div>`;
  },

  render() {
    $("results").innerHTML = this.items.length ? this.items.map((it, i) => this.row(it, i)).join("")
      : `<div class="empty">在左边粘贴原文或逐项填写，结果会显示在这里。</div>`;
    const count = (test: (it: Item) => boolean) => this.items.filter(test).length;
    $("tally").textContent = ([
      [count(it => !it.error && !it.missing!.length), "条齐全"],
      [count(it => !it.error && it.missing!.length > 0), "条有缺项"],
      [count(it => Boolean(it.error)), "条无法转换"],
    ] as const).filter(([n]) => n).map(([n, s]) => `${n} ${s}`).join(" · ");
  },
};

// ── clipboard ────────────────────────────────────────────────────────────
let toastTimer: ReturnType<typeof setTimeout> | undefined;
function toast(message: string) {
  const el = $("toast");
  el.textContent = message; el.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 1600);
}

/** Plain text plus HTML, so Word keeps the italics. */
async function copy(texts: string[]) {
  const plain = texts.map(t => t.replace(/\*(.+?)\*/g, "$1")).join("\n");
  const html = texts.map(t => `<p>${italics(esc(t), "i")}</p>`).join("");
  const done = () => toast(texts.length > 1 ? `已复制 ${texts.length} 条` : "已复制");
  try {
    await navigator.clipboard.write([new ClipboardItem({
      "text/plain": new Blob([plain], { type: "text/plain" }), "text/html": new Blob([html], { type: "text/html" })
    })]);
    done();
  } catch {
    try { await navigator.clipboard.writeText(plain); done(); }
    catch { toast("浏览器不允许复制，请手动选中文字复制"); }
  }
}

// ── raw input ────────────────────────────────────────────────────────────
function convertRaw() {
  const raw = $<HTMLTextAreaElement>("raw").value;
  prefs.set("cmlc-raw", raw);
  const lines = raw.split("\n").map(s => s.trim()).filter(Boolean);
  results.show(lines.map(line => attempt(() => parse(line), line)));
}

// ── form input ───────────────────────────────────────────────────────────
type FormValues = Record<string, unknown>;

const form = {
  id: (type: string, key: string) => `f-${type}-${key}`,

  field(type: string, [key, label, kind = "text", required, wide]: FieldSpec, values: FormValues): string {
    const id = this.id(type, key), v = values[key];
    if (kind === "check") return `<div class="field wide"><label class="check"><input type="checkbox" id="${id}"${v ? " checked" : ""}> ${esc(label)}</label></div>`;
    const cls = `field${wide || kind === "date" ? " wide" : ""}${required ? " req" : ""}`;
    if (kind === "date") {
      const d = (v ?? {}) as Record<string, string>;
      const parts = ([["year", "年"], ["month", "月"], ["day", "日"]] as const).map(([k, unit]) =>
        `<input type="number" id="${id}-${k}" placeholder="${unit}" aria-label="${esc(label)}${unit}" value="${esc(d[k] ?? "")}">`).join("");
      return `<div class="${cls}"><label for="${id}-year">${esc(label)}</label><div class="row" style="flex-wrap:nowrap">${parts}</div></div>`;
    }
    return `<div class="${cls}"><label for="${id}">${esc(label)}</label><input type="text" id="${id}" value="${esc(String(v ?? ""))}"></div>`;
  },

  build(type: string, values: FormValues = {}) {
    $<HTMLSelectElement>("type").value = type;
    $("fields").innerHTML = TYPES[type]![1].map(spec => this.field(type, spec, values)).join("");
  },

  read(): Fields {
    const type = $<HTMLSelectElement>("type").value, fields: Fields = { type };
    const readers = {
      check: (id: string) => input(id).checked || undefined,
      date(id: string) {
        const [year, month, day] = ["year", "month", "day"].map(k => input(`${id}-${k}`).value || null);
        return year || month || day ? { year, month, day } : undefined;
      },
      list: (id: string) => input(id).value.split(/[、,，]/).map(s => s.trim()).filter(Boolean),
      enlist: (id: string) => input(id).value.split(/\s*;\s*/).filter(Boolean),
      text: (id: string) => input(id).value.trim(),
    };
    for (const [key, , kind = "text"] of TYPES[type]![1]) {
      const value = readers[kind](this.id(type, key));
      if (!blank(value)) fields[key] = value;
    }
    if (fields.is_translation && !("translators" in fields)) fields.translators = null;
    if (input("unverified").checked) fields.unverified = true;
    return fields;
  },
};

// ── wiring ───────────────────────────────────────────────────────────────
function showTab(name: "raw" | "form") {
  const raw = name === "raw";
  $("tab-raw").setAttribute("aria-selected", String(raw));
  $("tab-form").setAttribute("aria-selected", String(!raw));
  $("pane-raw").hidden = !raw;
  $("pane-form").hidden = raw;
  prefs.set("cmlc-tab", name);
}

const rawBox = $<HTMLTextAreaElement>("raw");
$("type").innerHTML = GROUPS.map(([group, keys]) =>
  `<optgroup label="${group}">${keys.map(k => `<option value="${k}">${TYPES[k]![0]}</option>`).join("")}</optgroup>`).join("");
$("type").addEventListener("change", e => form.build((e.target as HTMLSelectElement).value));
$("tab-raw").addEventListener("click", () => showTab("raw"));
$("tab-form").addEventListener("click", () => showTab("form"));
$("go-raw").addEventListener("click", convertRaw);
$("sample-raw").addEventListener("click", () => { rawBox.value = SAMPLE.raw; convertRaw(); });
$("clear-raw").addEventListener("click", () => { rawBox.value = ""; prefs.set("cmlc-raw", ""); results.show([]); });
$("go-form").addEventListener("click", () => results.show([attempt(() => form.read(), "")]));
$("clear-form").addEventListener("click", () => { form.build($<HTMLSelectElement>("type").value); input("unverified").checked = false; });
$("results").addEventListener("click", e => {
  const i = (e.target as HTMLElement).dataset.copy;
  if (i !== undefined) copy([results.items[Number(i)]!.text!]);
});
$("copy-all").addEventListener("click", () => {
  const texts = results.items.filter(it => !it.error).map(it => it.text!);
  if (texts.length) copy(texts);
});

form.build(SAMPLE.form.type, SAMPLE.form);
rawBox.value = prefs.get("cmlc-raw")?.trim() ? prefs.get("cmlc-raw")! : SAMPLE.raw;
showTab(prefs.get("cmlc-tab") === "form" ? "form" : "raw");
convertRaw();
