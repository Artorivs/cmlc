/** Russian (ГОСТ-like): Иванов И. И. Название. М.: Статут, 2010. С. 15. — recognised by Cyrillic script. */
import type { Fields } from "../entry.ts";
import { groups, type Parser } from "./util.ts";

const INITIALS = String.raw`(?:[А-ЯЁ]\.\s*){1,2}`;
const FAMILY = String.raw`[А-ЯЁ][а-яё]+(?:-[А-ЯЁ][а-яё]+)?`;
const AUTHOR = new RegExp(String.raw`(?:(?<family>${FAMILY})\s+(?<initials>${INITIALS})|(?<initials2>${INITIALS})(?<family2>${FAMILY}))\s*,?\s*`, "y");
const EDITION = /^(?<edition>\d+)-е\s+изд\.?.*$/;
const IMPRINT = /^(?:[^:]+:\s*)?(?<publisher>[^,]+?),\s*(?<year>\d{4})$/;
const PAGES = /^С\.\s*(?<pages>.+)$/;
const ARTICLE = /^(?<journal>.+?)\.\s*(?<year>\d{4})(?:\.\s*(?:Т\.\s*(?<volume>\d+)\.\s*)?№\s*(?<issue>[\d\-–]+))?(?:\.\s*С\.\s*(?<pages>[\d\s\-–]+))?\.?$/;

/** Leading names, each turned to 'И. И. Иванов' (名在前，第96条), and the text after them. */
function authors(text: string): [string[], string] {
  const found: string[] = [];
  let m: RegExpExecArray | null, pos = 0;
  for (AUTHOR.lastIndex = 0; (m = AUTHOR.exec(text)); pos = AUTHOR.lastIndex) {
    const g = m.groups!;
    const initials = (g.initials ?? g.initials2)!.trim().replace(/\.\s*/g, ". ").trim();
    found.push(`${initials} ${g.family ?? g.family2}`);
  }
  return [found, text.slice(pos)];
}

/** Split on '. ' and GOST dashes, but not after the abbreviations С. and Т. or inside 'М.: Статут'. */
const segments = (text: string): string[] => text.replace(/\.?\s+[–—]\s+/g, ". ").replace(/\s*:\s*/g, ": ")
  .replace(/[.\s]+$/, "").split(/(?<![СТ])\.\s+/).map(s => s.trim()).filter(Boolean);

function article(fields: Fields, rest: string): Fields | null {
  const at = rest.indexOf("//");
  const m = rest.slice(at + 2).trim().match(ARTICLE);
  return m && { type: "ru_article", ...fields, title: rest.slice(0, at).trim().replace(/\.$/, ""), ...groups(m) };
}

function book(fields: Fields, rest: string): Fields {
  const title: string[] = [];
  for (const segment of segments(rest)) {
    const m = segment.match(EDITION) ?? segment.match(IMPRINT) ?? segment.match(PAGES);
    if (m) Object.assign(fields, groups(m));
    else if (!/^\d+\s*с$/.test(segment)) title.push(segment);  // total page count, not a locator
  }
  return { type: "ru_book", ...fields, title: title.join(". ") };
}

/** Брагинский М. И. Договорное право. М.: Статут, 2001. С. 15. / … // Журнал. 2023. № 3. С. 17–30. */
const russian: Parser = text => {
  if (!/[А-Яа-яЁё]/.test(text)) return null;
  const [names, rest] = authors(text.trim());
  return rest.includes("//") ? article({ authors: names }, rest) : book({ authors: names }, rest);
};

export const parsers: Parser[] = [russian];
