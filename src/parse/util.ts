import { blank, type DateParts, type Fields, type Value } from "../entry.ts";

/** One raw format: the fields it reads, or null when the text is not in that format. */
export type Parser = (text: string) => Fields | null;

/** Drop blank values. */
export const compact = (fields: Record<string, Value>): Fields =>
  Object.fromEntries(Object.entries(fields).filter(([, v]) => !blank(v)));

/** A match's non-empty named groups, trimmed. */
export const groups = (m: RegExpMatchArray): Fields =>
  compact(Object.fromEntries(Object.entries(m.groups ?? {}).map(([k, v]) => [k, v?.trim()])));

/** The pattern's named groups as fields of the given type. */
export function matched(pattern: RegExp, text: string, type: string): Fields | null {
  const m = text.match(pattern);
  return m && { type, ...groups(m) };
}

/** '2000-05-01' → { year: '2000', month: '5', day: '1' }; missing parts are left out. */
export const date = (text: string): DateParts =>
  Object.fromEntries((text.match(/\d+/g) ?? []).slice(0, 3).map((p, i) => [["year", "month", "day"][i], String(Number(p))]));

/** A named group of the first match, or the whole match for group 0. */
export function search(pattern: RegExp, text: string, group: string | 0): string | null {
  const m = text.match(pattern);
  return !m ? null : group === 0 ? m[0] : m.groups?.[group] ?? null;
}

/** The text with one match cut out. */
export const cut = (text: string, m: RegExpMatchArray | null): string =>
  m ? text.slice(0, m.index) + text.slice(m.index! + m[0].length) : text;

export const names = (text: string): string[] => text.split(/[,，、]/).map(s => s.trim()).filter(Boolean);
