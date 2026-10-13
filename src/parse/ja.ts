/** Japanese: 作者『書名』… and 作者「論文名」刊名… — recognised by kana or Japanese brackets. */
import type { Fields } from "../entry.ts";
import { cut, groups, type Parser } from "./util.ts";

/** Kana, 巻, or a 『書名』 that is not a quotation inside 「」 — 「」 and 頁 alone are also traditional Chinese. */
export const looksJapanese = (text: string): boolean =>
    /[぀-ヿ]|巻/.test(text) ||
    (/『/.test(text.replace(/「[^」]*」/g, "")) && !/[《〈]/.test(text));
const BOOK = /^(?<authors>[^『「]*?)\s*『(?<title>[^』]+)』(?<rest>.*)$/;
const ARTICLE =
    /^(?<authors>[^『「]*?)\s*「(?<title>[^」]+)」(?<rest>(?!.*編\s*『).*)$/; // not 編『書名』
const JOURNAL =
    /^[\s、，,]*『?(?<journal>[^\d『』（(、，,]+)』?\s*[、，,]?\s*(?:第?(?<volume>\d+)\s*巻)?\s*(?:第?(?<issue>\d+)\s*号)?/;
const YEAR = /(?<year>(?:明治|大正|昭和|平成|令和)\s*(?:元|\d+)|\d{4})\s*年?/;
const PAGES =
    /(?<pages>\d+(?:\s*[-–~～]\s*\d+)?)\s*頁|p+\.\s*(?<p>\d+(?:\s*[-–~～]\s*\d+)?)/;

/** Authors, pages and year; also returns what is left of `rest` (the publisher, for a book). */
function common(m: RegExpMatchArray, rest: string): [Fields, string] {
    const pages = rest.match(PAGES);
    rest = cut(rest, pages);
    const year = rest.match(YEAR);
    const authors = m
        .groups!.authors!.replace(/^[\s、，,]+|[\s、，,]+$/g, "")
        .split(/\s*[＝=、]\s*/)
        .filter(Boolean);
    const fields = {
        authors,
        title: m.groups!.title,
        year: year?.groups!.year,
        pages: pages && (pages.groups!.pages ?? pages.groups!.p),
    };
    return [fields, cut(rest, year)];
}

/** 我妻栄『新訂担保物権法』（岩波書店，1971年）50頁 / 著者「論文名」ジュリスト1234号（2002年）56頁 */
const japanese: Parser = (text) => {
    if (!looksJapanese(text)) return null;
    text = text.replace(/[。.\s]+$/, "");
    const book = text.match(BOOK);
    if (book) {
        const [fields, rest] = common(book, book.groups!.rest!);
        return {
            type: "ja_book",
            ...fields,
            publisher:
                rest.replace(/^[\s（）()，,、・]+|[\s（）()，,、・]+$/g, "") ||
                null,
        };
    }
    const article = text.match(ARTICLE);
    if (!article) return null;
    const source = article.groups!.rest!.match(JOURNAL)!;
    const [fields] = common(
        article,
        article.groups!.rest!.slice(source[0].length)
    );
    return { type: "ja_article", ...fields, ...groups(source) };
};

export const parsers: Parser[] = [japanese];
