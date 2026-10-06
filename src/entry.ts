/** A reference being cited. It knows its own fields, so it is the one to say what is missing. */

export interface Person { given?: string | null; family?: string | null }
export interface DateParts { year?: string | number | null; month?: string | number | null; day?: string | number | null }
export type Value = string | number | boolean | null | undefined | (string | Person)[] | DateParts;
export type Fields = { [key: string]: Value };

export const blank = (value: unknown): boolean =>
  value == null || value === "" || (Array.isArray(value) && !value.length) ||
  (typeof value === "object" && !Array.isArray(value) && !Object.keys(value).length);

export class Entry {
  readonly missing: string[] = [];
  private readonly fields: Fields;

  constructor(fields: Fields) { this.fields = { ...fields }; }

  /** A scalar field as text, or null when blank. */
  get(key: string): string | null {
    const value = this.fields[key];
    return blank(value) || typeof value === "object" ? null : String(value);
  }

  /** The field was declared, even if its value is unknown (e.g. a translation with no translator). */
  has(key: string): boolean { return key in this.fields; }

  flag(key: string): boolean { return Boolean(this.fields[key]); }

  list(key: string): (string | Person)[] {
    const value = this.fields[key];
    if (blank(value)) return [];
    return Array.isArray(value) ? value : [String(value)];
  }

  dateParts(key: string): DateParts | null {
    const value = this.fields[key];
    return blank(value) || typeof value !== "object" || Array.isArray(value) ? null : value as DateParts;
  }

  need(key: string, label: string): string { return this.require(this.get(key), label); }

  /** The value as text, or a visible [label] gap that is also recorded. */
  require(value: unknown, label: string): string {
    if (!blank(value)) return String(value);
    this.missing.push(label);
    return `[${label}]`;
  }

  date(key: string): string {
    const d = this.dateParts(key) ?? {};
    return `${this.require(d.year, "年份")}年${this.require(d.month, "月")}月${this.require(d.day, "日")}日`;
  }
}
