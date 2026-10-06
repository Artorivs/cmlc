/** Russian sources (第135–142条): parts separated by full stops; '//' before the journal; 'С.' for pages. */
import type { Entry } from "../entry.ts";
import type { Styles } from "./style.ts";
import * as western from "./western.ts";

const authors = (e: Entry) => western.authors(e, { pair: " и ", many: "и др.", limit: 2 });

const joined = (...parts: (string | null | false | undefined)[]): string =>
  parts.filter(Boolean).map(p => (p as string).replace(/\.+$/, "")).join(". ") + ".";

export const styles: Styles = {
  /** 出版社与年份之间用逗号，其他项之间用句点；版次括注. */
  ru_book(e) {
    const who = authors(e);
    const edition = western.ordinal(e.get("edition"), "{}-е изд.");
    const title = `*${e.need("title", "书名")}*` + (edition ? ` (${edition})` : "");
    const imprint = `${e.need("publisher", "出版社")}, ${e.need("year", "出版年份")}`;
    return joined(who, title, imprint, western.locator(e, "С."));
  },

  /** 作者. *题目* // 刊名. 2023. № 3. С. 17-30. */
  ru_article(e) {
    const head = `${authors(e).replace(/\.+$/, "")}. *${e.need("title", "篇名")}*`;
    const source = joined(e.need("journal", "刊名"), e.need("year", "年份"),
      e.get("issue") && `№ ${e.get("issue")}`, western.locator(e, "С."));
    return `${head} // ${source}`;
  },
};
