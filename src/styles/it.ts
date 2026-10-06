/** Italian sources (第129–134条): titles in italics, journal volumes in Roman numerals. */
import type { Entry } from "../entry.ts";
import * as normalize from "../normalize.ts";
import type { Styles } from "./style.ts";
import * as western from "./western.ts";

const authors = (e: Entry) => western.authors(e, { pair: " e ", many: "et al." });

export const styles: Styles = {
  it_book: e => western.joined(authors(e), `*${e.need("title", "书名")}*`, western.ordinal(e.get("edition"), "{}ª ed."),
    e.need("publisher", "出版社"), e.need("year", "出版年份"), western.locator(e, "p.")),

  it_article(e) {
    const volume = e.get("volume");
    return western.joined(authors(e), `*${e.need("title", "篇名")}*`, `in ${e.need("journal", "刊名")}`,
      e.need("year", "年份"), volume && normalize.roman(volume), e.get("issue") && `n. ${e.get("issue")}`,
      western.locator(e, "p."));
  },
};
