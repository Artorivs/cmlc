/** Japanese sources (第143–150条): 『書名』, 「論文名」, Western years, pages as 頁. */
import type { Entry } from "../entry.ts";
import * as normalize from "../normalize.ts";
import type { Styles } from "./style.ts";

/** 多位作者之间用“＝”. */
function authors(e: Entry): string {
    const names = e.list("authors").map(String);
    return names.length ? names.join("＝") : e.require(null, "作者");
}

const year = (e: Entry, label: string) =>
    e.require(normalize.westernYear(e.get("year")), label);

function pages(e: Entry): string {
    const found = normalize.span(e.get("pages"));
    if (found) return `${found}頁`;
    return e.flag("specific") ? `${e.require(null, "页码")}頁` : "";
}

export const styles: Styles = {
    ja_book: (e) =>
        `${authors(e)}『${e.need("title", "书名")}』` +
        `（${e.need("publisher", "出版社")}，${year(e, "出版年份")}年）${pages(e)}。`,

    /** 作者「論文名」刊名巻号（年）頁. */
    ja_article(e) {
        const head = `${authors(e)}「${e.need("title", "篇名")}」${e.need("journal", "刊名")}`;
        const number =
            (e.get("volume") ? `${e.get("volume")}巻` : "") +
            (e.get("issue") ? `${e.get("issue")}号` : "");
        return `${head}${number || e.require(null, "巻号")}（${year(e, "年份")}年）${pages(e)}。`;
    },
};
