import type { Entry } from "../entry.ts";

/** One function per source type: an entry in, a footnote out. */
export type Style = (e: Entry) => string;
export type Styles = Record<string, Style>;

/** Chinese footnote: parts joined by full-width commas, closed by a full stop. */
export const sentence = (
    ...parts: (string | null | false | undefined)[]
): string => parts.filter(Boolean).join("，") + "。";
