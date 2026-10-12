/** English cases and Bluebook articles. English books are read with the other European languages. */
import { matched, type Parser } from "./util.ts";

const US_CASE = /^(?<name>.+?\sv\.?\s.+?),\s*(?<volume>\d+)\s+(?<reporter>[A-Z][A-Za-z0-9.' ]*?)\s+(?<first_page>\d+)(?:,\s*(?<pin>[\d–-]+))?\s*\((?:(?<court>[^()]*?)\s+)?(?<year>\d{4})\)\.?$/;
const UK_CASE = /^(?<name>.+?(?:\sv\.?\s.+?|'s Case)|R\s.+?|Re\s.+?)\s*(?<open>[[(])(?<year>\d{4})[\])]\s*(?<report>[^,]+?)(?:,\s*(?<pin>.+?))?\.?$/;
const OSCOLA = /^(?<authors>[^,']+(?:,\s*[^,']+)*?),\s*['‘](?<title>.+?)['’]\s*\((?<year>\d{4})\)\s*(?<volume>\d+)\s*(?:\((?<issue>\d+)\)\s*)?(?<journal>[A-Za-z.' &]+?)\s+(?<first_page>\d+)(?:,\s*(?<pin>[\d–-]+))?\.?$/;
const BLUEBOOK = /^(?<authors>.+?),\s*(?<title>.+?),\s*(?<volume>\d+)\s+(?<journal>[A-Za-z.' &]+?)\s+(?<first_page>\d+)(?:,\s*(?<pin>[\d–-]+))?\s*\((?<year>\d{4})\)\.?$/;

/** Chevron U.S.A., Inc. v. NRDC, 467 U.S. 837, 842-43 (1984). */
const usCase: Parser = text => matched(US_CASE, text, "en_case_us");

/** Ridge v Baldwin [1964] AC 40 / James Bagg's Case (1615) 11 Co. Rep. 93b */
const ukCase: Parser = text => {
  const fields = matched(UK_CASE, text, "en_case_uk");
  if (!fields) return null;
  const { open, ...rest } = fields;
  return open === "(" ? { ...rest, round: true } : rest;
};

/** Charles A. Reich, The New Property, 73 Yale L.J. 733, 737–38 (1964). */
const bluebookArticle: Parser = text => {
  const fields = matched(BLUEBOOK, text, "en_article");
  return fields && { ...fields, authors: String(fields.authors).split(/\s*&\s*|,\s*/).filter(Boolean) };
};

/** Mark Bovens, 'Analysing and Assessing Accountability' (2007) 13 European Law Journal 447 — written out as Bluebook. */
const oscolaArticle: Parser = text => {
  const fields = matched(OSCOLA, text, "en_article");
  if (!fields) return null;
  const { issue: _, ...rest } = fields;
  return { ...rest, authors: String(fields.authors).split(/\s*(?:&|\band\b)\s*|,\s*/).filter(Boolean) };
};

export const parsers: Parser[] = [usCase, ukCase, oscolaArticle, bluebookArticle];
