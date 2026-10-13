/** Pieces shared by the styles for European languages (第95–98条). */
import type { Entry, Person } from "../entry.ts";
import * as normalize from "../normalize.ts";

/** 名在前、姓在后；只有姓的，名标为缺项（第96条）. */
function fullName(e: Entry, author: string | Person): string {
    if (typeof author === "object")
        return `${e.require(author.given, "作者名")} ${e.require(author.family, "作者姓")}`;
    author = author.trim();
    return author.includes(" ")
        ? author
        : `${e.require(null, "作者名")} ${author}`;
}

interface Joining {
    pair: string;
    many: string;
    keep?: number;
    limit?: number;
    sep?: string;
}

/** One name; up to `limit` names joined as 'A, B{pair}C'; beyond that the first `keep` and `many`. */
export function authors(
    e: Entry,
    { pair, many, keep = 1, limit = 3, sep = ", " }: Joining
): string {
    const names = e.list("authors").map((a) => fullName(e, a));
    if (!names.length) return e.require(null, "作者");
    const text =
        e.flag("et_al") || names.length > limit
            ? `${names.slice(0, keep).join(sep)} ${many}`
            : [names.slice(0, -1).join(sep), names.at(-1)]
                  .filter(Boolean)
                  .join(pair);
    return e.get("role") ? `${text} ${e.get("role")}` : text;
}

/** 'p. 16-29'; a page is required when specific content is cited (第48条). */
export function locator(e: Entry, prefix: string): string | null {
    const found = normalize.span(e.get("pages"));
    if (found) return `${prefix} ${found}`;
    return e.flag("specific") ? `${prefix} ${e.require(null, "页码")}` : null;
}

/** Edition numbers in the language's own form ('{}' is the number); text such as 'rev. ed.' is kept. */
export const ordinal = (
    value: string | null,
    template: string
): string | null =>
    !value ? null : /^\d+$/.test(value) ? template.replace("{}", value) : value;

/** Parts joined and closed by a full stop, which an abbreviation like 'ff.' already supplies. */
export function joined(
    ...parts: (string | null | false | undefined)[]
): string {
    const text = parts.filter(Boolean).join(", ");
    return text.endsWith(".") ? text : text + ".";
}
