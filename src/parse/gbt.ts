/** GB/T 7714 (学报体): 作者. 题名[类型]. 出版项. — one small reader per document type. */
import type { Fields } from "../entry.ts";
import { ParseError } from "../errors.ts";
import { date, matched, names, type Parser } from "./util.ts";

const GBT = /^(?:(?<authors>(?:[[［（(][^\]］）)]+[\]］）)])?[^.[［]+?)\s*\.\s*)?(?<title>[^[［]+?)\s*[[［](?<kind>[A-Z/]+)[\]］]\s*(?<sep>\.|\/\/)\s*(?<rest>.*?)\.?$/;
const NATIONALITY = /^[[［（(](?<nationality>[^\]］）)]+)[\]］）)]\s*/;
const IMPRINT = String.raw`(?:[^:：,，.]+[:：]\s*)?(?<publisher>[^,，]+?)[,，]\s*(?<year>\d{4})(?:\s*[:：]\s*(?<pages>.+))?`;

const BOOK = new RegExp(String.raw`^(?:(?<translators>[^.]+?)\s*[,，]\s*译\s*\.\s*)?(?:第?(?<edition>\d+)\s*版\s*\.\s*)?${IMPRINT}$`);
const JOURNAL = /^(?<journal>[^,，]+)[,，]\s*(?<year>\d{4})\s*[,，]?\s*(?:\d+\s*)?\((?<issue>\d+)\)(?:\s*[:：]\s*(?<pages>.+))?$/;
const NEWSPAPER = /^(?<paper>[^,，]+)[,，]\s*(?<date>\d{4}(?:-\d{1,2}){0,2})\s*(?:\((?<section>\d+)\))?$/;
const THESIS = /^(?:[^:：,，.]+[:：]\s*)?(?<school>[^,，]+?)(?:[,，]\s*(?<year>\d{4}))?(?:\s*[:：]\s*(?<pages>.+))?$/;
const HOST = new RegExp(String.raw`^(?:(?<editors>[^.]+?)\s*\.\s*)?(?<book_title>[^.]+?)\s*(?:\[M\])?\s*\.\s*${IMPRINT}$`);
const ONLINE = /^(?:\((?<date>[\d-]+)\))?\s*(?:\[(?<accessed>[\d-]+)\])?\s*\.?\s*(?<url>\S+)$/;

/** 郑戈, 译. 2版. 北京: 商务印书馆, 2005: 18 */
function book(rest: string): Fields | null {
  const fields = matched(BOOK, rest, "book");
  if (fields?.translators) fields.translators = names(String(fields.translators)).join("、");
  return fields;
}

/** 法制日报, 2000-05-01(3) */
function newspaper(rest: string): Fields | null {
  const fields = matched(NEWSPAPER, rest, "newspaper");
  return fields && { ...fields, date: date(String(fields.date)) };
}

/** 北京: 中国政法大学, 2010: 5 — the degree is not part of GB/T, so it stays a gap. */
function thesis(rest: string): Fields | null {
  const fields = matched(THESIS, rest, "thesis");
  return fields && { year: null, ...fields, degree: null };
}

/** //梁慧星, 主编. 民商法论丛: 第1卷. 北京: 法律出版社, 1994: 110 — an editor's unstated role stays a gap. */
function chapter(rest: string): Fields | null {
  const fields = matched(HOST, rest, "chapter");
  if (!fields) return null;
  const { editors: by = "", ...found } = fields;
  const [, editors = "", role] = String(by).match(/^(.*?)(?:\s*[,，]\s*(主编|编|编译|编著))?$/)!;
  if (names(editors).length) Object.assign(found, { editors: names(editors), editor_role: role ?? null });
  const volume = String(found.book_title).match(/^(.+?)\s*[:：]\s*(第.+[卷辑册])$/);
  if (volume) Object.assign(found, { book_title: volume[1], volume: volume[2] });
  return found;
}

/** (2024-10-12)[2024-10-20]. https://… — GB/T has no site name, so it stays a gap. */
function online(rest: string): Fields | null {
  const fields = matched(ONLINE, rest, "web");
  if (!fields) return null;
  for (const key of ["date", "accessed"]) if (fields[key]) fields[key] = date(String(fields[key]));
  return { ...fields, site: null };
}

const KINDS: Record<string, (rest: string) => Fields | null> = {
  M: book, J: rest => matched(JOURNAL, rest, "article"), N: newspaper, D: thesis, C: chapter, A: chapter, "EB/OL": online,
};

/** 王名扬. 美国行政法[M]. 北京: 中国法制出版社, 1995: 18. */
const gbt7714: Parser = text => {
  const m = text.match(GBT);
  if (!m) return null;
  const { authors: by = "", title, kind, sep, rest } = m.groups!;
  const read = KINDS[sep === "//" ? "C" : kind!];
  if (!read) throw new ParseError(`暂不支持 GB/T 7714 的 [${kind}] 类型，请改用“逐项填写”。`);
  const fields = read(rest!);
  if (!fields) throw new ParseError(`无法识别出版信息：${rest}`);
  const nation = by.match(NATIONALITY);
  if (nation) fields.nationality = nation.groups!.nationality;
  let authors = names(nation ? by.slice(nation[0].length) : by);
  if (authors.at(-1) === "等") [authors, fields.et_al] = [authors.slice(0, -1), true];
  if (authors.length) fields.authors = authors;
  return { title: title!.trim(), ...fields };
};

export const parsers: Parser[] = [gbt7714];
