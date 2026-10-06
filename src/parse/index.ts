/**
 * Raw reference text → fields. Each parser recognises one format and returns null otherwise.
 * They are tried in the order below: unambiguous formats first, loose ones last.
 * Adding a format means adding one function to one of these files.
 */
import type { Fields } from "../entry.ts";
import { ParseError } from "../errors.ts";
import { parsers as en } from "./en.ts";
import { parsers as gbt } from "./gbt.ts";
import { parsers as ja } from "./ja.ts";
import { parsers as ru } from "./ru.ts";
import type { Parser } from "./util.ts";
import { parsers as western } from "./western.ts";
import { parsers as zh } from "./zh.ts";

export type { Parser } from "./util.ts";
export const PARSERS: Parser[] = [...gbt, ...ja, ...ru, ...zh, ...en, ...western];

export function parse(text: string): Fields {
  text = text.trim();
  for (const recognise of PARSERS) {
    const fields = recognise(text);
    if (fields) return fields;
  }
  throw new ParseError("无法识别这条原文的格式，请改用“逐项填写”。");
}
