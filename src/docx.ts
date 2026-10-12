/**
 * Footnotes of a Word file (.docx), read and written in the browser or in Node without any library.
 * The file is a zip archive and the notes are in word/footnotes.xml; everything else is copied unchanged.
 */
import type { Footnote, Note } from "./article.ts";
import { contents, readZip, replaced, writeZip } from "./zip.ts";

const FOOTNOTES = "word/footnotes.xml";
const FOOTNOTE = /<w:footnote\b([^>]*)>([\s\S]*?)<\/w:footnote>/g;
const SEPARATOR = /w:type="(?:separator|continuationSeparator|continuationNotice)"/;
const PARAGRAPH = /<w:p\b[^>]*?(?:\/>|>[\s\S]*?<\/w:p>)/g;
const RUN = /<w:r\b[^>]*>[\s\S]*?<\/w:r>/g;
/** The run holding the note's own number. */
const REFERENCE = /<w:r\b[^>]*>(?:(?!<\/w:r>)[\s\S])*?<w:footnoteRef\s*\/>[\s\S]*?<\/w:r>/;
const IS_REFERENCE = /<w:footnoteRef\s*\/>/;

const unescape = (text: string) => text.replace(/&(?:#(\d+)|#x([\da-f]+)|(amp|lt|gt|quot|apos));/gi, (_, dec, hex, named) =>
  dec ? String.fromCodePoint(Number(dec)) : hex ? String.fromCodePoint(parseInt(hex, 16))
    : ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" } as Record<string, string>)[named.toLowerCase()]!);
const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

async function footnotesXml(file: Uint8Array) {
  const entries = readZip(file);
  const at = entries.findIndex(e => e.name === FOOTNOTES);
  return { entries, at, xml: at < 0 ? "" : new TextDecoder().decode(await contents(entries[at]!)) };
}

/** The notes in order, numbered 1, 2, 3 … as Word shows them. Separators are skipped. */
export async function docxFootnotes(file: Uint8Array): Promise<Footnote[]> {
  const notes: Footnote[] = [];
  for (const m of (await footnotesXml(file)).xml.matchAll(FOOTNOTE)) {
    if (SEPARATOR.test(m[1]!)) continue;
    const text = [...m[2]!.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\s*\/>/g)].map(t => t[1] === undefined ? " " : unescape(t[1])).join("");
    notes.push({ label: String(notes.length + 1), text: text.trim() });
  }
  return notes;
}

export interface Revision {
  /** Show each rewritten note as a tracked change (Word's 修订) that the author accepts or rejects. Default true. */
  track?: boolean;
  author?: string;
  date?: Date;
}

/**
 * The same Word file with rewritten notes. `notes` are those read by docxFootnotes and converted; notes that come
 * out unchanged are not touched, so their formatting stays as it was. A rewritten note is one plain run in the
 * note's own font, with *…* (western titles) in italics.
 */
export async function reviseDocx(file: Uint8Array, notes: Note[], revision: Revision = {}): Promise<Uint8Array> {
  const { entries, at, xml } = await footnotesXml(file);
  const changed = new Map(notes.filter(n => n.text !== n.source).map(n => [n.label, n]));
  if (at < 0 || !changed.size) return file;
  const marks = new Marks(revision);
  let index = 0;
  const revised = xml.replace(FOOTNOTE, (whole, attributes: string, body: string) => {
    if (SEPARATOR.test(attributes)) return whole;
    const note = changed.get(String(++index));
    if (!note) return whole;
    const runs = textRuns(` ${note.text}`, baseFormat(body), !note.source.includes("*"));
    return `<w:footnote${attributes}>${revision.track === false ? replace(body, runs) : track(body, runs, marks)}</w:footnote>`;
  });
  entries[at] = await replaced(entries[at]!, new TextEncoder().encode(revised));
  return writeZip(entries);
}

/** The formatting of the note's first piece of text, without italics or superscript. */
function baseFormat(body: string): string {
  const run = [...body.matchAll(RUN)].map(m => m[0]).find(r => /<w:t\b/.test(r) && !IS_REFERENCE.test(r));
  const format = run?.match(/<w:rPr>[\s\S]*?<\/w:rPr>/)?.[0] ?? "";
  return format.replace(/<w:(?:i|iCs|vertAlign)\b[^>]*\/>|<w:rStyle w:val="FootnoteReference"\s*\/>/g, "").replace(/<w:rPr>\s*<\/w:rPr>/, "");
}

function italic(format: string): string {
  const inner = format.replace(/^<w:rPr>|<\/w:rPr>$/g, "");
  // Word expects rStyle, rFonts, b, bCs before i.
  const lead = inner.match(/^(?:<w:(?:rStyle|rFonts|b|bCs)\b[^>]*\/>)*/)![0];
  return `<w:rPr>${lead}<w:i/><w:iCs/>${inner.slice(lead.length)}</w:rPr>`;
}

function textRuns(text: string, format: string, markdown: boolean): string {
  const parts = markdown ? text.split(/\*([^*\n]+)\*/) : [text];
  return parts.map((part, i) => part && `<w:r>${i % 2 ? italic(format) : format}<w:t xml:space="preserve">${escape(part)}</w:t></w:r>`).join("");
}

/** The note's paragraphs become one: its first paragraph's settings, the note number, the new text. */
function replace(body: string, runs: string): string {
  const paragraphs = [...body.matchAll(PARAGRAPH)];
  if (!paragraphs.length) return body;
  const first = paragraphs[0]![0], last = paragraphs.at(-1)!;
  const open = first.endsWith("/>") ? "<w:p>" : first.match(/^<w:p\b[^>]*>/)![0];
  const settings = first.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)?.[0] ?? "";
  const number = body.match(REFERENCE)?.[0] ?? "";
  return body.slice(0, paragraphs[0]!.index) + `${open}${settings}${number}${runs}</w:p>` + body.slice(last.index + last[0].length);
}

/** Tracked-change attributes, numbered well clear of any the document already uses. */
class Marks {
  private id = 900000;
  private readonly author: string;
  private readonly date: string;
  constructor(revision: Revision) {
    this.author = escape(revision.author ?? "引注整理");
    this.date = (revision.date ?? new Date()).toISOString().replace(/\.\d+Z$/, "Z");
  }
  next(): string { return `w:id="${this.id++}" w:author="${this.author}" w:date="${this.date}"`; }
}

/** Every old run is marked deleted (the note number stays), the new text inserted, and the paragraphs joined. */
function track(body: string, runs: string, marks: Marks): string {
  const paragraphs = [...body.matchAll(PARAGRAPH)];
  if (!paragraphs.length) return body;
  let out = body.slice(0, paragraphs[0]!.index);
  paragraphs.forEach((m, k) => {
    let p = m[0].endsWith("/>") ? m[0].replace(/\/>$/, "></w:p>") : m[0];
    p = p.replace(/<w:del\b[^>]*\/>|<w:del\b[^>]*>[\s\S]*?<\/w:del>|<w:pPr>[\s\S]*?<\/w:pPr>|<w:r\b[^>]*>[\s\S]*?<\/w:r>/g, part =>
      !part.startsWith("<w:r") || IS_REFERENCE.test(part) ? part
        : `<w:del ${marks.next()}>${part.replace(/<(\/?)w:t\b/g, "<$1w:delText").replace(/<(\/?)w:instrText\b/g, "<$1w:delInstrText")}</w:del>`);
    if (k < paragraphs.length - 1) p = deleteMark(p, `<w:del ${marks.next()}/>`);
    else p = p.replace(/<\/w:p>$/, `<w:ins ${marks.next()}>${runs}</w:ins></w:p>`);
    const next = paragraphs[k + 1];
    out += p + body.slice(m.index + m[0].length, next ? next.index : body.length);
  });
  return out;
}

/** Marks a paragraph's end as deleted, so that accepting the change joins it to the next one. */
function deleteMark(p: string, mark: string): string {
  p = p.replace(/<w:pPr\s*\/>/, "");
  const settings = p.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)?.[0];
  if (!settings) return p.replace(/^<w:p\b[^>]*>/, open => `${open}<w:pPr><w:rPr>${mark}</w:rPr></w:pPr>`);
  const revised = settings.includes("<w:rPr>")
    ? settings.replace(/<w:rPr>(<w:ins\b[^>]*\/>)?/, `<w:rPr>$1${mark}`)
    : settings.replace(/(<w:sectPr\b|<w:pPrChange\b|<\/w:pPr>)/, `<w:rPr>${mark}</w:rPr>$1`);
  return p.replace(settings, revised);
}
