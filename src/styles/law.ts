/** Legal sources: statutes, normative documents and cases (第67–90条). */
import type { Entry } from "../entry.ts";
import * as normalize from "../normalize.ts";
import { sentence, type Styles } from "./style.ts";

const LEVELS = [["article", "条"], ["paragraph", "款"], ["item", "项"], ["subitem", "目"]] as const;

/** 条款项目用阿拉伯数字，去掉括号；“之一”保留（第70条）. */
const provisions = (e: Entry): string => LEVELS.map(([key, unit]) => {
  const value = e.get(key);
  return value == null ? "" : `第${normalize.toInt(value)}${unit}` + (key === "article" ? e.get("article_suffix") ?? "" : "");
}).join("");

export const styles: Styles = {
  statute(e) {
    let title = `${e.get("issuer") ?? ""}《${normalize.statuteName(e.need("name", "法律名称"))}》`;
    if (e.get("version")) title += `（${e.get("version")}）`;
    else if (e.flag("amended")) title += `（${e.require(null, "修订或修正年份")}）`;  // 修改过的法律须注明版本（第69条）
    if (e.flag("repealed")) title += "（已废止）";
    return `${title}${provisions(e)}。`;
  },

  /** 制定机关《文件名》，文号（第72–75条）. */
  normative(e) {
    const name = e.need("name", "文件名称").replace(/^《|》$/g, "");
    const issuer = e.get("issuer") ?? "";
    const title = `${name.includes(issuer) ? "" : issuer}《${name}》`;
    const number = normalize.docNumber(e.get("doc_no"));
    const inline = e.flag("inline");
    const mark = number ? (inline ? `（${number}）` : number)
      : e.dateParts("date") ? `${e.date("date")}发布` : e.require(null, "文号");
    const part = e.get("section");
    const where = part ? `第${part}节` + (e.get("subsection") ? `第${e.get("subsection")}小节` : "") : provisions(e);
    return inline ? sentence(title + mark, where) : sentence(title, mark, where);
  },

  /** 案名，法院全称（年份）案号+文书类型（第87–89条）. */
  case(e) {
    const number = e.get("case_no")?.trim().replace(/号$/, "");
    const judged = e.dateParts("date") ? `，${e.date("date")}` : "";
    return `${e.need("name", "案例名称")}，${e.need("court", "审判法院")}（${e.need("year", "年份")}）` +
      `${e.require(number, "案号")}号${e.need("doc_type", "文书类型")}${judged}。`;
  },

  case_gazette: e => `${e.need("name", "案例名称")}，载《${e.get("gazette") ?? "最高人民法院公报"}》` +
    `${e.need("year", "年份")}年第${e.need("issue", "期次")}期。`,

  case_guiding: e => `${e.need("name", "案例名称")}，最高人民法院指导性案例` +
    `${e.need("number", "案例序号")}号（${e.need("year", "发布年份")}年）。`,

  case_library: e => `${e.need("name", "案例名称")}，人民法院案例库${e.need("library_no", "入库编号")}。`,
};
