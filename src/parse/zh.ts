/** Chinese legal sources and loosely written Chinese notes. */
import type { Fields } from "../entry.ts";
import { compact, cut, date, groups, matched, search, type Parser } from "./util.ts";

// ── statutes and documents ─────────────────────────────────────────────────

const NUMERAL = "[\\d一二三四五六七八九十百千零〇两]+";
const STATUTE = new RegExp(`^《?(?<name>[^《》\\s第]+?(?:法典|法|条例|规定|办法|解释))》?\\s*` +
  `第(?<article>${NUMERAL})条(?<article_suffix>之[一二三四五六七八九十]+)?` +
  `(?:第(?<paragraph>${NUMERAL})款)?(?:第[（(]?(?<item>${NUMERAL})[）)]?项)?$`);
const DOCUMENT = /^《?(?<name>.+?)》?[\s，,]*[（(]?(?<doc_no>[一-龥]+[(（[【［〔]\d{4}[)）\]】］〕]\d+号)[）)]?$/;

/** 中华人民共和国民法典 第一千二百二十四条第一款第（一）项 */
const statute: Parser = text => matched(STATUTE, text, "statute");

/** 国务院关于……的通知 国发(2007)19号 */
const document: Parser = text => matched(DOCUMENT, text, "normative");

// ── cases ──────────────────────────────────────────────────────────────────

const CASE_NAME = /(?<name>[^，,。：:；;\s]+?案)(?=[，,。：:；;\s（(]|$)/;
const CASE_NO = /[（(〔[](?<year>\d{4})[）)〕\]]\s*(?<case_no>[^号，,。\s]+?)\s*号/;
const COURT = /(?<court>[一-龥]+?法院)/;
const DOC_TYPE = /(?<doc_type>(?:民事|刑事|行政|执行|国家赔偿|赔偿)(?:判决书|裁定书|调解书|决定书))/;
const JUDGED = /\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日/;

/** The case name, wherever it stands; a missing name becomes a gap. */
const caseOf = (text: string, type: string, fields: Fields): Fields =>
  ({ type, name: search(CASE_NAME, text, "name"), ...compact(fields) });

/** ……案，人民法院案例库 2023-01-2-087-001 */
const caseLibrary: Parser = text => {
  const number = text.includes("案例库") && text.match(/\d{4}-\d{2}-\d-\d{3}-\d{3}/);
  return number ? caseOf(text, "case_library", { library_no: number[0] }) : null;
};

/** 指导案例24号：……案 — the release year stays a gap unless given. */
const caseGuiding: Parser = text => {
  const m = text.match(/指导(?:性)?案例\s*(?:第\s*)?(?<number>\d+)\s*号/);
  if (!m) return null;
  return { ...caseOf(text, "case_guiding", { number: m.groups!.number }), year: search(/(?<year>\d{4})\s*年?/, cut(text, m), "year") };
};

/** ……案，最高人民法院公报 2015-11 / 《最高人民法院公报》2015年第11期 */
const caseGazette: Parser = text => {
  const m = text.match(/《?(?<gazette>[^《》\s，,、]*公报)》?\s*[,，]?\s*(?<year>\d{4})\s*(?:年\s*第?|[-—/.]|[（(])\s*(?<issue>\d{1,2})\s*[期）)]?/);
  return m && caseOf(text, "case_gazette", groups(m));
};

/** ……案，浙江省高级人民法院（1988）……号民事判决书 — needs a case number, or a case name and a court. */
const judgment: Parser = text => {
  const number = text.match(CASE_NO), name = text.match(CASE_NAME);
  const rest = name ? text.slice(name.index! + name[0].length) : text;
  const court = search(COURT, rest, "court");
  if (!(number || (name && court))) return null;
  const judged = rest.match(JUDGED);
  return caseOf(text, "case", {
    court, year: number?.groups!.year ?? search(/(?<year>\d{4})\s*年/, rest, "year"),
    case_no: number?.groups!.case_no, doc_type: search(DOC_TYPE, rest, "doc_type"), date: judged && date(judged[0]),
  });
};

// ── loosely written notes: 作者《题名》+ whatever follows ───────────────────

const NOTE = {
  author: /^\s*(?:[[［【（(](?<nationality>[^\]］】）)]{1,4})[\]］】）)])?\s*(?<names>.*?)\s*(?:著|撰)?\s*[：:，,]?\s*$/,
  inJournal: /(?<year>\d{4})\s*(?:年\s*第\s*(?<issue>\d+)\s*期|[（(]\s*(?<issue2>\d+)\s*[）)])/,
  inBook: /载\s*(?:(?<editors>[^《》：:，,]+?)(?<editor_role>主编|编著|编译|编)\s*[：:]?\s*)?《/,
  edition: /[（(]?第\s*(?<edition>\d+)\s*版[）)]?|[（(]?(?<edition_name>修订版|增订版)[）)]?/,
  volume: /第[\d一二三四五六七八九十]+[卷册辑](?:第[\d一二三四五六七八九十]+[卷册辑分册]+)?/,
  translators: /(?<translators>[^，,。\s》《]+?)\s*译(?![者本文林])/,
  publisher: /(?<publisher>[^，,。\s》《\d]+?(?:出版社|书局|印书馆|书店|出版公司))/,
  year: /(?<!\d)(?<year>1[89]\d{2}|20\d{2})(?!\d|\s*页|\s*[-–—~～]\s*\d)/,
  pages: /第?\s*(?<pages>\d+(?:\s*[-–—~～]\s*\d+)?)\s*页/,
};

/** Book details searched for anywhere in the text after the title. */
const imprint = (text: string): Fields => ({
  volume: search(NOTE.volume, text, 0), publisher: search(NOTE.publisher, text, "publisher"), year: search(NOTE.year, text, "year"),
});

/** 张新宝《侵权责任法》第5版 73-75页 / 季卫东：《……》，载《中国社会科学》1993年第1期 */
const note: Parser = text => {
  const titles = [...text.matchAll(/《([^《》]+)》/g)].map(m => m[1]!);
  if (!titles.length) return null;
  const head = text.slice(0, text.indexOf("《")), tail = text.slice(text.indexOf("》") + 1);
  const author = head.match(NOTE.author)!.groups!;
  const fields: Fields = {
    title: titles[0], authors: author.names!.split(/[、，,]/).map(s => s.trim()).filter(Boolean),
    nationality: author.nationality, pages: search(NOTE.pages, tail, "pages"),
  };
  const journal = tail.match(NOTE.inJournal), host = tail.match(NOTE.inBook);
  if (titles.length > 1 && journal) {
    const { year, issue, issue2 } = journal.groups!;
    Object.assign(fields, { type: "article", journal: titles[1], year, issue: issue ?? issue2 });
  } else if (titles.length > 1 && host) {
    Object.assign(fields, {
      type: "chapter", book_title: titles[1], editors: host.groups!.editors, editor_role: host.groups!.editor_role,
      translators: search(NOTE.translators, tail.slice(0, host.index), "translators"),
      ...imprint(tail.slice(host.index! + host[0].length)),
    });
  } else {
    const edition = tail.match(NOTE.edition)?.groups;
    Object.assign(fields, {
      type: "book", edition: edition && (edition.edition ?? edition.edition_name),
      translators: search(NOTE.translators, tail, "translators"), ...imprint(tail),
    });
  }
  return compact(fields);
};

export const parsers: Parser[] = [statute, document, caseLibrary, caseGuiding, caseGazette, judgment, note];
