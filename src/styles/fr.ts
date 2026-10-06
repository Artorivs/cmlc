/** French sources (第116–122条): book titles in italics, article titles in « », journal in italics. */
import type { Entry } from "../entry.ts";
import type { Styles } from "./style.ts";
import * as western from "./western.ts";

const authors = (e: Entry) => western.authors(e, { pair: " et ", many: "et al." });
const edition = (value: string | null) => western.ordinal(value, value === "1" ? "1re éd." : "{}e éd.");

export const styles: Styles = {
  fr_book: e => western.joined(authors(e), `*${e.need("title", "书名")}*`, edition(e.get("edition")),
    e.need("publisher", "出版社"), e.need("year", "出版年份"), western.locator(e, "p.")),

  fr_article: e => western.joined(authors(e), `« ${e.need("title", "篇名")} »`, `*${e.need("journal", "刊名")}*`,
    e.need("year", "年份"), e.get("issue") && `n° ${e.get("issue")}`, western.locator(e, "p.")),
};
