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

// ── brackets ───────────────────────────────────────────────────────────────

const PAIRS: Record<string, string> = { "《": "》", "〈": "〉", "（": "）", "(": ")", "〔": "〕", "「": "」", "『": "』", "“": "”", "[": "]", "【": "】", "［": "］" };
const CLOSERS = new Set(Object.values(PAIRS));

/** Index just past the bracket that opens at `at`, or -1 when it never closes. */
export function closing(text: string, at: number): number {
  const stack: string[] = [];
  for (let i = at; i < text.length; i++) {
    const ch = text[i]!;
    if (stack.length && ch === stack.at(-1)) { stack.pop(); if (!stack.length) return i + 1; }
    else if (PAIRS[ch]) stack.push(PAIRS[ch]);
    else if (CLOSERS.has(ch) && !stack.length) return -1;
  }
  return -1;
}

/** Split at any of `separators` outside brackets and quotes; each part keeps the separator that ended it. */
export function splitTop(text: string, separators: string): { part: string; sep: string }[] {
  const out: { part: string; sep: string }[] = [];
  let depth: string[] = [], start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (depth.length && ch === depth.at(-1)) depth.pop();
    else if (PAIRS[ch] && !(ch === "“" && depth.at(-1) === "”")) depth.push(PAIRS[ch]);
    else if (!depth.length && separators.includes(ch)) { out.push({ part: text.slice(start, i), sep: ch }); start = i + 1; }
  }
  if (start < text.length || !out.length) out.push({ part: text.slice(start), sep: "" });
  return out;
}

/** Index of the first `ch` outside brackets, or -1. */
export function topIndex(text: string, ch: string, from = 0): number {
  const parts = splitTop(text.slice(from), ch);
  return parts.length > 1 ? from + parts[0]!.part.length : -1;
}
