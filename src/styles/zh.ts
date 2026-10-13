/** Chinese literature: books, articles, newspapers, online sources, theses (第25–64条). */
import type { Entry } from "../entry.ts";
import * as normalize from "../normalize.ts";
import { sentence, type Styles } from "./style.ts";

/** 国籍方括号、朝代圆括号、顿号连接、著作方式（第27–36条）. */
function author(e: Entry): string | null {
    if (e.flag("no_author")) return null;
    const names = e.list("authors").map(String);
    if (!names.length) return e.require(null, "作者");
    let text = names.join("、") + (e.flag("et_al") ? "等" : "");
    if (e.get("nationality")) text = `[${e.get("nationality")}]${text}`;
    if (e.get("dynasty")) text = `（${e.get("dynasty")}）${text}`;
    return text + (e.get("role") ?? "");
}

/** 作者：《题名》 — the author is omitted when the source has none. */
function head(e: Entry, label: string, suffix = ""): string {
    const name = author(e);
    const title = `《${e.need("title", label)}》${suffix}`;
    return name ? `${name}：${title}` : title;
}

const edition = (value: string | null): string =>
    !value ? "" : /^\d+$/.test(value) ? `（第${value}版）` : `（${value}）`;

const publication = (e: Entry): string =>
    `${e.need("publisher", "出版社")}${e.need("year", "出版年份")}年版`;

/** Pages, else chapter; pages are required when specific content is cited (第48条). */
function locator(e: Entry): string | null {
    const found = normalize.pages(e.get("pages"));
    if (found)
        return found.endsWith("以下")
            ? `第${found.slice(0, -2)}页以下`
            : `第${found}页`;
    if (e.get("chapter")) return e.get("chapter");
    return e.flag("specific") ? `第${e.require(null, "页码")}页` : null;
}

const DATED_URL = /(19|20)\d{2}[/\-_]?(0[1-9]|1[0-2])[/\-_]?\d{2}/;

export const styles: Styles = {
    book(e) {
        const title = head(
            e,
            "书名",
            edition(e.get("edition")) + (e.get("volume") ?? "")
        );
        const translators = e.has("translators")
            ? `${e.need("translators", "译者")}译`
            : null;
        const collators = e.get("collators") && `${e.get("collators")}点校`;
        const published = e.flag("self_published") ? "自版" : publication(e);
        return sentence(title, translators, collators, published, locator(e));
    },

    article(e) {
        const title = head(e, "篇名");
        const source = `载《${e.need("journal", "刊名")}》${e.need("year", "年份")}年第${e.need("issue", "期次")}期`;
        return sentence(title, source, locator(e));
    },

    chapter(e) {
        const title = head(e, "篇名");
        const translators = e.get("translators") && `${e.get("translators")}译`;
        const editors = e.list("editors").map(String).join("、");
        const role = e.has("editor_role")
            ? e.need("editor_role", "编者身份")
            : "主编"; // 未注明身份时须核对
        const by = editors ? `${editors}${role}：` : "";
        const source = `载${by}《${e.need("book_title", "文集名")}》${e.get("volume") ?? ""}`;
        return sentence(title, translators, source, publication(e), locator(e));
    },

    newspaper(e) {
        const title = head(e, "标题");
        const source = `载《${e.need("paper", "报名")}》${e.date("date")}`;
        const part = e.get("section");
        return sentence(
            title,
            source,
            `第${e.require(part && normalize.section(part), "版面")}版`
        );
    },

    /** 网站名与日期之间不加逗号；链接含日期的可省日期；无日期写访问日期（第51–54条）. */
    web(e) {
        const title = e.list("authors").length
            ? head(e, "标题")
            : `《${e.need("title", "标题")}》`;
        let source = `载${e.need("site", "网站名")}`,
            visited: string | null = null;
        const url = e.get("url"),
            accessed = e.dateParts("accessed");
        if (e.dateParts("date")) source += e.date("date");
        else if (url && DATED_URL.test(url)) {
            /* 链接含日期，可省（第53条） */
        } else if (accessed)
            visited = `${accessed.year}年${accessed.month}月${accessed.day}日访问`;
        else source += e.require(null, "上传日期");
        return sentence(title, source, url, visited);
    },

    /** 第二版不要求链接（第56条）. */
    wechat: (e) =>
        sentence(
            head(e, "标题"),
            `载微信公众号“${e.need("account", "公众号名称")}”${e.date("date")}`
        ),

    thesis(e) {
        const title = head(e, "题目");
        const degree = `${e.need("school", "授予单位")}${e.need("year", "答辩年份")}年${e.need("degree", "博士/硕士")}学位论文`;
        return sentence(title, degree, locator(e));
    },
};
