/** English sources (第99–115条). Titles of the cited work are italic, written here as *…*. */
import type { Entry } from "../entry.ts";
import * as normalize from "../normalize.ts";
import type { Styles } from "./style.ts";
import * as western from "./western.ts";

/** 刊名、出版社写全称，不用缩写（第97条）. */
export const JOURNALS: Record<string, string> = {
  "Yale L.J.": "Yale Law Journal",
  "Harv. L. Rev.": "Harvard Law Review",
  "Colum. L. Rev.": "Columbia Law Review",
  "Stan. L. Rev.": "Stanford Law Review",
  "U. Chi. L. Rev.": "University of Chicago Law Review",
  "Mich. L. Rev.": "Michigan Law Review",
  "Cal. L. Rev.": "California Law Review",
  "N.Y.U. L. Rev.": "New York University Law Review",
  "Am. J. Comp. L.": "American Journal of Comparative Law",
  "Am. J. Int'l L.": "American Journal of International Law",
  "Harv. Hum. Rts. J.": "Harvard Human Rights Journal",
};
export const PUBLISHERS: Record<string, string> = {
  "Stanford UP": "Stanford University Press",
  "Oxford UP": "Oxford University Press",
  "OUP": "Oxford University Press",
  "Cambridge UP": "Cambridge University Press",
  "CUP": "Cambridge University Press",
  "Harvard UP": "Harvard University Press",
  "Princeton UP": "Princeton University Press",
};

const fullForm = (table: Record<string, string>, value: string | null) => value && (table[value] ?? value);

/** A; A & B; A, B & C; more than three → first two + et al. */
const authors = (e: Entry) => western.authors(e, { pair: " & ", many: "et al.", keep: 2 });

function title(e: Entry): string {
  let text = e.need("title", "标题");
  if (e.has("subtitle")) text += `: ${e.need("subtitle", "副标题")}`;
  return `*${text}*`;
}

export const styles: Styles = {
  en_book(e) {
    const head = [authors(e), title(e) + (e.get("edition") ? ` (${e.get("edition")} ed.)` : "")];
    const translator = e.get("translated_by") && `translated by ${e.get("translated_by")}`;
    return western.joined(...head, translator, e.require(fullForm(PUBLISHERS, e.get("publisher")), "出版社"),
      e.need("year", "出版年份"), western.locator(e, "p."));
  },

  /** Volume Journal FirstPage, Pin (Year) (第105条). */
  en_article(e) {
    const head = `${authors(e)}, ${title(e)}`;
    let source = `${e.need("volume", "卷数")} ${e.require(fullForm(JOURNALS, e.get("journal")), "刊名")} ` +
      `${e.need("first_page", "首页")}`;
    const pin = normalize.pages(e.get("pin"));
    if (pin) source += `, ${pin}`;
    return `${head}, ${source} (${e.need("year", "年份")}).`;
  },

  en_case_us(e) {
    const pin = e.get("pin") ? `, ${normalize.pages(e.get("pin"))}` : "";
    const court = e.get("court") ? `${e.get("court")} ` : "";
    return `*${normalize.caseName(e.need("name", "案例名称"))}*, ${e.need("volume", "卷数")} ` +
      `${e.need("reporter", "案例报告")} ${e.need("first_page", "首页")}${pin} (${court}${e.need("year", "年份")}).`;
  },

  /** *Ridge v. Baldwin* [1964] AC 40; year in round brackets when it is not part of the reference. */
  en_case_uk(e) {
    const name = normalize.caseName(e.need("name", "案例名称"));
    const year = e.need("year", "年份");
    const pin = e.get("pin") ? `, ${e.get("pin")}` : "";
    return `*${name}* ${e.flag("round") ? `(${year})` : `[${year}]`} ${e.need("report", "案例报告")}${pin}.`;
  },
};
