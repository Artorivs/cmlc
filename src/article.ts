/**
 * Whole articles. Every footnote is read; each source in it is rewritten by the manual, and everything else the
 * author wrote in the note — comments, quotations, 〔待核〕 remarks — is kept as it was.
 *
 *   convertArticle(markdown).document   // the article with its footnotes rewritten
 *   convertArticle(markdown).notes      // what happened to each note, piece by piece
 *
 * Cross-references (同上、上注5、《某法》（上注5）第3条) are written out in full where the earlier note can be read,
 * because the manual advises against shortened references until the text is final (第13条); otherwise they become
 * 同上注 / 同前注[5]，… .
 */
import { cite, parse, type Citation, type Fields } from "./cmlc.ts";
import { blank } from "./entry.ts";
import { closing, splitTop, topIndex } from "./parse/util.ts";
import { looksJapanese } from "./parse/ja.ts";
import { typeName } from "./kinds.ts";
import { isSimplified, isTraditional, Script } from "./script.ts";

/** cited: rewritten; expanded: a cross-reference written out in full; short: 同上注 / 同前注; kept: left as written. */
export type Kind = "cited" | "expanded" | "short" | "kept";
/** `type` is the source type (statute, article …) of a rewritten piece, for labelling; null for a shortened reference or kept text. */
export interface Piece {
    source: string;
    text: string;
    kind: Kind;
    type: string | null;
    missing: string[];
    warnings: string[];
}
export interface Note {
    label: string;
    source: string;
    text: string;
    pieces: Piece[];
    status: "done" | "partial" | "kept";
}

/** What kinds of source a note cites, in order: 法律法规、规范性文件、交叉引用 …. */
export const noteTypes = (note: Note): string[] => [
    ...new Set(
        note.pieces.flatMap((p) =>
            p.type ? [typeName(p.type)] : p.kind === "short" ? ["交叉引用"] : []
        )
    ),
];
export interface Article {
    format: "markdown" | "lines";
    notes: Note[];
    document: string;
}

/** A source the article has cited, for later cross-references: its fields as the author wrote them, and simplified for matching. */
interface Known {
    fields: Fields;
    plain: Fields;
    text: string;
}

const LAW_TYPES = new Set([
    "statute",
    "normative",
    "case",
    "case_gazette",
    "case_guiding",
    "case_library",
]);
const REMARK = /〔(?!\d{4}〕)[^〔〕]*〕/g;
const UNVERIFIED =
    /未读|未阅读|未经阅读|未与原文核对|未与官方文本核对|未核对|有待.*?(?:核对|阅读)|仅见|仅读过|二手|待标明|未能找到|未见/;
const SIGNAL = /^(?:参见|另见|又见|详见|转引自|例如)\s*/;
const SHORT_REF = (n: string) => `同前注[${n}]`;

// ── preparing the text ─────────────────────────────────────────────────────

/** 〈篇名〉 → 《篇名》 (a title inside it takes 〈〉, 第37条); 頁77起 → 第77頁以下. */
export function prepare(text: string): string {
    let out = "",
        titles = 0;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i]!;
        if (ch === "《") titles++;
        if (ch === "》") titles = Math.max(0, titles - 1);
        const end = ch === "〈" && !titles ? closing(text, i) : -1;
        if (end > 0) {
            out += `《${text
                .slice(i + 1, end - 1)
                .replace(/《/g, "〈")
                .replace(/》/g, "〉")}》`;
            i = end - 1;
        } else out += ch;
    }
    return out.replace(
        /([頁页])\s*(\d+(?:\s*[-–—]\s*\d+)?)\s*(起|以下)?/g,
        (_, p: string, n: string, more?: string) =>
            `第${n}${p}${more ? "以下" : ""}`
    );
}

// ── reading one source ─────────────────────────────────────────────────────

const strings = (fields: Fields, map: (s: string) => string): Fields =>
    Object.fromEntries(
        Object.entries(fields).map(([k, v]) => [
            k,
            typeof v === "string"
                ? map(v)
                : Array.isArray(v)
                  ? v.map((x) => (typeof x === "string" ? map(x) : x))
                  : v,
        ])
    ) as Fields;

/** Does the parse look like the source, rather than a loose format bending around a comment? */
function plausible(
    fields: Fields,
    body: string,
    output: string,
    missing: string[]
): boolean {
    const type = String(fields.type);
    if (type === "normative")
        return Boolean(fields.doc_no || fields.date || fields.issuer);
    if (type === "statute") return true;
    const names = Array.isArray(fields.authors)
        ? fields.authors.map(String)
        : [];
    if (names.some((n) => n.length > 25 || /[：:《》，,。（(]/.test(n)))
        return false;
    if (type === "book" && blank(fields.publisher)) return false;
    if (/^case/.test(type) && missing.length) return false;
    if (
        missing.length > 2 ||
        (missing.includes("出版社") && missing.includes("出版年份"))
    )
        return false;
    return (body.match(/\d+/g) ?? []).every((n) => output.includes(n)); // nothing numeric dropped
}

interface Reading {
    known: Known;
    text: string;
    missing: string[];
    warnings: string[];
    rest: string;
}

/** One source at `from` in the note that may run on (，增设刑法第139条之一): the longest readable lead, and what follows. */
function readSource(script: Script, from: number): Reading | null {
    const body = script.plain.slice(from);
    const parts = splitTop(body, "，,");
    for (let n = parts.length; n >= 1; n--) {
        const lead = parts
            .slice(0, n)
            .map((p, i) => p.part + (i < n - 1 ? p.sep : ""))
            .join("");
        if (!lead.trim()) continue;
        let fields: Fields;
        try {
            fields = parse(lead.trim());
        } catch {
            continue;
        }
        const restored = strings(fields, (s) => script.original(s));
        let result;
        try {
            result = cite(restored);
        } catch {
            continue;
        }
        if (!plausible(fields, lead, result.text, result.missing)) continue;
        const warnings =
            Array.isArray(restored.unused) && restored.unused.length
                ? [`未写入引注：${restored.unused.join("；")}`]
                : [];
        return {
            known: { fields: restored, plain: fields, text: script.text },
            text: script.restyle(result.text),
            missing: result.missing,
            warnings,
            rest: script.text.slice(from + lead.length),
        };
    }
    return null;
}

/** A citation, possibly after a lead-in (本研究检得的著作包括：…) or a signal (参见). */
function readCore(script: Script): (Reading & { prefix: string }) | null {
    const leads = [0];
    const signal = script.plain.match(SIGNAL);
    if (signal) leads.push(signal[0].length);
    const colon = topIndex(script.plain, "：");
    if (colon > 0) leads.push(colon + 1);
    for (const at of leads) {
        const reading = readSource(script, at);
        if (reading) return { ...reading, prefix: script.text.slice(0, at) };
    }
    return null;
}

// ── cross-references ───────────────────────────────────────────────────────

const SAME = /^同上注?(?:[，,：:]\s*(?<rest>.*))?$/;
const BARE = /^见?(?:上|前)注\s*(?<nums>\d+(?:\s*[、，,]\s*\d+)*)(?<rest>.*)$/;
const LABELLED =
    /^(?<label>.{1,60}?)\s*[（(]见?(?:上|前)注\s*(?<n>\d+)[）)](?<rest>.*)$/;
const LOCATOR =
    /^[，,]?\s*(?<where>第(?:[^，,。；;：:（(]|[（(][一二三四五六七八九十\d]+[）)])+)(?:[（(](?<version>\d{4}年(?:修订|修正))[）)])?(?<after>.*)$/;
const PAGES = /^第(?<pages>\d+(?:[-–—、]\d+)*)页(?<more>以下)?$/;

/** 第3条第2款 → arabic provisions; the rest of the text stays as written. */
function locate(
    rest: string,
    script: Script
): { where: string | null; version: string | null; after: string } {
    const m = rest.match(LOCATOR);
    if (!m) return { where: null, version: null, after: script.original(rest) };
    const where = m
        .groups!.where!.trim()
        .replace(
            /第[（(]?([一二三四五六七八九十百]+|\d+)[）)]?(条|款|项|目)/g,
            (_, n: string, unit: string) =>
                `第${/^\d+$/.test(n) ? n : toArabic(n)}${unit}`
        );
    return {
        where: script.original(where),
        version: m.groups!.version ?? null,
        after: script.original(m.groups!.after ?? ""),
    };
}

function toArabic(numeral: string): string {
    const digits = "零一二三四五六七八九";
    let total = 0,
        digit = 0;
    for (const ch of numeral) {
        if (digits.includes(ch)) digit = digits.indexOf(ch);
        else {
            total +=
                (digit || 1) *
                ({ 十: 10, 百: 100 } as Record<string, number>)[ch]!;
            digit = 0;
        }
    }
    return String(total + digit);
}

/** How well a short label (鄭州報告, 第493號令, 王貴松) names a known source: 0 for not at all. */
function score(label: string, known: Known): number {
    const p = known.plain;
    const name = String(p.name ?? p.title ?? "").replace(/^中华人民共和国/, "");
    const bare = name.replace(/（[^）]*）$/, "");
    const numbers = [String(p.doc_no ?? "")]
        .flatMap((d) => [d, d.replace(/^.*令(第\d+号)$/, "$1令")])
        .filter(Boolean);
    const authors = Array.isArray(p.authors) ? p.authors.map(String) : [];
    if ([name, String(p.alias ?? ""), ...numbers, ...authors].includes(label))
        return 4;
    if (bare.endsWith(label)) return 3;
    if (name.includes(label) || numbers.some((d) => d.includes(label)))
        return 2;
    let at = 0;
    for (const ch of label) {
        at = bare.indexOf(ch, at);
        if (at < 0) return 0;
        at++;
    }
    return label.length >= 3 && bare.endsWith(label.at(-1)!) ? 1 : 0;
}

/** The earlier source written out again with this note's locator, or null when it cannot take one. */
function expand(
    known: Known,
    where: string | null,
    version: string | null,
    script: Script,
    keep: boolean
): { text: string; missing: string[]; fields: Fields } | null {
    const fields: Fields = { ...known.fields };
    delete fields.unused;
    if (keep && !where) {
        /* 同上 / 上注5 with nothing added: the earlier note exactly */
    } else if (LAW_TYPES.has(String(fields.type))) {
        if (where) fields.locator = where;
        else delete fields.locator;
        if (version && fields.type === "statute")
            fields.version = script.original(version);
    } else {
        const pages = where && new Script(where).plain.match(PAGES);
        if (where && !pages) return null;
        if (pages)
            fields.pages =
                pages.groups!.pages! + (pages.groups!.more ? "以下" : "");
        else delete fields.pages;
    }
    const result = cite(fields);
    return {
        text: new Script(script.text + known.text, script.traditional).restyle(
            result.text
        ),
        missing: result.missing,
        fields,
    };
}

interface Context {
    previous: Known[];
    notes: Map<string, Known[]>;
    traditional: boolean;
}

/** A note's script: its own characters, or the article's when it is too short to tell (上註18). */
const noteScript = (note: string, ctx: Context): boolean =>
    isTraditional(note) || (ctx.traditional && !isSimplified(note));

/** 同上 / 上注5 / 《某法》（上注5）第3条: written out, or shortened by the manual's wording. */
function crossReference(
    script: Script,
    ctx: Context
): {
    text: string;
    kind: Kind;
    missing: string[];
    warnings: string[];
    known: Known | null;
} | null {
    const local = script,
        plain = script.plain;
    const short = (text: string, warnings: string[] = []) => ({
        text,
        kind: "short" as Kind,
        missing: [],
        warnings,
        known: null,
    });
    const written = (
        known: Known,
        where: string | null,
        version: string | null,
        after: string,
        keep = false
    ) => {
        const out = expand(known, where, version, local, keep);
        if (!out) return null;
        const joint = !where && after && !/^[，,：:]/.test(after) ? "，" : "";
        return {
            text: after
                ? out.text.replace(/。$/, "") + joint + after
                : out.text,
            kind: "expanded" as Kind,
            missing: out.missing,
            warnings: [],
            known: { ...known, fields: out.fields },
        };
    };

    const same = plain.match(SAME);
    if (same) {
        const { where, version, after } = locate(
            same.groups!.rest ?? "",
            local
        );
        if (ctx.previous.length === 1) {
            const out = written(
                ctx.previous[0]!,
                where,
                version,
                after,
                !after || /^[：:]/.test(after)
            );
            if (out) return out;
        }
        const tail = where ? `，${where}${after}` : after ? `，${after}` : "";
        return short(
            `${local.restyle("同上注")}${tail}`,
            ctx.previous.length > 1
                ? [
                      "上一注引了不止一种文献，“同上”所指不明（第13条只允许前后紧邻、文献完全相同时写“同上注”）",
                  ]
                : []
        );
    }

    const bare = plain.match(BARE);
    if (bare) {
        const nums = bare.groups!.nums!.split(/\s*[、，,]\s*/);
        const { where, version, after } = locate(
            bare.groups!.rest ?? "",
            local
        );
        const targets =
            nums.length === 1 ? (ctx.notes.get(nums[0]!) ?? []) : [];
        if (targets.length === 1) {
            const out = written(
                targets[0]!,
                where,
                version,
                after,
                !after || /^[：:]/.test(after)
            );
            if (out) return out;
        }
        const tail = where ? `，${where}${after}` : after;
        return short(`${local.restyle(SHORT_REF(nums.join("]、[")))}${tail}`);
    }

    const labelled = plain.match(LABELLED);
    if (labelled) {
        const n = labelled.groups!.n!;
        const label = labelled.groups!.label!.trim();
        if (/[，,：:；;「」“”]/.test(label)) return null;
        const rest = labelled.groups!.rest ?? "";
        if (rest && !/^[，,：:]|^第/.test(rest)) return null; // 某某（上注60）中的…: a sentence, not a reference
        const { where, version, after } = locate(rest, local);
        const key = label.replace(/[《》〈〉]/g, "").replace(/^\d{4}年/, "");
        const ranked = (ctx.notes.get(n) ?? [])
            .map((k) => [score(key, k), k] as const)
            .filter(([s]) => s > 0)
            .sort((a, b) => b[0] - a[0]);
        if (ranked.length) {
            const out = written(ranked[0]![1], where, version, after);
            if (out) return out;
        }
        const tail = where
            ? `，${where}${after}`
            : after
              ? `，${after.replace(/^[，,]/, "")}`
              : "";
        const self = readSource(
            new Script(
                local.text.slice(0, labelled.groups!.label!.length),
                local.traditional
            ),
            0
        );
        if (self && !self.rest && LAW_TYPES.has(String(self.known.fields.type)))
            // 刑法第139条之一（上注41）: complete in itself
            return {
                text:
                    self.text.replace(/。$/, "") +
                    (where ? `，${where}` : "") +
                    after,
                kind: "cited" as Kind,
                missing: self.missing,
                warnings: [],
                known: self.known,
            };
        return short(
            `${local.restyle(SHORT_REF(n))}，${local.original(label)}${tail}`
        );
    }
    return null;
}

/** A cross-reference, possibly after a lead-in: 就特别重大事故而言，……：第302号令（上注31）第16条. */
function referenceAfterLead(script: Script, ctx: Context) {
    const colon = topIndex(script.plain, "：");
    for (const at of colon > 0 ? [0, colon + 1] : [0]) {
        const ref = crossReference(
            new Script(script.text.slice(at), script.traditional),
            ctx
        );
        if (ref) return { ...ref, prefix: script.text.slice(0, at) };
    }
    return null;
}

// ── one note ───────────────────────────────────────────────────────────────

/** Where a quotation from the source begins (…第19项：「…」), at the top level, or -1. */
function quoteAt(core: string): number {
    let at = 0;
    for (const { part, sep } of splitTop(core, "：:")) {
        at += part.length + sep.length;
        if (sep && /^[「“『"]/.test(core.slice(at))) return at - 1;
    }
    return -1;
}

/** Rewrite one footnote. `ctx` carries what earlier notes cited; this note's sources are added to it. */
function convertNote(label: string, source: string, ctx: Context): Note {
    const text = prepare(source.trim());
    const pieces: Piece[] = [],
        cited: Known[] = [];
    let out = "";
    for (const { part, sep } of splitTop(text, "。；;")) {
        const remarks = part.match(REMARK) ?? [];
        let core = part.replace(REMARK, "");
        const q = quoteAt(core);
        const quote = q >= 0 ? core.slice(q) : "";
        core = core.slice(0, core.length - quote.length);
        const trimmed = core.trim();
        const warnings = remarks.some((r) =>
            UNVERIFIED.test(new Script(r).plain)
        )
            ? [
                  "作者自注显示来源尚未核实。手册第2条：未经核实的文献不得引用，请先核对原文",
              ]
            : [];
        /** A rewritten citation ends in 。 (or . in English) unless the author's own words follow it. */
        const close = (body: string) =>
            sep || quote || remarks.length
                ? body.replace(/。$/, "") + quote + remarks.join("") + sep
                : /[。.]$/.test(body)
                  ? body
                  : `${body}。`;
        if (!trimmed) {
            out += part + sep;
            if (part.trim())
                pieces.push({
                    source: part,
                    text: part,
                    kind: "kept",
                    type: null,
                    missing: [],
                    warnings,
                });
            continue;
        }

        const script = new Script(trimmed, noteScript(text, ctx));
        const ref = looksJapanese(trimmed)
            ? null
            : referenceAfterLead(script, ctx);
        if (ref) {
            if (ref.known) cited.push(ref.known);
            const body = close(ref.prefix + ref.text);
            pieces.push({
                source: part,
                text: body,
                kind: ref.kind,
                type: ref.known ? String(ref.known.fields.type) : null,
                missing: ref.missing,
                warnings: [...ref.warnings, ...warnings],
            });
            out += body;
            continue;
        }
        const reading = looksJapanese(trimmed)
            ? readJapanese(trimmed)
            : readCore(script);
        if (reading) {
            cited.push(reading.known);
            const body = close(
                reading.prefix +
                    (reading.rest
                        ? reading.text.replace(/。$/, "") + reading.rest
                        : reading.text)
            );
            pieces.push({
                source: part,
                text: body,
                kind: "cited",
                type: String(reading.known.fields.type),
                missing: reading.missing,
                warnings: [...reading.warnings, ...warnings],
            });
            out += body;
            continue;
        }
        pieces.push({
            source: part,
            text: part,
            kind: "kept",
            type: null,
            missing: [],
            warnings,
        });
        out += part + sep;
    }
    ctx.notes.set(label, cited);
    ctx.previous = cited;
    const unread = pieces.filter(
        (p) =>
            p.kind === "kept" &&
            (/[《〈]/.test(p.source) ||
                (/\d{4}年\d{1,2}月/.test(p.source) &&
                    /报道|通报|报告|规定|办法|文件|公布|发布|日报|晚报/.test(
                        new Script(p.source).plain
                    ) &&
                    !/检索/.test(new Script(p.source).plain)))
    );
    const status =
        unread.length === 0 && pieces.some((p) => p.kind !== "kept")
            ? "done"
            : pieces.some((p) => p.kind !== "kept")
              ? "partial"
              : "kept";
    return { label, source, text: out, pieces, status };
}

/** Japanese sources are read as written: no script conversion. */
function readJapanese(core: string): (Reading & { prefix: string }) | null {
    try {
        const fields = parse(core);
        const result = cite(fields);
        if (!plausible(fields, core, result.text, result.missing)) return null;
        return {
            known: { fields, plain: fields, text: core },
            text: result.text,
            missing: result.missing,
            warnings: [],
            rest: "",
            prefix: "",
        };
    } catch {
        return null;
    }
}

/** One reference on its own (粘贴原文): traditional script, 〈篇名〉 and 頁 are read as in an article. */
export function citeReference(raw: string): Citation {
    if (looksJapanese(raw)) return cite(parse(raw));
    const script = new Script(prepare(raw.trim().replace(/。$/, "")));
    const result = cite(
        strings(parse(script.plain), (s) => script.original(s))
    );
    return { ...result, text: script.restyle(result.text) };
}

// ── whole articles ─────────────────────────────────────────────────────────

const DEFINITION = /^\[\^([^\]\s]+)\]:[ \t]?(.*)$/;
const CONTINUED = /^(?: {4}|\t)(.*)$/;
const LINE_MARK =
    /^\s*(?:\[(\d+)\]|〔(\d+)〕|［(\d+)］|(\d+)[.、．)）]|[（(](\d+)[）)]|([①-⑳]))\s*/;

export interface Footnote {
    label: string;
    text: string;
}

/** Rewrite a list of footnotes in order. */
export function convertNotes(notes: Footnote[]): Note[] {
    const traditional = isTraditional(notes.map((n) => n.text).join(""));
    const ctx: Context = { previous: [], notes: new Map(), traditional };
    return notes.map((n) => convertNote(n.label, n.text, ctx));
}

/** A Markdown article with [^1]: footnotes, or a plain list of notes, one per line. */
export function convertArticle(input: string): Article {
    const lines = input.split(/\r?\n/);
    const found: { label: string; text: string; from: number; to: number }[] =
        [];
    for (let i = 0; i < lines.length; i++) {
        const m = lines[i]!.match(DEFINITION);
        if (!m) continue;
        let text = m[2]!,
            to = i;
        while (to + 1 < lines.length && CONTINUED.test(lines[to + 1]!))
            text += " " + lines[++to]!.match(CONTINUED)![1]!.trim();
        found.push({ label: m[1]!, text, from: i, to });
        i = to;
    }
    if (found.length) {
        const notes = convertNotes(found);
        const out = [...lines];
        for (let k = found.length - 1; k >= 0; k--) {
            const { from, to, label } = found[k]!;
            out.splice(from, to - from + 1, `[^${label}]: ${notes[k]!.text}`);
        }
        return { format: "markdown", notes, document: out.join("\n") };
    }
    const listed = lines
        .map((line, i) => ({ line, i }))
        .filter(({ line }) => line.trim());
    const notes = convertNotes(
        listed.map(({ line }, k) => {
            const mark = line.match(LINE_MARK);
            const label = mark ? mark.slice(1).find(Boolean)! : String(k + 1);
            return {
                label: /^[①-⑳]$/.test(label)
                    ? String(label.charCodeAt(0) - 0x245f)
                    : label,
                text: mark ? line.slice(mark[0].length) : line,
            };
        })
    );
    const out = [...lines];
    listed.forEach(({ line, i }, k) => {
        out[i] = (line.match(LINE_MARK)?.[0] ?? "") + notes[k]!.text;
    });
    return { format: "lines", notes, document: out.join("\n") };
}
