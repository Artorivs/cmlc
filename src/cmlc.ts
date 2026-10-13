/**
 * 按《法学引注手册》（第二版）把参考文献整理成脚注引注。
 *
 *   cite({ type: "book", authors: ["王名扬"], title: "美国行政法", publisher: "中国法制出版社", year: 1995, pages: 18 }).text
 *   // → "王名扬：《美国行政法》，中国法制出版社1995年版，第18页。"
 *
 * Required fields the input lacks come out as [字段名] and are listed in Citation.missing.
 * Rules: docs/规则摘要.md. Worked examples: docs/转换示例.md.
 */
import { Entry, type Fields } from "./entry.ts";
import { UnverifiedSourceError } from "./errors.ts";
import { STYLES } from "./styles/index.ts";

export { blank, type Fields } from "./entry.ts";
export { TYPE_NAMES, typeName } from "./kinds.ts";
export { ParseError, UnverifiedSourceError } from "./errors.ts";
export { parse, PARSERS } from "./parse/index.ts";
export { STYLES } from "./styles/index.ts";

/** `type` is the source type the text was written as (book, statute …); typeName() gives its Chinese name. */
export interface Citation {
    text: string;
    missing: string[];
    type: string;
}

export function cite(fields: Fields): Citation {
    if (fields.unverified)
        throw new UnverifiedSourceError(
            "未经核实的文献不得引用（第2条）。请先找到原文，核对作者、篇名和出处后再转换。"
        );
    const render = STYLES[String(fields.type)];
    if (!render)
        throw new Error(
            `未知的文献类型：${fields.type}。可用类型：${Object.keys(STYLES).join(", ")}`
        );
    const entry = new Entry(fields);
    return {
        text: render(entry),
        missing: entry.missing,
        type: String(fields.type),
    };
}
