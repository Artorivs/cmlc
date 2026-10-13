/** German sources (第123–128条): no italics; § / Rn. / S. as locators; co-authors joined by '/'. */
import type { Entry } from "../entry.ts";
import * as normalize from "../normalize.ts";
import type { Styles } from "./style.ts";
import * as western from "./western.ts";

const authors = (e: Entry) =>
    western.authors(e, { pair: "/", sep: "/", many: "u.a." });

/** Bare page numbers get 'S.'; '§ 15 Rn. 19' and 'S. 46 ff.' are kept as written. */
function locator(e: Entry): string | null {
    const found = normalize.span(e.get("pages"));
    if (found && /^\d/.test(found)) return `S. ${found}`;
    return (
        found || (e.flag("specific") ? `S. ${e.require(null, "页码")}` : null)
    );
}

export const styles: Styles = {
    de_book: (e) =>
        western.joined(
            authors(e),
            e.need("title", "书名"),
            e.get("volume"),
            western.ordinal(e.get("edition"), "{}. Aufl."),
            e.need("publisher", "出版社"),
            e.need("year", "出版年份"),
            locator(e)
        ),

    /** ZStW 129 (2017), 630 — or, without a volume, JuS 2012, S. 238. */
    de_article(e) {
        const head = [authors(e), e.need("title", "篇名")];
        const journal = e.need("journal", "刊名"),
            year = e.need("year", "年份");
        const pages = normalize.span(e.get("pages")) ?? e.require(null, "页码");
        const volume = e.get("volume");
        return western.joined(
            ...head,
            volume
                ? `${journal} ${volume} (${year}), ${pages}`
                : `${journal} ${year}, S. ${pages}`
        );
    },
};
