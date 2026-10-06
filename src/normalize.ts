/** Pure text normalisers. No knowledge of citation styles lives here. */

const DIGITS: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const UNITS: Record<string, number> = { 十: 10, 百: 100, 千: 1000 };
const ROMAN: [number, string][] = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"],
  [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
const ERAS: Record<string, number> = { 明治: 1868, 大正: 1912, 昭和: 1926, 平成: 1989, 令和: 2019 };

type Scalar = string | number | null | undefined;
const isBlank = (value: Scalar): value is null | undefined | "" => value == null || value === "";

/** '一千二百二十四' → 1224; '（一）' → 1; '16' → 16. */
export function toInt(numeral: string | number): number {
  const text = String(numeral).trim().replace(/[（）()]/g, "");
  if (/^\d+$/.test(text)) return Number(text);
  let total = 0, digit = 0;
  for (const ch of text) {
    if (ch in DIGITS) digit = DIGITS[ch]!;
    else if (ch in UNITS) { total += (digit || 1) * UNITS[ch]!; digit = 0; }
    else throw new Error(`无法识别的数字：${numeral}`);
  }
  return total + digit;
}

/** Page ranges in any language: '737–38' → '737-738'; '34 ss.' and '§ 15 Rn. 19' are kept. */
export function span(value: Scalar): string | null {
  if (isBlank(value)) return null;
  return String(value).trim().replace(/\s*[–—~～]\s*/g, "-")
    .replace(/(\d+)-(\d+)/g, (_, a: string, b: string) => `${a}-${a.slice(0, Math.max(0, a.length - b.length))}${b}`);
}

/** Chinese page lists: '737–38' → '737-738'; '55, 64' → '55、64'. */
export function pages(value: Scalar): string | null {
  return span(value)?.replace(/\s*[,，]\s*/g, "、").replace(/\s/g, "") ?? null;
}

/** 文号年份用六角括号（第74条）：'国发(2007)19号' → '国发〔2007〕19号'. */
export function docNumber(value: Scalar): string | null {
  return isBlank(value) ? null : String(value).trim().replace(/[(（\[【［〔](\d{4})[)）\]】］〕]/, "〔$1〕");
}

/** Drop 书名号 and a leading '中华人民共和国' (第67条). */
export function statuteName(name: string): string {
  name = name.trim().replace(/^《|》$/g, "");
  return name.replace(/^中华人民共和国/, "") || name;
}

/** 报纸版面序号前不加 0（第45条）. */
export const section = (value: string | number): string => String(value).replace(/^0+/, "") || "0";

/** 意大利文期刊卷次用罗马数字（第129–134条）：'3' → 'III'; 'III' stays. */
export function roman(value: string | number): string {
  const text = String(value).trim();
  if (!/^\d+$/.test(text)) return text;
  let n = Number(text), out = "";
  for (const [amount, letters] of ROMAN) { out += letters.repeat(Math.floor(n / amount)); n %= amount; }
  return out;
}

/** 日文用公元纪年（第143–150条）：'昭和46年' → '1971'; '1971年' → '1971'. */
export function westernYear(value: Scalar): string | null {
  if (isBlank(value)) return null;
  const text = String(value).trim();
  const m = text.match(/^(明治|大正|昭和|平成|令和)\s*(元|\d+)\s*年?$/);
  return m ? String(ERAS[m[1]!]! + (m[2] === "元" ? 1 : Number(m[2])) - 1) : text.replace(/年$/, "");
}

/** 英文案名写作 A v. B（第99–115条）. */
export const caseName = (name: string): string => name.trim().replace(/\s+v\.?\s+/g, " v. ");
