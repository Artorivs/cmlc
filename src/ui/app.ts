/** The web page. Everything about citations lives in ../cmlc.ts (one reference) and ../article.ts (a whole article). */
import {
    citeReference,
    convertArticle,
    convertNotes,
    noteTypes,
    type Note,
} from "../article.ts";
import { blank, cite, typeName, type Citation, type Fields } from "../cmlc.ts";
import { docxFootnotes, reviseDocx } from "../docx.ts";
import { GROUPS, SAMPLE, TYPES, type FieldSpec } from "./types.ts";

interface Item {
    text?: string;
    missing?: string[];
    error?: string;
    source: string;
    type?: string;
    label?: string;
    status?: Note["status"];
    warnings?: string[];
    types?: string[];
}

/** The kind of source, shown on every result so a misread (a law taken for a book) is easy to spot. */
const typePills = (names: string[]) =>
    names.map((n) => `<span class="pill kind">${esc(n)}</span>`).join("");

const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
    document.getElementById(id) as T;
const input = (id: string) => $<HTMLInputElement>(id);
const esc = (s: string) =>
    s.replace(
        /[&<>"]/g,
        (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!
    );
const italics = (s: string, tag: string) =>
    s.replace(/\*(.+?)\*/g, `<${tag}>$1</${tag}>`);
const prefs = {
    get(key: string): string | null {
        try {
            return localStorage.getItem(key);
        } catch {
            return null;
        }
    },
    set(key: string, value: string): void {
        try {
            localStorage.setItem(key, value);
        } catch {
            /* storage unavailable */
        }
    },
};

function attempt(citation: () => Citation, source: string): Item {
    try {
        return { ...citation(), source };
    } catch (error) {
        return { error: (error as Error).message, source };
    }
}

const STATUS = {
    done: ["ok", "已按手册改写"],
    partial: ["gaps", "部分改写，其余保留原文"],
    kept: ["muted", "未识别，保留原文"],
} as const;

/** A footnote of an article as a result row. */
const noteItem = (note: Note): Item => ({
    text: note.text,
    source: note.source,
    label: note.label,
    status: note.status,
    missing: note.pieces.flatMap((p) => p.missing),
    warnings: [...new Set(note.pieces.flatMap((p) => p.warnings))],
    types: noteTypes(note),
});

// ── results view ─────────────────────────────────────────────────────────
const results = {
    items: [] as Item[],

    show(items: Item[]) {
        this.items = items;
        this.render();
    },

    footnote(item: Item): string {
        let html = italics(esc(item.text!), "em");
        for (const label of new Set(item.missing))
            html = html
                .split(`[${esc(label)}]`)
                .join(`<span class="gap">[${esc(label)}]</span>`);
        return html;
    },

    row(item: Item, i: number): string {
        if (item.label !== undefined) return this.note(item, i);
        const source = item.source
            ? `<div class="src">原文：${esc(item.source)}</div>`
            : "";
        if (item.error)
            return `<div class="cite error"><div class="text">${esc(item.error)}</div>${source}<div class="meta"><span class="pill err">无法转换</span></div></div>`;
        const missing = item.missing!;
        const pill = missing.length
            ? `<span class="pill gaps">缺 ${missing.length} 项：${esc(missing.join("、"))}</span>`
            : `<span class="pill ok">要素齐全</span>`;
        return `<div class="cite"><div class="text">${this.footnote(item)}</div>${source}<div class="meta">${typePills([typeName(item.type)])}${pill}<button class="btn small" data-copy="${i}">复制</button></div></div>`;
    },

    note(item: Item, i: number): string {
        const [cls, words] = STATUS[item.status!];
        const missing = item.missing!.length
            ? `<span class="pill gaps">缺 ${item.missing!.length} 项：${esc(item.missing!.join("、"))}</span>`
            : "";
        const warnings = item
            .warnings!.map((w) => `<div class="warn">${esc(w)}</div>`)
            .join("");
        const source =
            item.source !== item.text
                ? `<details class="src"><summary>原文</summary>${esc(item.source)}</details>`
                : "";
        return (
            `<div class="cite note" data-label="[${esc(item.label!)}]"><div class="text">${this.footnote(item)}</div>${warnings}${source}` +
            `<div class="meta">${typePills(item.types!)}<span class="pill ${cls}">${words}</span>${missing}<button class="btn small" data-copy="${i}">复制</button></div></div>`
        );
    },

    render() {
        $("results").innerHTML = this.items.length
            ? this.items.map((it, i) => this.row(it, i)).join("")
            : `<div class="empty">在左边粘贴原文或逐项填写，结果会显示在这里。</div>`;
        const count = (test: (it: Item) => boolean) =>
            this.items.filter(test).length;
        if (this.items.some((it) => it.status)) {
            $("tally").textContent = (
                [
                    [count((it) => it.status === "done"), "条已改写"],
                    [count((it) => it.status === "partial"), "条部分改写"],
                    [count((it) => it.status === "kept"), "条保留原文"],
                    [count((it) => it.missing!.length > 0), "条有缺项"],
                ] as const
            )
                .filter(([n]) => n)
                .map(([n, s]) => `${n} ${s}`)
                .join(" · ");
            return;
        }
        $("tally").textContent = (
            [
                [count((it) => !it.error && !it.missing!.length), "条齐全"],
                [
                    count((it) => !it.error && it.missing!.length > 0),
                    "条有缺项",
                ],
                [count((it) => Boolean(it.error)), "条无法转换"],
            ] as const
        )
            .filter(([n]) => n)
            .map(([n, s]) => `${n} ${s}`)
            .join(" · ");
    },
};

// ── clipboard ────────────────────────────────────────────────────────────
let toastTimer: ReturnType<typeof setTimeout> | undefined;
function toast(message: string) {
    const el = $("toast");
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        el.hidden = true;
    }, 1600);
}

/** Plain text plus HTML, so Word keeps the italics. */
async function copy(texts: string[]) {
    const plain = texts.map((t) => t.replace(/\*(.+?)\*/g, "$1")).join("\n");
    const html = texts.map((t) => `<p>${italics(esc(t), "i")}</p>`).join("");
    const done = () =>
        toast(texts.length > 1 ? `已复制 ${texts.length} 条` : "已复制");
    try {
        await navigator.clipboard.write([
            new ClipboardItem({
                "text/plain": new Blob([plain], { type: "text/plain" }),
                "text/html": new Blob([html], { type: "text/html" }),
            }),
        ]);
        done();
    } catch {
        try {
            await navigator.clipboard.writeText(plain);
            done();
        } catch {
            toast("浏览器不允许复制，请手动选中文字复制");
        }
    }
}

// ── raw input ────────────────────────────────────────────────────────────
function convertRaw() {
    const raw = $<HTMLTextAreaElement>("raw").value;
    prefs.set("cmlc-raw", raw);
    const lines = raw
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
    results.show(lines.map((line) => attempt(() => citeReference(line), line)));
}

// ── form input ───────────────────────────────────────────────────────────
type FormValues = Record<string, unknown>;

const form = {
    id: (type: string, key: string) => `f-${type}-${key}`,

    field(
        type: string,
        [key, label, kind = "text", required, wide]: FieldSpec,
        values: FormValues
    ): string {
        const id = this.id(type, key),
            v = values[key];
        if (kind === "check")
            return `<div class="field wide"><label class="check"><input type="checkbox" id="${id}"${v ? " checked" : ""}> ${esc(label)}</label></div>`;
        const cls = `field${wide || kind === "date" ? " wide" : ""}${required ? " req" : ""}`;
        if (kind === "date") {
            const d = (v ?? {}) as Record<string, string>;
            const parts = (
                [
                    ["year", "年"],
                    ["month", "月"],
                    ["day", "日"],
                ] as const
            )
                .map(
                    ([k, unit]) =>
                        `<input type="number" id="${id}-${k}" placeholder="${unit}" aria-label="${esc(label)}${unit}" value="${esc(d[k] ?? "")}">`
                )
                .join("");
            return `<div class="${cls}"><label for="${id}-year">${esc(label)}</label><div class="row" style="flex-wrap:nowrap">${parts}</div></div>`;
        }
        return `<div class="${cls}"><label for="${id}">${esc(label)}</label><input type="text" id="${id}" value="${esc(String(v ?? ""))}"></div>`;
    },

    build(type: string, values: FormValues = {}) {
        $<HTMLSelectElement>("type").value = type;
        $("fields").innerHTML = TYPES[type]![1].map((spec) =>
            this.field(type, spec, values)
        ).join("");
    },

    read(): Fields {
        const type = $<HTMLSelectElement>("type").value,
            fields: Fields = { type };
        const readers = {
            check: (id: string) => input(id).checked || undefined,
            date(id: string) {
                const [year, month, day] = ["year", "month", "day"].map(
                    (k) => input(`${id}-${k}`).value || null
                );
                return year || month || day ? { year, month, day } : undefined;
            },
            list: (id: string) =>
                input(id)
                    .value.split(/[、,，]/)
                    .map((s) => s.trim())
                    .filter(Boolean),
            enlist: (id: string) =>
                input(id)
                    .value.split(/\s*;\s*/)
                    .filter(Boolean),
            text: (id: string) => input(id).value.trim(),
        };
        for (const [key, , kind = "text"] of TYPES[type]![1]) {
            const value = readers[kind](this.id(type, key));
            if (!blank(value)) fields[key] = value;
        }
        if (fields.is_translation && !("translators" in fields))
            fields.translators = null;
        if (input("unverified").checked) fields.unverified = true;
        return fields;
    },
};

// ── whole article ────────────────────────────────────────────────────────
const articleBox = $<HTMLTextAreaElement>("article");
const download: { name: string; data: BlobPart | null; type: string } = {
    name: "",
    data: null,
    type: "",
};
/** The Word file last opened, so that switching 修订模式 rewrites it again. */
let word: { file: Uint8Array; name: string; notes: Note[] } | null = null;

/** Formats a browser cannot open: the author saves them as .docx first. */
const SAVE_AS: Record<string, string> = {
    doc: "在 Word 中选“文件 → 另存为”，格式选“Word 文档（.docx）”",
    wps: "在 WPS 中选“文件 → 另存为”，格式选“Word 文件（.docx）”",
    pages: "在 Pages 中选“文件 → 导出为 → Word”",
    odt: "在 LibreOffice 中选“文件 → 另存为”，格式选“Word 2007–365（.docx）”",
    rtf: "在 Word 中选“文件 → 另存为”，格式选“Word 文档（.docx）”",
};

function convertPasted() {
    word = null;
    const text = articleBox.value;
    if (!text.trim()) {
        results.show([]);
        return;
    }
    const article = convertArticle(text);
    offer(article.document, "article.revised.md");
    results.show(article.notes.map(noteItem));
}

async function offerWord() {
    if (!word) return;
    const data = await reviseDocx(word.file, word.notes, {
        track: input("track").checked,
    });
    offer(
        data as BlobPart,
        word.name.replace(/\.docx$/i, "") + ".revised.docx",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
}

async function convertFile(file: File) {
    const ext = file.name.match(/\.(\w+)$/)?.[1]?.toLowerCase() ?? "";
    try {
        if (ext in SAVE_AS) {
            offer(null, "");
            results.show([
                {
                    source: file.name,
                    error: `网页版不能直接打开 .${ext} 文件。请${SAVE_AS[ext]}，再上传 .docx；处理后的 .docx 可以照常用原来的软件打开。`,
                },
            ]);
        } else if (ext === "docx") {
            const bytes = new Uint8Array(await file.arrayBuffer());
            const notes = convertNotes(await docxFootnotes(bytes));
            if (!notes.length) {
                toast("这份 Word 文件里没有脚注");
                return;
            }
            articleBox.value = "";
            word = { file: bytes, name: file.name, notes };
            await offerWord();
            results.show(notes.map(noteItem));
        } else {
            articleBox.value = await file.text();
            convertPasted();
            offer(download.data, file.name.replace(/(\.\w+)?$/, ".revised$1"));
        }
    } catch (error) {
        toast((error as Error).message);
    }
}

function offer(
    data: BlobPart | null,
    name: string,
    type = "text/plain;charset=utf-8"
) {
    Object.assign(download, { data, name, type });
    $("download-article").hidden = !data;
    $("download-article").textContent = /\.docx$/.test(name)
        ? "下载修订后的 Word 文件"
        : "下载修订稿";
    $("track-option").hidden = !word;
}

function save() {
    if (!download.data) return;
    const url = URL.createObjectURL(
        new Blob([download.data], { type: download.type })
    );
    const a = Object.assign(document.createElement("a"), {
        href: url,
        download: download.name,
    });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── wiring ───────────────────────────────────────────────────────────────
const TABS = ["raw", "form", "article"] as const;
function showTab(name: (typeof TABS)[number]) {
    for (const tab of TABS) {
        $(`tab-${tab}`).setAttribute("aria-selected", String(tab === name));
        $(`pane-${tab}`).hidden = tab !== name;
    }
    prefs.set("cmlc-tab", name);
}

const rawBox = $<HTMLTextAreaElement>("raw");
$("type").innerHTML = GROUPS.map(
    ([group, keys]) =>
        `<optgroup label="${group}">${keys.map((k) => `<option value="${k}">${TYPES[k]![0]}</option>`).join("")}</optgroup>`
).join("");
$("type").addEventListener("change", (e) =>
    form.build((e.target as HTMLSelectElement).value)
);
$("tab-raw").addEventListener("click", () => showTab("raw"));
$("tab-form").addEventListener("click", () => showTab("form"));
$("tab-article").addEventListener("click", () => showTab("article"));
$("go-article").addEventListener("click", convertPasted);
$("sample-article").addEventListener("click", () => {
    articleBox.value = SAMPLE.article;
    convertPasted();
});
$("clear-article").addEventListener("click", () => {
    articleBox.value = "";
    input("article-file").value = "";
    word = null;
    offer(null, "");
    results.show([]);
});
$("download-article").addEventListener("click", save);
input("track").addEventListener("change", () => {
    offerWord().catch((error) => toast((error as Error).message));
});
input("article-file").addEventListener("change", () => {
    const file = input("article-file").files?.[0];
    if (file) convertFile(file);
});
$("go-raw").addEventListener("click", convertRaw);
$("sample-raw").addEventListener("click", () => {
    rawBox.value = SAMPLE.raw;
    convertRaw();
});
$("clear-raw").addEventListener("click", () => {
    rawBox.value = "";
    prefs.set("cmlc-raw", "");
    results.show([]);
});
$("go-form").addEventListener("click", () =>
    results.show([attempt(() => cite(form.read()), "")])
);
$("clear-form").addEventListener("click", () => {
    form.build($<HTMLSelectElement>("type").value);
    input("unverified").checked = false;
});
$("results").addEventListener("click", (e) => {
    const i = (e.target as HTMLElement).dataset.copy;
    if (i !== undefined) copy([results.items[Number(i)]!.text!]);
});
$("copy-all").addEventListener("click", () => {
    const texts = results.items.filter((it) => !it.error).map((it) => it.text!);
    if (texts.length) copy(texts);
});

form.build(SAMPLE.form.type, SAMPLE.form);
rawBox.value = prefs.get("cmlc-raw")?.trim()
    ? prefs.get("cmlc-raw")!
    : SAMPLE.raw;
const saved = prefs.get("cmlc-tab");
showTab(saved === "form" || saved === "article" ? saved : "raw");
if (saved === "article") results.show([]);
else convertRaw();
