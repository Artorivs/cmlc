// Built from src/ by build.ts. Edit the TypeScript, then run: npm run build
"use strict";
(() => {
  // src/entry.ts
  var blank = (value) => value == null || value === "" || Array.isArray(value) && !value.length || typeof value === "object" && !Array.isArray(value) && !Object.keys(value).length;
  var Entry = class {
    missing = [];
    fields;
    constructor(fields) {
      this.fields = { ...fields };
    }
    /** A scalar field as text, or null when blank. */
    get(key) {
      const value = this.fields[key];
      return blank(value) || typeof value === "object" ? null : String(value);
    }
    /** The field was declared, even if its value is unknown (e.g. a translation with no translator). */
    has(key) {
      return key in this.fields;
    }
    flag(key) {
      return Boolean(this.fields[key]);
    }
    list(key) {
      const value = this.fields[key];
      if (blank(value)) return [];
      return Array.isArray(value) ? value : [String(value)];
    }
    dateParts(key) {
      const value = this.fields[key];
      return blank(value) || typeof value !== "object" || Array.isArray(value) ? null : value;
    }
    need(key, label) {
      return this.require(this.get(key), label);
    }
    /** The value as text, or a visible [label] gap that is also recorded. */
    require(value, label) {
      if (!blank(value)) return String(value);
      this.missing.push(label);
      return `[${label}]`;
    }
    date(key) {
      const d = this.dateParts(key) ?? {};
      return `${this.require(d.year, "年份")}年${this.require(d.month, "月")}月${this.require(d.day, "日")}日`;
    }
  };

  // src/errors.ts
  var ParseError = class extends Error {
    name = "ParseError";
  };
  var UnverifiedSourceError = class extends Error {
    name = "UnverifiedSourceError";
  };

  // src/normalize.ts
  var DIGITS = { 零: 0, "〇": 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  var UNITS = { 十: 10, 百: 100, 千: 1e3 };
  var ROMAN = [
    [1e3, "M"],
    [900, "CM"],
    [500, "D"],
    [400, "CD"],
    [100, "C"],
    [90, "XC"],
    [50, "L"],
    [40, "XL"],
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"]
  ];
  var ERAS = { 明治: 1868, 大正: 1912, 昭和: 1926, 平成: 1989, 令和: 2019 };
  var isBlank = (value) => value == null || value === "";
  function toInt(numeral) {
    const text = String(numeral).trim().replace(/[（）()]/g, "");
    if (/^\d+$/.test(text)) return Number(text);
    let total = 0, digit = 0;
    for (const ch of text) {
      if (ch in DIGITS) digit = DIGITS[ch];
      else if (ch in UNITS) {
        total += (digit || 1) * UNITS[ch];
        digit = 0;
      } else throw new Error(`无法识别的数字：${numeral}`);
    }
    return total + digit;
  }
  function span(value) {
    if (isBlank(value)) return null;
    return String(value).trim().replace(/\s*[–—~～]\s*/g, "-").replace(/(\d+)-(\d+)/g, (_, a, b) => `${a}-${a.slice(0, Math.max(0, a.length - b.length))}${b}`);
  }
  function pages(value) {
    return span(value)?.replace(/\s*[,，]\s*/g, "、").replace(/\s/g, "") ?? null;
  }
  function docNumber(value) {
    return isBlank(value) ? null : String(value).trim().replace(/[(（\[【［〔](\d{4})[)）\]】］〕]/, "〔$1〕");
  }
  function statuteName(name) {
    name = name.trim().replace(/^《|》$/g, "");
    return name.replace(/^(?:中华人民共和国|中華人民共和國)/, "") || name;
  }
  var section = (value) => String(value).replace(/^0+/, "") || "0";
  function roman(value) {
    const text = String(value).trim();
    if (!/^\d+$/.test(text)) return text;
    let n = Number(text), out = "";
    for (const [amount, letters] of ROMAN) {
      out += letters.repeat(Math.floor(n / amount));
      n %= amount;
    }
    return out;
  }
  function westernYear(value) {
    if (isBlank(value)) return null;
    const text = String(value).trim();
    const m = text.match(/^(明治|大正|昭和|平成|令和)\s*(元|\d+)\s*年?$/);
    return m ? String(ERAS[m[1]] + (m[2] === "元" ? 1 : Number(m[2])) - 1) : text.replace(/年$/, "");
  }
  var caseName = (name) => name.trim().replace(/\s+v\.?\s+/g, " v. ");

  // src/styles/western.ts
  function fullName(e, author2) {
    if (typeof author2 === "object") return `${e.require(author2.given, "作者名")} ${e.require(author2.family, "作者姓")}`;
    author2 = author2.trim();
    return author2.includes(" ") ? author2 : `${e.require(null, "作者名")} ${author2}`;
  }
  function authors(e, { pair, many, keep = 1, limit = 3, sep = ", " }) {
    const names2 = e.list("authors").map((a) => fullName(e, a));
    if (!names2.length) return e.require(null, "作者");
    const text = e.flag("et_al") || names2.length > limit ? `${names2.slice(0, keep).join(sep)} ${many}` : [names2.slice(0, -1).join(sep), names2.at(-1)].filter(Boolean).join(pair);
    return e.get("role") ? `${text} ${e.get("role")}` : text;
  }
  function locator(e, prefix) {
    const found = span(e.get("pages"));
    if (found) return `${prefix} ${found}`;
    return e.flag("specific") ? `${prefix} ${e.require(null, "页码")}` : null;
  }
  var ordinal = (value, template) => !value ? null : /^\d+$/.test(value) ? template.replace("{}", value) : value;
  function joined(...parts) {
    const text = parts.filter(Boolean).join(", ");
    return text.endsWith(".") ? text : text + ".";
  }

  // src/styles/de.ts
  var authors2 = (e) => authors(e, { pair: "/", sep: "/", many: "u.a." });
  function locator2(e) {
    const found = span(e.get("pages"));
    if (found && /^\d/.test(found)) return `S. ${found}`;
    return found || (e.flag("specific") ? `S. ${e.require(null, "页码")}` : null);
  }
  var styles = {
    de_book: (e) => joined(
      authors2(e),
      e.need("title", "书名"),
      e.get("volume"),
      ordinal(e.get("edition"), "{}. Aufl."),
      e.need("publisher", "出版社"),
      e.need("year", "出版年份"),
      locator2(e)
    ),
    /** ZStW 129 (2017), 630 — or, without a volume, JuS 2012, S. 238. */
    de_article(e) {
      const head2 = [authors2(e), e.need("title", "篇名")];
      const journal = e.need("journal", "刊名"), year2 = e.need("year", "年份");
      const pages3 = span(e.get("pages")) ?? e.require(null, "页码");
      const volume = e.get("volume");
      return joined(...head2, volume ? `${journal} ${volume} (${year2}), ${pages3}` : `${journal} ${year2}, S. ${pages3}`);
    }
  };

  // src/styles/en.ts
  var JOURNALS = {
    "Yale L.J.": "Yale Law Journal",
    "Harv. L. Rev.": "Harvard Law Review",
    "Colum. L. Rev.": "Columbia Law Review",
    "Stan. L. Rev.": "Stanford Law Review",
    "U. Chi. L. Rev.": "University of Chicago Law Review",
    "Mich. L. Rev.": "Michigan Law Review",
    "Cal. L. Rev.": "California Law Review",
    "N.Y.U. L. Rev.": "New York University Law Review",
    "Am. J. Comp. L.": "American Journal of Comparative Law",
    "Am. J. Int'l L.": "American Journal of International Law",
    "Harv. Hum. Rts. J.": "Harvard Human Rights Journal"
  };
  var PUBLISHERS = {
    "Stanford UP": "Stanford University Press",
    "Oxford UP": "Oxford University Press",
    "OUP": "Oxford University Press",
    "Cambridge UP": "Cambridge University Press",
    "CUP": "Cambridge University Press",
    "Harvard UP": "Harvard University Press",
    "Princeton UP": "Princeton University Press"
  };
  var fullForm = (table, value) => value && (table[value] ?? value);
  var authors3 = (e) => authors(e, { pair: " & ", many: "et al.", keep: 2 });
  function title(e) {
    let text = e.need("title", "标题");
    if (e.has("subtitle")) text += `: ${e.need("subtitle", "副标题")}`;
    return `*${text}*`;
  }
  var styles2 = {
    en_book(e) {
      const head2 = [authors3(e), title(e) + (e.get("edition") ? ` (${e.get("edition")} ed.)` : "")];
      const translator = e.get("translated_by") && `translated by ${e.get("translated_by")}`;
      return joined(
        ...head2,
        translator,
        e.require(fullForm(PUBLISHERS, e.get("publisher")), "出版社"),
        e.need("year", "出版年份"),
        locator(e, "p.")
      );
    },
    /** Volume Journal FirstPage, Pin (Year) (第105条). */
    en_article(e) {
      const head2 = `${authors3(e)}, ${title(e)}`;
      let source = `${e.need("volume", "卷数")} ${e.require(fullForm(JOURNALS, e.get("journal")), "刊名")} ${e.need("first_page", "首页")}`;
      const pin = pages(e.get("pin"));
      if (pin) source += `, ${pin}`;
      return `${head2}, ${source} (${e.need("year", "年份")}).`;
    },
    en_case_us(e) {
      const pin = e.get("pin") ? `, ${pages(e.get("pin"))}` : "";
      const court = e.get("court") ? `${e.get("court")} ` : "";
      return `*${caseName(e.need("name", "案例名称"))}*, ${e.need("volume", "卷数")} ${e.need("reporter", "案例报告")} ${e.need("first_page", "首页")}${pin} (${court}${e.need("year", "年份")}).`;
    },
    /** *Ridge v. Baldwin* [1964] AC 40; year in round brackets when it is not part of the reference. */
    en_case_uk(e) {
      const name = caseName(e.need("name", "案例名称"));
      const year2 = e.need("year", "年份");
      const pin = e.get("pin") ? `, ${e.get("pin")}` : "";
      return `*${name}* ${e.flag("round") ? `(${year2})` : `[${year2}]`} ${e.need("report", "案例报告")}${pin}.`;
    }
  };

  // src/styles/fr.ts
  var authors4 = (e) => authors(e, { pair: " et ", many: "et al." });
  var edition = (value) => ordinal(value, value === "1" ? "1re éd." : "{}e éd.");
  var styles3 = {
    fr_book: (e) => joined(
      authors4(e),
      `*${e.need("title", "书名")}*`,
      edition(e.get("edition")),
      e.need("publisher", "出版社"),
      e.need("year", "出版年份"),
      locator(e, "p.")
    ),
    fr_article: (e) => joined(
      authors4(e),
      `« ${e.need("title", "篇名")} »`,
      `*${e.need("journal", "刊名")}*`,
      e.need("year", "年份"),
      e.get("issue") && `n° ${e.get("issue")}`,
      locator(e, "p.")
    )
  };

  // src/styles/it.ts
  var authors5 = (e) => authors(e, { pair: " e ", many: "et al." });
  var styles4 = {
    it_book: (e) => joined(
      authors5(e),
      `*${e.need("title", "书名")}*`,
      ordinal(e.get("edition"), "{}ª ed."),
      e.need("publisher", "出版社"),
      e.need("year", "出版年份"),
      locator(e, "p.")
    ),
    it_article(e) {
      const volume = e.get("volume");
      return joined(
        authors5(e),
        `*${e.need("title", "篇名")}*`,
        `in ${e.need("journal", "刊名")}`,
        e.need("year", "年份"),
        volume && roman(volume),
        e.get("issue") && `n. ${e.get("issue")}`,
        locator(e, "p.")
      );
    }
  };

  // src/styles/ja.ts
  function authors6(e) {
    const names2 = e.list("authors").map(String);
    return names2.length ? names2.join("＝") : e.require(null, "作者");
  }
  var year = (e, label) => e.require(westernYear(e.get("year")), label);
  function pages2(e) {
    const found = span(e.get("pages"));
    if (found) return `${found}頁`;
    return e.flag("specific") ? `${e.require(null, "页码")}頁` : "";
  }
  var styles5 = {
    ja_book: (e) => `${authors6(e)}『${e.need("title", "书名")}』（${e.need("publisher", "出版社")}，${year(e, "出版年份")}年）${pages2(e)}。`,
    /** 作者「論文名」刊名巻号（年）頁. */
    ja_article(e) {
      const head2 = `${authors6(e)}「${e.need("title", "篇名")}」${e.need("journal", "刊名")}`;
      const number = (e.get("volume") ? `${e.get("volume")}巻` : "") + (e.get("issue") ? `${e.get("issue")}号` : "");
      return `${head2}${number || e.require(null, "巻号")}（${year(e, "年份")}年）${pages2(e)}。`;
    }
  };

  // src/styles/style.ts
  var sentence = (...parts) => parts.filter(Boolean).join("，") + "。";

  // src/styles/law.ts
  var LEVELS = [["article", "条"], ["paragraph", "款"], ["item", "项"], ["subitem", "目"]];
  var provisions = (e) => e.get("locator") ?? LEVELS.map(([key, unit]) => {
    const value = e.get(key);
    return value == null ? "" : `第${toInt(value)}${unit}` + (key === "article" ? e.get("article_suffix") ?? "" : "");
  }).join("");
  var styles6 = {
    statute(e) {
      let title2 = `${e.get("issuer") ?? ""}《${statuteName(e.need("name", "法律名称"))}》`;
      if (e.get("version")) title2 += `（${e.get("version")}）`;
      else if (e.flag("amended")) title2 += `（${e.require(null, "修订或修正年份")}）`;
      if (e.flag("repealed")) title2 += "（已废止）";
      return `${title2}${provisions(e)}。`;
    },
    /** 制定机关《文件名》，文号（第72–75条）. */
    normative(e) {
      const name = e.need("name", "文件名称").replace(/^《|》$/g, "");
      const issuer = e.get("issuer") ?? "";
      const title2 = `${name.includes(issuer) ? "" : issuer}《${name}》`;
      const number = docNumber(e.get("doc_no"));
      const inline = e.flag("inline") || e.flag("repealed");
      const mark = number && e.flag("repealed") ? `（${number}，已废止）` : e.flag("repealed") ? `（${e.dateParts("date") ? `${e.date("date")}${e.get("date_event") ?? "发布"}` : e.require(null, "文号")}，已废止）` : number ? inline ? `（${number}）` : number : e.dateParts("date") ? `${e.date("date")}${e.get("date_event") ?? "发布"}` : e.require(null, "文号");
      const part = e.get("section");
      const where = part ? `第${part}节` + (e.get("subsection") ? `第${e.get("subsection")}小节` : "") : provisions(e);
      return inline ? sentence(title2 + mark, where) : sentence(title2, mark, where);
    },
    /** 案名，法院全称（年份）案号+文书类型（第87–89条）. */
    case(e) {
      const number = e.get("case_no")?.trim().replace(/号$/, "");
      const judged = e.dateParts("date") ? `，${e.date("date")}` : "";
      return `${e.need("name", "案例名称")}，${e.need("court", "审判法院")}（${e.need("year", "年份")}）${e.require(number, "案号")}号${e.need("doc_type", "文书类型")}${judged}。`;
    },
    case_gazette: (e) => `${e.need("name", "案例名称")}，载《${e.get("gazette") ?? "最高人民法院公报"}》${e.need("year", "年份")}年第${e.need("issue", "期次")}期。`,
    case_guiding: (e) => `${e.need("name", "案例名称")}，最高人民法院指导性案例${e.need("number", "案例序号")}号（${e.need("year", "发布年份")}年）。`,
    case_library: (e) => `${e.need("name", "案例名称")}，人民法院案例库${e.need("library_no", "入库编号")}。`
  };

  // src/styles/ru.ts
  var authors7 = (e) => authors(e, { pair: " и ", many: "и др.", limit: 2 });
  var joined2 = (...parts) => parts.filter(Boolean).map((p) => p.replace(/\.+$/, "")).join(". ") + ".";
  var styles7 = {
    /** 出版社与年份之间用逗号，其他项之间用句点；版次括注. */
    ru_book(e) {
      const who = authors7(e);
      const edition3 = ordinal(e.get("edition"), "{}-е изд.");
      const title2 = `*${e.need("title", "书名")}*` + (edition3 ? ` (${edition3})` : "");
      const imprint2 = `${e.need("publisher", "出版社")}, ${e.need("year", "出版年份")}`;
      return joined2(who, title2, imprint2, locator(e, "С."));
    },
    /** 作者. *题目* // 刊名. 2023. № 3. С. 17-30. */
    ru_article(e) {
      const head2 = `${authors7(e).replace(/\.+$/, "")}. *${e.need("title", "篇名")}*`;
      const source = joined2(
        e.need("journal", "刊名"),
        e.need("year", "年份"),
        e.get("issue") && `№ ${e.get("issue")}`,
        locator(e, "С.")
      );
      return `${head2} // ${source}`;
    }
  };

  // src/styles/zh.ts
  function author(e) {
    if (e.flag("no_author")) return null;
    const names2 = e.list("authors").map(String);
    if (!names2.length) return e.require(null, "作者");
    let text = names2.join("、") + (e.flag("et_al") ? "等" : "");
    if (e.get("nationality")) text = `[${e.get("nationality")}]${text}`;
    if (e.get("dynasty")) text = `（${e.get("dynasty")}）${text}`;
    return text + (e.get("role") ?? "");
  }
  function head(e, label, suffix = "") {
    const name = author(e);
    const title2 = `《${e.need("title", label)}》${suffix}`;
    return name ? `${name}：${title2}` : title2;
  }
  var edition2 = (value) => !value ? "" : /^\d+$/.test(value) ? `（第${value}版）` : `（${value}）`;
  var publication = (e) => `${e.need("publisher", "出版社")}${e.need("year", "出版年份")}年版`;
  function locator3(e) {
    const found = pages(e.get("pages"));
    if (found) return found.endsWith("以下") ? `第${found.slice(0, -2)}页以下` : `第${found}页`;
    if (e.get("chapter")) return e.get("chapter");
    return e.flag("specific") ? `第${e.require(null, "页码")}页` : null;
  }
  var DATED_URL = /(19|20)\d{2}[/\-_]?(0[1-9]|1[0-2])[/\-_]?\d{2}/;
  var styles8 = {
    book(e) {
      const title2 = head(e, "书名", edition2(e.get("edition")) + (e.get("volume") ?? ""));
      const translators = e.has("translators") ? `${e.need("translators", "译者")}译` : null;
      const collators = e.get("collators") && `${e.get("collators")}点校`;
      const published = e.flag("self_published") ? "自版" : publication(e);
      return sentence(title2, translators, collators, published, locator3(e));
    },
    article(e) {
      const title2 = head(e, "篇名");
      const source = `载《${e.need("journal", "刊名")}》${e.need("year", "年份")}年第${e.need("issue", "期次")}期`;
      return sentence(title2, source, locator3(e));
    },
    chapter(e) {
      const title2 = head(e, "篇名");
      const translators = e.get("translators") && `${e.get("translators")}译`;
      const editors = e.list("editors").map(String).join("、");
      const role = e.has("editor_role") ? e.need("editor_role", "编者身份") : "主编";
      const by = editors ? `${editors}${role}：` : "";
      const source = `载${by}《${e.need("book_title", "文集名")}》${e.get("volume") ?? ""}`;
      return sentence(title2, translators, source, publication(e), locator3(e));
    },
    newspaper(e) {
      const title2 = head(e, "标题");
      const source = `载《${e.need("paper", "报名")}》${e.date("date")}`;
      const part = e.get("section");
      return sentence(title2, source, `第${e.require(part && section(part), "版面")}版`);
    },
    /** 网站名与日期之间不加逗号；链接含日期的可省日期；无日期写访问日期（第51–54条）. */
    web(e) {
      const title2 = e.list("authors").length ? head(e, "标题") : `《${e.need("title", "标题")}》`;
      let source = `载${e.need("site", "网站名")}`, visited = null;
      const url = e.get("url"), accessed = e.dateParts("accessed");
      if (e.dateParts("date")) source += e.date("date");
      else if (url && DATED_URL.test(url)) {
      } else if (accessed) visited = `${accessed.year}年${accessed.month}月${accessed.day}日访问`;
      else source += e.require(null, "上传日期");
      return sentence(title2, source, url, visited);
    },
    /** 第二版不要求链接（第56条）. */
    wechat: (e) => sentence(head(e, "标题"), `载微信公众号“${e.need("account", "公众号名称")}”${e.date("date")}`),
    thesis(e) {
      const title2 = head(e, "题目");
      const degree = `${e.need("school", "授予单位")}${e.need("year", "答辩年份")}年${e.need("degree", "博士/硕士")}学位论文`;
      return sentence(title2, degree, locator3(e));
    }
  };

  // src/styles/index.ts
  var STYLES = { ...styles8, ...styles6, ...styles2, ...styles3, ...styles, ...styles4, ...styles7, ...styles5 };

  // src/kinds.ts
  var TYPE_NAMES = {
    book: "中文图书",
    article: "期刊论文",
    chapter: "文集、集刊文章",
    newspaper: "报纸文章",
    web: "网络文献",
    wechat: "微信公众号文章",
    thesis: "学位论文",
    statute: "法律法规",
    normative: "规范性文件",
    case: "裁判文书",
    case_gazette: "公报案例",
    case_guiding: "指导性案例",
    case_library: "人民法院案例库",
    en_book: "英文图书",
    en_article: "英文期刊论文",
    en_case_us: "美国案例",
    en_case_uk: "英国案例",
    fr_book: "法文图书",
    fr_article: "法文期刊论文",
    de_book: "德文图书",
    de_article: "德文期刊论文",
    it_book: "意大利文图书",
    it_article: "意大利文期刊论文",
    ru_book: "俄文图书",
    ru_article: "俄文期刊论文",
    ja_book: "日文图书",
    ja_article: "日文期刊论文"
  };
  var typeName = (type) => TYPE_NAMES[String(type)] ?? String(type);

  // src/parse/util.ts
  var compact = (fields) => Object.fromEntries(Object.entries(fields).filter(([, v]) => !blank(v)));
  var groups = (m) => compact(Object.fromEntries(Object.entries(m.groups ?? {}).map(([k, v]) => [k, v?.trim()])));
  function matched(pattern, text, type) {
    const m = text.match(pattern);
    return m && { type, ...groups(m) };
  }
  var date = (text) => Object.fromEntries((text.match(/\d+/g) ?? []).slice(0, 3).map((p, i) => [["year", "month", "day"][i], String(Number(p))]));
  function search(pattern, text, group) {
    const m = text.match(pattern);
    return !m ? null : group === 0 ? m[0] : m.groups?.[group] ?? null;
  }
  var cut = (text, m) => m ? text.slice(0, m.index) + text.slice(m.index + m[0].length) : text;
  var names = (text) => text.split(/[,，、]/).map((s) => s.trim()).filter(Boolean);
  var PAIRS = { "《": "》", "〈": "〉", "（": "）", "(": ")", "〔": "〕", "「": "」", "『": "』", "“": "”", "[": "]", "【": "】", "［": "］" };
  var CLOSERS = new Set(Object.values(PAIRS));
  function closing(text, at) {
    const stack = [];
    for (let i = at; i < text.length; i++) {
      const ch = text[i];
      if (stack.length && ch === stack.at(-1)) {
        stack.pop();
        if (!stack.length) return i + 1;
      } else if (PAIRS[ch]) stack.push(PAIRS[ch]);
      else if (CLOSERS.has(ch) && !stack.length) return -1;
    }
    return -1;
  }
  function splitTop(text, separators) {
    const out = [];
    let depth = [], start = 0;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (depth.length && ch === depth.at(-1)) depth.pop();
      else if (PAIRS[ch] && !(ch === "“" && depth.at(-1) === "”")) depth.push(PAIRS[ch]);
      else if (!depth.length && separators.includes(ch)) {
        out.push({ part: text.slice(start, i), sep: ch });
        start = i + 1;
      }
    }
    if (start < text.length || !out.length) out.push({ part: text.slice(start), sep: "" });
    return out;
  }
  function topIndex(text, ch, from = 0) {
    const parts = splitTop(text.slice(from), ch);
    return parts.length > 1 ? from + parts[0].part.length : -1;
  }

  // src/parse/en.ts
  var US_CASE = /^(?<name>.+?\sv\.?\s.+?),\s*(?<volume>\d+)\s+(?<reporter>[A-Z][A-Za-z0-9.' ]*?)\s+(?<first_page>\d+)(?:,\s*(?<pin>[\d–-]+))?\s*\((?:(?<court>[^()]*?)\s+)?(?<year>\d{4})\)\.?$/;
  var UK_CASE = /^(?<name>.+?(?:\sv\.?\s.+?|'s Case)|R\s.+?|Re\s.+?)\s*(?<open>[[(])(?<year>\d{4})[\])]\s*(?<report>[^,]+?)(?:,\s*(?<pin>.+?))?\.?$/;
  var OSCOLA = /^(?<authors>[^,']+(?:,\s*[^,']+)*?),\s*['‘](?<title>.+?)['’]\s*\((?<year>\d{4})\)\s*(?<volume>\d+)\s*(?:\((?<issue>\d+)\)\s*)?(?<journal>[A-Za-z.' &]+?)\s+(?<first_page>\d+)(?:,\s*(?<pin>[\d–-]+))?\.?$/;
  var BLUEBOOK = /^(?<authors>.+?),\s*(?<title>.+?),\s*(?<volume>\d+)\s+(?<journal>[A-Za-z.' &]+?)\s+(?<first_page>\d+)(?:,\s*(?<pin>[\d–-]+))?\s*\((?<year>\d{4})\)\.?$/;
  var usCase = (text) => matched(US_CASE, text, "en_case_us");
  var ukCase = (text) => {
    const fields = matched(UK_CASE, text, "en_case_uk");
    if (!fields) return null;
    const { open, ...rest } = fields;
    return open === "(" ? { ...rest, round: true } : rest;
  };
  var bluebookArticle = (text) => {
    const fields = matched(BLUEBOOK, text, "en_article");
    return fields && { ...fields, authors: String(fields.authors).split(/\s*&\s*|,\s*/).filter(Boolean) };
  };
  var oscolaArticle = (text) => {
    const fields = matched(OSCOLA, text, "en_article");
    if (!fields) return null;
    const { issue: _, ...rest } = fields;
    return { ...rest, authors: String(fields.authors).split(/\s*(?:&|\band\b)\s*|,\s*/).filter(Boolean) };
  };
  var parsers = [usCase, ukCase, oscolaArticle, bluebookArticle];

  // src/parse/gbt.ts
  var GBT = /^(?:(?<authors>(?:[[［（(][^\]］）)]+[\]］）)])?[^.[［]+?)\s*\.\s*)?(?<title>[^[［]+?)\s*[[［](?<kind>[A-Z/]+)[\]］]\s*(?<sep>\.|\/\/)\s*(?<rest>.*?)\.?$/;
  var NATIONALITY = /^[[［（(](?<nationality>[^\]］）)]+)[\]］）)]\s*/;
  var IMPRINT = String.raw`(?:[^:：,，.]+[:：]\s*)?(?<publisher>[^,，]+?)[,，]\s*(?<year>\d{4})(?:\s*[:：]\s*(?<pages>.+))?`;
  var BOOK = new RegExp(String.raw`^(?:(?<translators>[^.]+?)\s*[,，]\s*译\s*\.\s*)?(?:第?(?<edition>\d+)\s*版\s*\.\s*)?${IMPRINT}$`);
  var JOURNAL = /^(?<journal>[^,，]+)[,，]\s*(?<year>\d{4})\s*[,，]?\s*(?:\d+\s*)?\((?<issue>\d+)\)(?:\s*[:：]\s*(?<pages>.+))?$/;
  var NEWSPAPER = /^(?<paper>[^,，]+)[,，]\s*(?<date>\d{4}(?:-\d{1,2}){0,2})\s*(?:\((?<section>\d+)\))?$/;
  var THESIS = /^(?:[^:：,，.]+[:：]\s*)?(?<school>[^,，]+?)(?:[,，]\s*(?<year>\d{4}))?(?:\s*[:：]\s*(?<pages>.+))?$/;
  var HOST = new RegExp(String.raw`^(?:(?<editors>[^.]+?)\s*\.\s*)?(?<book_title>[^.]+?)\s*(?:\[M\])?\s*\.\s*${IMPRINT}$`);
  var ONLINE = /^(?:\((?<date>[\d-]+)\))?\s*(?:\[(?<accessed>[\d-]+)\])?\s*\.?\s*(?<url>\S+)$/;
  function book(rest) {
    const fields = matched(BOOK, rest, "book");
    if (fields?.translators) fields.translators = names(String(fields.translators)).join("、");
    return fields;
  }
  function newspaper(rest) {
    const fields = matched(NEWSPAPER, rest, "newspaper");
    return fields && { ...fields, date: date(String(fields.date)) };
  }
  function thesis(rest) {
    const fields = matched(THESIS, rest, "thesis");
    return fields && { year: null, ...fields, degree: null };
  }
  function chapter(rest) {
    const fields = matched(HOST, rest, "chapter");
    if (!fields) return null;
    const { editors: by = "", ...found } = fields;
    const [, editors = "", role] = String(by).match(/^(.*?)(?:\s*[,，]\s*(主编|编|编译|编著))?$/);
    if (names(editors).length) Object.assign(found, { editors: names(editors), editor_role: role ?? null });
    const volume = String(found.book_title).match(/^(.+?)\s*[:：]\s*(第.+[卷辑册])$/);
    if (volume) Object.assign(found, { book_title: volume[1], volume: volume[2] });
    return found;
  }
  function online(rest) {
    const fields = matched(ONLINE, rest, "web");
    if (!fields) return null;
    for (const key of ["date", "accessed"]) if (fields[key]) fields[key] = date(String(fields[key]));
    return { ...fields, site: null };
  }
  var KINDS = {
    M: book,
    J: (rest) => matched(JOURNAL, rest, "article"),
    N: newspaper,
    D: thesis,
    C: chapter,
    A: chapter,
    "EB/OL": online
  };
  var gbt7714 = (text) => {
    const m = text.match(GBT);
    if (!m) return null;
    const { authors: by = "", title: title2, kind, sep, rest } = m.groups;
    const read = KINDS[sep === "//" ? "C" : kind];
    if (!read) throw new ParseError(`暂不支持 GB/T 7714 的 [${kind}] 类型，请改用“逐项填写”。`);
    const fields = read(rest);
    if (!fields) throw new ParseError(`无法识别出版信息：${rest}`);
    const nation = by.match(NATIONALITY);
    if (nation) fields.nationality = nation.groups.nationality;
    let authors9 = names(nation ? by.slice(nation[0].length) : by);
    if (authors9.at(-1) === "等") [authors9, fields.et_al] = [authors9.slice(0, -1), true];
    if (authors9.length) fields.authors = authors9;
    return { title: title2.trim(), ...fields };
  };
  var parsers2 = [gbt7714];

  // src/parse/ja.ts
  var looksJapanese = (text) => /[぀-ヿ]|巻/.test(text) || /『/.test(text.replace(/「[^」]*」/g, "")) && !/[《〈]/.test(text);
  var BOOK2 = /^(?<authors>[^『「]*?)\s*『(?<title>[^』]+)』(?<rest>.*)$/;
  var ARTICLE = /^(?<authors>[^『「]*?)\s*「(?<title>[^」]+)」(?<rest>(?!.*編\s*『).*)$/;
  var JOURNAL2 = /^[\s、，,]*『?(?<journal>[^\d『』（(、，,]+)』?\s*[、，,]?\s*(?:第?(?<volume>\d+)\s*巻)?\s*(?:第?(?<issue>\d+)\s*号)?/;
  var YEAR = /(?<year>(?:明治|大正|昭和|平成|令和)\s*(?:元|\d+)|\d{4})\s*年?/;
  var PAGES = /(?<pages>\d+(?:\s*[-–~～]\s*\d+)?)\s*頁|p+\.\s*(?<p>\d+(?:\s*[-–~～]\s*\d+)?)/;
  function common(m, rest) {
    const pages3 = rest.match(PAGES);
    rest = cut(rest, pages3);
    const year2 = rest.match(YEAR);
    const authors9 = m.groups.authors.replace(/^[\s、，,]+|[\s、，,]+$/g, "").split(/\s*[＝=、]\s*/).filter(Boolean);
    const fields = { authors: authors9, title: m.groups.title, year: year2?.groups.year, pages: pages3 && (pages3.groups.pages ?? pages3.groups.p) };
    return [fields, cut(rest, year2)];
  }
  var japanese = (text) => {
    if (!looksJapanese(text)) return null;
    text = text.replace(/[。.\s]+$/, "");
    const book3 = text.match(BOOK2);
    if (book3) {
      const [fields2, rest] = common(book3, book3.groups.rest);
      return { type: "ja_book", ...fields2, publisher: rest.replace(/^[\s（）()，,、・]+|[\s（）()，,、・]+$/g, "") || null };
    }
    const article2 = text.match(ARTICLE);
    if (!article2) return null;
    const source = article2.groups.rest.match(JOURNAL2);
    const [fields] = common(article2, article2.groups.rest.slice(source[0].length));
    return { type: "ja_article", ...fields, ...groups(source) };
  };
  var parsers3 = [japanese];

  // src/parse/ru.ts
  var INITIALS = String.raw`(?:[А-ЯЁ]\.\s*){1,2}`;
  var FAMILY = String.raw`[А-ЯЁ][а-яё]+(?:-[А-ЯЁ][а-яё]+)?`;
  var AUTHOR = new RegExp(String.raw`(?:(?<family>${FAMILY})\s+(?<initials>${INITIALS})|(?<initials2>${INITIALS})(?<family2>${FAMILY}))\s*,?\s*`, "y");
  var EDITION = /^(?<edition>\d+)-е\s+изд\.?.*$/;
  var IMPRINT2 = /^(?:[^:]+:\s*)?(?<publisher>[^,]+?),\s*(?<year>\d{4})$/;
  var PAGES2 = /^С\.\s*(?<pages>.+)$/;
  var ARTICLE2 = /^(?<journal>.+?)\.\s*(?<year>\d{4})(?:\.\s*(?:Т\.\s*(?<volume>\d+)\.\s*)?№\s*(?<issue>[\d\-–]+))?(?:\.\s*С\.\s*(?<pages>[\d\s\-–]+))?\.?$/;
  function authors8(text) {
    const found = [];
    let m, pos = 0;
    for (AUTHOR.lastIndex = 0; m = AUTHOR.exec(text); pos = AUTHOR.lastIndex) {
      const g = m.groups;
      const initials = (g.initials ?? g.initials2).trim().replace(/\.\s*/g, ". ").trim();
      found.push(`${initials} ${g.family ?? g.family2}`);
    }
    return [found, text.slice(pos)];
  }
  var segments = (text) => text.replace(/\.?\s+[–—]\s+/g, ". ").replace(/\s*:\s*/g, ": ").replace(/[.\s]+$/, "").split(/(?<![СТ])\.\s+/).map((s) => s.trim()).filter(Boolean);
  function article(fields, rest) {
    const at = rest.indexOf("//");
    const m = rest.slice(at + 2).trim().match(ARTICLE2);
    return m && { type: "ru_article", ...fields, title: rest.slice(0, at).trim().replace(/\.$/, ""), ...groups(m) };
  }
  function book2(fields, rest) {
    const title2 = [];
    for (const segment of segments(rest)) {
      const m = segment.match(EDITION) ?? segment.match(IMPRINT2) ?? segment.match(PAGES2);
      if (m) Object.assign(fields, groups(m));
      else if (!/^\d+\s*с$/.test(segment)) title2.push(segment);
    }
    return { type: "ru_book", ...fields, title: title2.join(". ") };
  }
  var russian = (text) => {
    if (!/[А-Яа-яЁё]/.test(text)) return null;
    const [names2, rest] = authors8(text.trim());
    return rest.includes("//") ? article({ authors: names2 }, rest) : book2({ authors: names2 }, rest);
  };
  var parsers4 = [russian];

  // src/parse/western.ts
  var NOTHING = /(?!)/;
  var lexicon = (lang, marker, edition3, locator4, volume = NOTHING, role = "({})") => ({ lang, marker, edition: edition3, locator: locator4, volume, role });
  var GERMAN = lexicon(
    "de",
    /Aufl\.|Rn\.|Hrsg\.|\bBd\.|\bS\.\s*\d|\bff?\.(?:\s|$)|[äöüßÄÖÜ]|§|\(\d{4}\),\s*\d/,
    /^(?<edition>\d+)\.\s*Aufl\.?(?:\s+(?<year>\d{4}))?$/,
    /^(?<pages>(?:§|Rn\.|S\.|Art\.).+)$/,
    /^(?:Band|Bd\.)\s*(?<volume>\S+)$/
  );
  var ITALIAN = lexicon(
    "it",
    /a cura di|trad\. it\.|\bss\.|Giuffrè|Cedam|Zanichelli|Utet|Jovene|Il Mulino|\d\s*ª|\bRiv\.|\bdell['’]|\b(?:Milano|Torino|Roma|Napoli|Padova|Bologna|Firenze|della|delle|dello|degli|del|nel|nella|il|gli|dei)\b/,
    /^(?<edition>\d+)\s*[ªa°]?\s*ed\.?$/,
    /^pp?\.\s*(?<pages>.+)$/,
    /^(?:vol\.\s*)?(?<volume>[IVXLC]+|\d{1,3})$/
  );
  var FRENCH = lexicon(
    "fr",
    /[«»]|(?:^|[^\p{L}])éd\.|\(dir\.\)|Mélanges|Thèse|\bop\. cit\.|\bPUF\b|LGDJ|Dalloz|Montchrestien|Economica|\bParis\b|\bn°|\b(?:de la|du|des|les|pour|dans)\b|[éèêàçœ]/u,
    /^(?<edition>\d+)(?:e|re|ème)\s*éd\.?$/,
    /^pp?\.\s*(?<pages>.+)$/
  );
  var ENGLISH = lexicon("en", /(?:)/, /^(?<edition>\d+(?:st|nd|rd|th|d))\s+edn?\.?$/, /^(?:pp?\.|at)\s*(?<pages>.+)$/, NOTHING, "{}");
  var LEXICONS = [GERMAN, ITALIAN, FRENCH, ENGLISH];
  var CITIES = /* @__PURE__ */ new Set([
    "Berlin",
    "München",
    "Munich",
    "Köln",
    "Heidelberg",
    "Tübingen",
    "Frankfurt am Main",
    "Frankfurt a.M.",
    "Baden-Baden",
    "Wien",
    "Zürich",
    "Paris",
    "Lyon",
    "Bruxelles",
    "Milano",
    "Roma",
    "Torino",
    "Napoli",
    "Padova",
    "Bologna",
    "Firenze",
    "London",
    "New York",
    "Boston",
    "Chicago"
  ]);
  var ISSUE = /^(?:n°|n\.|No\.)\s*(?<issue>\d+)$/;
  var YEAR2 = /^(?:(?<before>.*?)\s+)?(?<year>\d{4})\.?$/;
  var WORD = String.raw`(?:[A-ZÀ-Þ][\p{L}'’.\-]*|von|van|de|der|da|di|du|zu|le|la)`;
  var INVERTED = new RegExp(String.raw`^(?<family>${WORD}(?:\s+${WORD})*),\s*(?<given>${WORD}(?:\s+${WORD})*)$`, "u");
  var CAPS = /^(?<family>[A-ZÀ-Þ'’-]{2,})\s*\((?<given>[^)]+)\)$/u;
  var INITIALS_AFTER = /^(?<family>[A-ZÀ-Þ][\p{L}'’-]+)\s+(?<given>(?:[A-Z]\.\s*)+)$/u;
  var ET_AL = /\s*(?:et al\.?|u\.\s?a\.|e altri|and others)$/;
  var ROLE = /\s*\(?(?<role>Hrsg\.|dir\.|a cura di|eds?\.)\)?$/;
  var JOINERS = /\s*(?:&|\/|;|(?<!\p{L})(?:and|et|und|e)(?!\p{L}))\s*/u;
  var titleCase = (s) => s.replace(/\p{L}+/gu, (w) => w[0] + w.slice(1).toLowerCase());
  function person(name) {
    name = name.trim();
    for (const pattern of [INVERTED, CAPS, INITIALS_AFTER]) {
      const g = name.match(pattern)?.groups;
      if (g) return `${g.given.trim()} ${g.family === g.family.toUpperCase() ? titleCase(g.family) : g.family}`;
    }
    return name;
  }
  function people(text, lex) {
    const fields = {};
    const etAl = text.match(ET_AL);
    if (etAl) [text, fields.et_al] = [text.slice(0, etAl.index), true];
    const role = text.match(ROLE);
    if (role) [text, fields.role] = [text.slice(0, role.index), lex.role.replace("{}", role.groups.role)];
    return { authors: text.split(JOINERS).filter((p) => p.trim()).map(person), ...fields };
  }
  function splitAuthor(text) {
    let g = text.match(/^(?<author>[^:,]+,[^:,]+(?:\/[^:,]+,[^:,]+)*):\s+(?<rest>.+)$/)?.groups;
    if (g && g.author.split("/").every((p) => INVERTED.test(p.trim()))) return [g.author.replace(/\//g, " / "), g.rest];
    g = text.match(/^(?<author>[^,]+?),\s+(?<rest>.+)$/)?.groups;
    return g ? [g.author, g.rest] : null;
  }
  var OSCOLA2 = /\s*\((?:(?<edition>\d+\w*)\s+edn?,\s*)?(?<publisher>[^()\d][^()]*?)\s+(?<year>\d{4})\)\s*(?<pages>[\d–-]+)?\.?$/;
  var BLUEBOOK_BOOK = /\s+(?<pages>\d+(?:[–-]\d+)?)?\s*\((?:(?<edition>\d+\w*)\s+ed\.\s+)?(?<year>\d{4})\)\.?$/;
  function plain(text) {
    for (const pattern of [OSCOLA2, BLUEBOOK_BOOK]) {
      const m = text.match(pattern);
      if (!m) continue;
      const d = m.groups;
      const parts = [d.edition && `${d.edition} ed.`, d.publisher, d.year, d.pages && `p. ${d.pages}`];
      return [text.slice(0, m.index), ...parts.filter(Boolean)].join(", ");
    }
    return text;
  }
  function classify(parts, lex) {
    const fields = {}, left = [];
    for (let part of parts) {
      const m = [lex.edition, lex.locator, lex.volume, ISSUE].map((p) => part.match(p)).find(Boolean);
      if (m) {
        Object.assign(fields, groups(m));
        continue;
      }
      const year2 = part.match(YEAR2)?.groups;
      if (year2) [fields.year, part] = [year2.year, year2.before ?? ""];
      if (part && !CITIES.has(part)) left.push(part);
    }
    if (lex === GERMAN && fields.volume) fields.volume = `Band ${fields.volume}`;
    return [fields, left];
  }
  var GERMAN_ARTICLE = /^(?<title>.+?),\s*(?<journal>[^,]+?)\s+(?<volume>\d+)\s+\((?<year>\d{4})\),\s*(?<pages>.+?)\.?$/;
  var GUILLEMETS = /^«\s*(?<title>.+?)\s*»\s*,?\s*(?<rest>.*)$/;
  var inCollection = (part) => part.startsWith("in ");
  var european = (text) => {
    if (!/[A-Za-z]/.test(text) || !/\d{4}/.test(text)) return null;
    const lex = LEXICONS.find((l) => l.marker.test(text));
    text = text.trim().replace(/\.+$/, "");
    const split = splitAuthor(lex === ENGLISH ? plain(text) : text);
    if (!split) return null;
    const [author2, rest] = split, who = people(author2, lex);
    const article2 = lex === GERMAN ? rest.match(GERMAN_ARTICLE) : null;
    if (article2) return { type: "de_article", ...who, ...groups(article2) };
    const quoted = rest.match(GUILLEMETS)?.groups;
    const [title2, ...parts] = quoted ? [quoted.title, ...quoted.rest.split(/,\s+/)] : rest.split(/,\s+/);
    const kind = quoted || lex === ITALIAN && parts.some(inCollection) ? "article" : "book";
    if (kind === "book" && [title2, ...parts].some(inCollection)) return null;
    const [fields, left] = classify(parts, lex);
    if (kind === "article") {
      return left.length ? { type: `${lex.lang}_article`, ...who, title: title2, journal: left[0].replace(/^in /, "").trim(), ...fields } : null;
    }
    return { type: `${lex.lang}_book`, ...who, title: [title2, ...left.slice(0, -1)].join(", "), ...fields, publisher: left.at(-1) ?? null };
  };
  var parsers5 = [european];

  // src/parse/zh.ts
  var NUMERAL = "[\\d一二三四五六七八九十百千零〇两]+";
  var STATUTE = new RegExp(`^《?(?<name>[^《》\\s第]+?(?:法典|法|条例|规定|办法|解释))》?\\s*第(?<article>${NUMERAL})条(?<article_suffix>之[一二三四五六七八九十]+)?(?:第(?<paragraph>${NUMERAL})款)?(?:第[（(]?(?<item>${NUMERAL})[）)]?项)?$`);
  var DOCUMENT = /^《?(?<name>.+?)》?[\s，,]*[（(]?(?<doc_no>[一-龥]+[(（[【［〔]\d{4}[)）\]】］〕]\d+号)[）)]?$/;
  var statute = (text) => matched(STATUTE, text, "statute");
  var document2 = (text) => {
    const fields = matched(DOCUMENT, text, "normative");
    return fields && String(fields.name).length >= 4 ? fields : null;
  };
  var ISSUER = /^[^《》，,。；;：:\s]{2,60}?(?:院|部|局|委|会|厅|组|中央|政府|办公室|办|署|室|党委|省委|市委|司|处)$/;
  var DOC_NO = /^(?:[一-龥]+〔\d{4}〕\d+号|[一-龥]*令第\d+号|[A-Z]{2,}-\d+[A-Z\d-]*)$/;
  var LAW_NAME = /(?:法典|法|条例|规定|办法|规则|细则|解释|修正案(?:（[^）]+）)?)(?:（(?:试行|草案)）)?$/;
  var BARE_LAW = /^((?:中华人民共和国)?[^《》（(，,。；;：:\s第]{1,40}?(?:法典|法|条例|修正案（[^）]+）))(?=[（(]\d{4}年|第\s*[\d一二三四五六七八九十百千]+\s*条)/;
  var ALIAS = /^(?:以下简称|下称|简称)[「“"](?<alias>[^」”"]+)[」”"]$/;
  var DATE = /(?<year>\d{4})年(?:(?<month>\d{1,2})月(?:(?<day>\d{1,2})日)?)?/;
  var EVENT = /(通过|公布|发布|印发|施行|成文|批准)(?:并施行)?$/;
  function place(part, found, dates) {
    part = part.trim();
    const number = docNumber(part);
    if (DOC_NO.test(number)) return Boolean(found.doc_no = number);
    const alias = part.match(ALIAS);
    if (alias) return Boolean(found.alias = alias.groups.alias);
    if (/(?:废止|失效)$/.test(part)) return Boolean(found.repealed = true);
    const amended = part.match(/(修订|修正)$/);
    if (amended && DATE.test(part)) {
      const year2 = Math.max(...[...part.matchAll(/(\d{4})年/g)].map((m) => Number(m[1])));
      if (!found.version || Number(found.version.slice(0, 4)) <= year2) found.version = `${year2}年${amended[1]}`;
      return true;
    }
    const when = part.match(DATE);
    if (when && (EVENT.test(part) || when[0] === part)) {
      const { year: year2, month, day } = when.groups;
      const rank = /公布|发布|印发/.test(part) ? 0 : when[0] === part ? 1 : 2;
      dates.push([rank * 10 + (day ? 0 : month ? 1 : 2), { year: year2, month, day }, part.match(EVENT)?.[1] ?? ""]);
      if (when[0] === part && !month) found.year = year2;
      return true;
    }
    return false;
  }
  var provisionText = (text) => text.replace(/第[（(]?([一二三四五六七八九十百千零〇两\d]+)[）)]?(条|款|项|目)/g, (_, n, unit) => `第${toInt(n)}${unit}`);
  var legal = (text) => {
    text = text.replace(/[。.]\s*$/, "");
    const open = text.indexOf("《");
    if (open < 0) {
      const bare = text.match(BARE_LAW);
      return bare ? legal(`《${bare[1]}》${text.slice(bare[1].length)}`) : null;
    }
    const before = text.slice(0, open).replace(/\s*[：:]\s*$/, "").trim();
    if (before && !ISSUER.test(before)) return null;
    const end = closing(text, open);
    if (end < 0) return null;
    const name = text.slice(open + 1, end - 1);
    let rest = text.slice(end).trim();
    const found = { unused: [] }, dates = [];
    if (/^[（(]/.test(rest)) {
      const close = closing(rest, 0);
      if (close < 0) return null;
      for (const { part } of splitTop(rest.slice(1, close - 1), "，,；;")) if (!place(part, found, dates)) found.unused.push(part.trim());
      rest = rest.slice(close).trim();
    }
    while (/^[，,]/.test(rest)) {
      const [{ part }] = splitTop(rest.slice(1), "，,");
      if (!place(part, found, dates)) break;
      rest = rest.slice(1 + part.length).trim();
    }
    const where = rest.match(/^[，,]?\s*(第(?:[^，,。；;：:（(]|[（(][一二三四五六七八九十\d]+[）)])+)$/);
    if (rest && !where) return null;
    const locator4 = where ? provisionText(where[1].trim()) : null;
    const [, date2, event] = dates.sort((a, b) => a[0] - b[0])[0] ?? [];
    const site = found.unused.find((p) => /^载.+(?:网站|网)$/.test(p));
    if (site && date2) {
      const unused = found.unused.filter((p) => p !== site);
      return compact({ type: "web", title: name, site: site.slice(1).replace(/^该(?:部|局|委|院|会|厅|署)/, before), date: date2, unused });
    }
    const statute2 = !/关[于於]/.test(name) && LAW_NAME.test(name) && !(found.doc_no && !found.doc_no.includes("令"));
    if (statute2) {
      const version = found.version ?? (found.year && dates.length === 1 && !found.doc_no ? `${found.year}年` : void 0);
      return compact({ type: "statute", name, issuer: before, version, repealed: found.repealed, locator: locator4, alias: found.alias, doc_no: found.doc_no, unused: found.unused });
    }
    return compact({
      type: "normative",
      name,
      issuer: before,
      doc_no: found.doc_no,
      date: date2,
      date_event: event === "通过" ? event : null,
      repealed: found.repealed,
      locator: locator4,
      alias: found.alias,
      unused: found.unused
    });
  };
  var WEB_NOTE = /^(?:(?<authors>[^《》：:，,]{2,30})[：:])?《(?<title>.+)》[，,]\s*(?<site>[^，,《》]+?(?:网站|网|官网))[，,]?\s*(?<date>\d{4}年\d{1,2}月\d{1,2}日)(?:[，,]\s*(?<url>https?:\/\/\S+))?$/;
  var webNote = (text) => {
    const m = text.match(WEB_NOTE);
    if (!m) return null;
    const { authors: authors9, date: when, ...fields } = groups(m);
    return { type: "web", ...fields, ...authors9 ? { authors: [String(authors9)] } : {}, date: date(String(when)) };
  };
  var CASE_NAME = /(?<name>[^，,。：:；;\s]+?案)(?=[，,。：:；;\s（(]|$)/;
  var CASE_NO = /[（(〔[](?<year>\d{4})[）)〕\]]\s*(?<case_no>[^号，,。\s]+?)\s*号/;
  var COURT = /(?<court>[一-龥]+?法院)/;
  var DOC_TYPE = /(?<doc_type>(?:民事|刑事|行政|执行|国家赔偿|赔偿)(?:判决书|裁定书|调解书|决定书))/;
  var JUDGED = /\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日/;
  var caseOf = (text, type, fields) => ({ type, name: search(CASE_NAME, text, "name"), ...compact(fields) });
  var caseLibrary = (text) => {
    const number = text.includes("案例库") && text.match(/\d{4}-\d{2}-\d-\d{3}-\d{3}/);
    return number ? caseOf(text, "case_library", { library_no: number[0] }) : null;
  };
  var caseGuiding = (text) => {
    const m = text.match(/指导(?:性)?案例\s*(?:第\s*)?(?<number>\d+)\s*号/);
    if (!m) return null;
    return { ...caseOf(text, "case_guiding", { number: m.groups.number }), year: search(/(?<year>\d{4})\s*年?/, cut(text, m), "year") };
  };
  var caseGazette = (text) => {
    const m = text.match(/《?(?<gazette>[^《》\s，,、]*公报)》?\s*[,，]?\s*(?<year>\d{4})\s*(?:年\s*第?|[-—/.]|[（(])\s*(?<issue>\d{1,2})\s*[期）)]?/);
    return m && caseOf(text, "case_gazette", groups(m));
  };
  var judgment = (text) => {
    const number = text.match(CASE_NO), name = text.match(CASE_NAME);
    const rest = name ? text.slice(name.index + name[0].length) : text;
    const court = search(COURT, rest, "court");
    if (!(number || name && court)) return null;
    const judged = rest.match(JUDGED);
    return caseOf(text, "case", {
      court,
      year: number?.groups.year ?? search(/(?<year>\d{4})\s*年/, rest, "year"),
      case_no: number?.groups.case_no,
      doc_type: search(DOC_TYPE, rest, "doc_type"),
      date: judged && date(judged[0])
    });
  };
  var NOTE = {
    author: /^\s*(?:[[［【（(](?<nationality>[^\]］】）)]{1,4})[\]］】）)])?\s*(?<names>.*?)\s*(?:著|撰)?\s*[：:，,]?\s*$/,
    inJournal: /(?<year>\d{4})\s*(?:年\s*第\s*(?<issue>\d+)\s*期|[（(]\s*(?<issue2>\d+)\s*[）)])/,
    inBook: /载\s*(?:(?<editors>[^《》：:，,]+?)(?<editor_role>主编|编著|编译|编)\s*[：:]?\s*)?《/,
    edition: /[（(]?第\s*(?<edition>\d+)\s*版[）)]?|[（(]?(?<edition_name>修订版|增订版)[）)]?/,
    volume: /第[\d一二三四五六七八九十]+[卷册辑](?:第[\d一二三四五六七八九十]+[卷册辑分册]+)?/,
    translators: /(?<translators>[^，,。\s》《]+?)\s*译(?![者本文林])/,
    publisher: /(?<publisher>[^，,。\s》《\d]+?(?:出版社|书局|印书馆|书店|出版公司))/,
    year: /(?<!\d)(?<year>1[89]\d{2}|20\d{2})(?!\d|\s*页|\s*[-–—~～]\s*\d)/,
    pages: /第?\s*(?<pages>\d+(?:\s*[-–—~～]\s*\d+)?)\s*页(?<more>以下)?/
  };
  var pagesOf = (text) => {
    const m = text.match(NOTE.pages);
    return m ? m.groups.pages + (m.groups.more ?? "") : null;
  };
  var imprint = (text) => ({
    volume: search(NOTE.volume, text, 0),
    publisher: search(NOTE.publisher, text, "publisher"),
    year: search(NOTE.year, text, "year")
  });
  var note = (text) => {
    const titles = [...text.matchAll(/《([^《》]+)》/g)].map((m) => m[1]);
    if (!titles.length) return null;
    const head2 = text.slice(0, text.indexOf("《")), tail = text.slice(text.indexOf("》") + 1);
    const author2 = head2.match(NOTE.author).groups;
    const fields = {
      title: titles[0],
      authors: author2.names.split(/[、，,]/).map((s) => s.trim()).filter(Boolean),
      nationality: author2.nationality,
      pages: pagesOf(tail)
    };
    const journal = tail.match(NOTE.inJournal), host = tail.match(NOTE.inBook);
    if (titles.length > 1 && journal) {
      const { year: year2, issue, issue2 } = journal.groups;
      Object.assign(fields, { type: "article", journal: titles[1], year: year2, issue: issue ?? issue2 });
    } else if (titles.length > 1 && host) {
      Object.assign(fields, {
        type: "chapter",
        book_title: titles[1],
        editors: host.groups.editors,
        editor_role: host.groups.editor_role,
        translators: search(NOTE.translators, tail.slice(0, host.index), "translators"),
        ...imprint(tail.slice(host.index + host[0].length))
      });
    } else {
      const edition3 = tail.match(NOTE.edition)?.groups;
      Object.assign(fields, {
        type: "book",
        edition: edition3 && (edition3.edition ?? edition3.edition_name),
        translators: search(NOTE.translators, tail, "translators"),
        ...imprint(tail)
      });
    }
    return compact(fields);
  };
  var parsers6 = [statute, document2, legal, webNote, caseLibrary, caseGuiding, caseGazette, judgment, note];

  // src/parse/index.ts
  var PARSERS = [...parsers2, ...parsers3, ...parsers4, ...parsers6, ...parsers, ...parsers5];
  function parse(text) {
    text = text.trim();
    for (const recognise of PARSERS) {
      const fields = recognise(text);
      if (fields) return fields;
    }
    throw new ParseError("无法识别这条原文的格式，请改用“逐项填写”。");
  }

  // src/cmlc.ts
  function cite(fields) {
    if (fields.unverified) throw new UnverifiedSourceError("未经核实的文献不得引用（第2条）。请先找到原文，核对作者、篇名和出处后再转换。");
    const render = STYLES[String(fields.type)];
    if (!render) throw new Error(`未知的文献类型：${fields.type}。可用类型：${Object.keys(STYLES).join(", ")}`);
    const entry = new Entry(fields);
    return { text: render(entry), missing: entry.missing, type: String(fields.type) };
  }

  // src/hant.ts
  var HANT_PAIRS = "㑯㑔㑳㑇㑶㐹㓨刾㘚㘎㜄㚯㜏㛣㠏㟆㥮㤘㩜㨫㩳㧐㩵擜䁻䀥䃮鿎䊷䌶䋙䌺䋚䌻䋹䌿䋻䌾䍦䍠䎱䎬䙡䙌䜀䜧䝼䞍䥇䦂䥑鿏䥱䥾䦛䦶䦟䦷䯀䯅䰾鲃䱷䲣䱽䲝䲁鳚䲘鳤䴉鹮丟丢並并么幺亂乱亙亘亞亚佇伫佈布佔占併并來来侖仑侶侣侷局俁俣係系俔伣俠侠俥伡俬私倀伥倆俩倈俫倉仓個个們们倖幸倫伦倲㑈偉伟偑㐽側侧偵侦偽伪傌㐷傑杰傖伧傘伞備备傢家傭佣傯偬傳传傴伛債债傷伤傾倾僂偻僅仅僉佥僑侨僕仆僞伪僥侥僨偾僱雇價价儀仪儁俊儂侬億亿儈侩儉俭儎傤儐傧儔俦儕侪儘尽償偿優优儲储儷俪儸㑩儺傩儻傥儼俨兇凶兌兑兒儿兗兖內内兩两冊册冑胄冪幂凈净凍冻凜凛凱凯別别刪删剄刭則则剎刹剗刬剛刚剝剥剮剐剴剀創创剷铲劃划劇剧劉刘劊刽劌刿劍剑劏㓥劑剂劚㔉勁劲動动務务勛勋勝胜勞劳勢势勩勚勱劢勳勋勵励勸劝勻匀匭匦匯汇匱匮區区協协卹恤卻却卽即厙厍厠厕厤历厭厌厲厉厴厣參参叄叁叢丛吒咤吳吴吶呐呂吕咼呙員员唄呗唸念問问啓启啞哑啟启啢唡喎㖞喚唤喪丧喫吃喬乔單单喲哟嗆呛嗇啬嗊唝嗎吗嗚呜嗩唢嗶哔嘆叹嘍喽嘓啯嘔呕嘖啧嘗尝嘜唛嘩哗嘮唠嘯啸嘰叽嘵哓嘸呒嘽啴噁恶噓嘘噚㖊噝咝噠哒噥哝噦哕噯嗳噲哙噴喷噸吨噹当嚀咛嚇吓嚌哜嚐尝嚕噜嚙啮嚥咽嚦呖嚨咙嚮向嚲亸嚳喾嚴严嚶嘤囀啭囁嗫囂嚣囅冁囈呓囉啰囌苏囑嘱囪囱圇囵國国圍围園园圓圆圖图團团垻坝埡垭埰采執执堅坚堊垩堖垴堝埚堯尧報报場场塊块塋茔塏垲塒埘塗涂塚冢塢坞塤埙塵尘塹堑墊垫墜坠墮堕墰坛墳坟墶垯墻墙墾垦壇坛壋垱壎埙壓压壘垒壙圹壚垆壜坛壞坏壟垄壠垅壢坜壩坝壪塆壯壮壺壶壼壸壽寿夠够夢梦夾夹奐奂奧奥奩奁奪夺奬奖奮奋奼姹妝妆姍姗姦奸娛娱婁娄婦妇婭娅媧娲媯妫媰㛀媼媪媽妈嫋袅嫗妪嫵妩嫺娴嫻娴嫿婳嬀妫嬃媭嬈娆嬋婵嬌娇嬙嫱嬡嫒嬤嬷嬪嫔嬰婴嬸婶孃娘孋㛤孌娈孫孙學学孿孪宮宫寀采寢寝實实寧宁審审寫写寬宽寵宠寶宝將将專专尋寻對对導导尷尴屆届屍尸屓屃屜屉屢屡層层屨屦屬属岡冈峯峰峴岘島岛峽峡崍崃崑昆崗岗崙仑崢峥崬岽嵐岚嵗岁嵾㟥嶁嵝嶄崭嶇岖嶔嵚嶗崂嶠峤嶢峣嶧峄嶨峃嶮崄嶸嵘嶺岭嶼屿嶽岳巋岿巒峦巔巅巖岩巰巯巹卺帥帅師师帳帐帶带幀帧幃帏幓㡎幗帼幘帻幟帜幣币幫帮幬帱幹干幾几庫库廁厕廂厢廄厩廈厦廎庼廕荫廚厨廝厮廟庙廠厂廡庑廢废廣广廩廪廬庐廳厅弒弑弔吊弳弪張张強强彆别彈弹彌弥彎弯彔录彙汇彠彟彥彦彫雕彲彨彿佛後后徑径從从徠徕復复徹彻恆恒恥耻悅悦悞悮悵怅悶闷悽凄惡恶惱恼惲恽惻恻愛爱愜惬愨悫愴怆愷恺愾忾慄栗態态慍愠慘惨慚惭慟恸慣惯慤悫慪怄慫怂慮虑慳悭慶庆慺㥪慼戚慾欲憂忧憊惫憐怜憑凭憒愦憖慭憚惮憤愤憫悯憮怃憲宪憶忆懇恳應应懌怿懍懔懞蒙懟怼懣懑懤㤽懨恹懲惩懶懒懷怀懸悬懺忏懼惧懾慑戀恋戇戆戔戋戧戗戩戬戰战戱戯戲戏戶户抬擡拋抛挩捝挱挲挾挟捨舍捫扪捱挨捲卷掃扫掄抡掆㧏掗挜掙挣掛挂採采揀拣揚扬換换揮挥揯搄損损搖摇搗捣搵揾搶抢摑掴摜掼摟搂摯挚摳抠摶抟摺折摻掺撈捞撏挦撐撑撓挠撝㧑撟挢撣掸撥拨撫抚撲扑撳揿撻挞撾挝撿捡擁拥擄掳擇择擊击擋挡擓㧟擔担據据擠挤擣捣擬拟擯摈擰拧擱搁擲掷擴扩擷撷擺摆擻擞擼撸擽㧰擾扰攄摅攆撵攏拢攔拦攖撄攙搀攛撺攜携攝摄攢攒攣挛攤摊攪搅攬揽敍叙敎教敓敚敗败敘叙敵敌數数斂敛斃毙斆敩斕斓斬斩斷断旂旗旣既昇升時时晉晋晝昼暈晕暉晖暘旸暢畅暫暂曄晔曆历曇昙曉晓曏向曖暧曠旷曨昽曬晒書书會会朧胧朮术東东枱台枴拐柵栅柺拐査查桿杆梔栀梘枧條条梟枭梲棁棄弃棊棋棖枨棗枣棟栋棡㭎棧栈棲栖棶梾椏桠椲㭏楊杨楓枫楨桢業业極极榘矩榦干榪杩榮荣榲榅榿桤構构槍枪槓杠槤梿槧椠槨椁槮椮槳桨槶椢槼椝樁桩樂乐樅枞樑梁樓楼標标樞枢樢㭤樣样樧榝樫㭴樳桪樸朴樹树樺桦樿椫橈桡橋桥機机橢椭橫横檁檩檉柽檔档檜桧檟槚檢检檣樯檮梼檯台檳槟檸柠檻槛櫃柜櫓橹櫚榈櫛栉櫝椟櫞橼櫟栎櫥橱櫧槠櫨栌櫪枥櫫橥櫬榇櫱蘖櫳栊櫸榉櫻樱欄栏欅榉權权欏椤欒栾欖榄欞棂欽钦歎叹歐欧歟欤歡欢歲岁歷历歸归歿殁殘残殞殒殤殇殨㱮殫殚殭僵殮殓殯殡殰㱩殲歼殺杀殻壳殼壳毀毁毆殴毿毵氂牦氈毡氌氇氣气氫氢氬氩氳氲氾泛汎泛汙污決决沒没沖冲況况泝溯洩泄洶汹浹浃涇泾涗涚涼凉淒凄淚泪淥渌淨净淩凌淪沦淵渊淶涞淺浅渙涣減减渢沨渦涡測测渾浑湊凑湞浈湧涌湯汤溈沩準准溝沟溫温溮浉溳涢溼湿滄沧滅灭滌涤滎荥滙汇滬沪滯滞滲渗滷卤滸浒滻浐滾滚滿满漁渔漊溇漚沤漢汉漣涟漬渍漲涨漵溆漸渐漿浆潀潨潁颍潑泼潔洁潙沩潚㴋潛潜潤润潯浔潰溃潷滗潿涠澀涩澆浇澇涝澐沄澗涧澠渑澤泽澦滪澩泶澮浍澱淀澾㳠濁浊濃浓濄㳡濕湿濘泞濚溁濛蒙濜浕濟济濤涛濧㳔濫滥濰潍濱滨濺溅濼泺濾滤瀂澛瀅滢瀆渎瀇㲿瀉泻瀋沈瀏浏瀕濒瀘泸瀝沥瀟潇瀠潆瀦潴瀧泷瀨濑瀰弥瀲潋瀾澜灃沣灄滠灑洒灕漓灘滩灝灏灡㳕灣湾灤滦灧滟灩滟災灾為为烏乌烴烃無无煉炼煒炜煙烟煢茕煥焕煩烦煬炀煱㶽熅煴熒荧熗炝熱热熲颎熾炽燁烨燈灯燉炖燒烧燙烫燜焖營营燦灿燬毁燭烛燴烩燶㶶燻熏燼烬燾焘爍烁爐炉爛烂爭争爲为爺爷爾尔牀床牆墙牘牍牽牵犖荦犛牦犢犊犧牺狀状狹狭狽狈猙狰猶犹猻狲獁犸獃呆獄狱獅狮獎奖獨独獪狯獫猃獮狝獰狞獱㺍獲获獵猎獷犷獸兽獺獭獻献獼猕玀猡現现琱雕琺珐琿珲瑋玮瑒玚瑣琐瑤瑶瑩莹瑪玛瑲玱璉琏璡琎璣玑璦瑷璫珰璯㻅環环璵玙璸瑸璽玺璿璇瓊琼瓏珑瓔璎瓚瓒甌瓯甕瓮產产産产甦苏甯宁畝亩畢毕畫画異异畵画當当疇畴疊叠痙痉痠酸痺痹痾疴瘂痖瘋疯瘍疡瘓痪瘞瘗瘡疮瘧疟瘮瘆瘲疭瘺瘘瘻瘘療疗癆痨癇痫癉瘅癒愈癘疠癟瘪癡痴癢痒癤疖癥症癧疬癩癞癬癣癭瘿癮瘾癰痈癱瘫癲癫發发皁皂皚皑皰疱皸皲皺皱盃杯盜盗盞盏盡尽監监盤盘盧卢盪荡眞真眥眦眾众睏困睜睁睞睐睪睾瞘眍瞜䁖瞞瞒瞶瞆瞼睑矇蒙矓眬矚瞩矯矫硃朱硜硁硤硖硨砗硯砚碕埼碩硕碭砀碸砜確确碼码碽䂵磑硙磚砖磠硵磣碜磧碛磯矶磽硗磾䃅礄硚礆硷礎础礙碍礦矿礪砺礫砾礬矾礱砻祕秘祿禄禍祸禎祯禕祎禡祃禦御禪禅禮礼禰祢禱祷禿秃秈籼稅税稈秆稏䅉稜棱稟禀種种稱称穀谷穇䅟穌稣積积穎颖穠秾穡穑穢秽穩稳穫获穭穞窩窝窪洼窮穷窯窑窵窎窶窭窺窥竄窜竅窍竇窦竈灶竊窃竪竖競竞筆笔筍笋筧笕筴䇲箇个箋笺箏筝節节範范築筑篋箧篔筼篠筿篤笃篩筛篳筚簀箦簍篓簑蓑簞箪簡简簣篑簫箫簷檐簹筜簽签簾帘籃篮籌筹籔䉤籙箓籛篯籜箨籟籁籠笼籤签籩笾籪簖籬篱籮箩籲吁粧妆粵粤糉粽糝糁糞粪糧粮糭粽糰团糲粝糴籴糶粜糹纟糾纠紀纪紂纣約约紅红紆纡紇纥紈纨紉纫紋纹納纳紐纽紓纾純纯紕纰紖纼紗纱紘纮紙纸級级紛纷紜纭紝纴紡纺紬䌷紮扎細细紱绂紲绁紳绅紵纻紹绍紺绀紼绋紿绐絀绌終终絃弦組组絅䌹絆绊絎绗結结絕绝絛绦絝绔絞绞絡络絢绚給给絨绒絰绖統统絲丝絳绛絶绝絹绢綁绑綃绡綆绠綈绨綉绣綌绤綏绥綐䌼綑捆經经綜综綞缍綠绿綢绸綣绻綫线綬绶維维綯绹綰绾綱纲網网綳绷綴缀綵彩綸纶綹绺綺绮綻绽綽绰綾绫綿绵緄绲緇缁緊紧緋绯緑绿緒绪緓绬緔绱緗缃緘缄緙缂線线緝缉緞缎締缔緡缗緣缘緦缌編编緩缓緬缅緯纬緱缑緲缈練练緶缏緹缇緻致緼缊縈萦縉缙縊缢縋缒縐绉縑缣縕缊縗缞縛缚縝缜縞缟縟缛縣县縧绦縫缝縭缡縮缩縱纵縲缧縳䌸縴纤縵缦縶絷縷缕縹缥總总績绩繃绷繅缫繆缪繒缯織织繕缮繚缭繞绕繡绣繢缋繩绳繪绘繫系繭茧繮缰繯缳繰缲繳缴繸䍁繹绎繼继繽缤繾缱繿䍀纇颣纈缬纊纩續续纍累纏缠纓缨纔才纖纤纘缵纜缆缽钵罃䓨罈坛罌罂罎坛罰罚罵骂罷罢羅罗羆罴羈羁羋芈羣群羥羟羨羡義义羶膻習习翫玩翬翚翹翘翽翙耬耧耮耢聖圣聞闻聯联聰聪聲声聳耸聵聩聶聂職职聹聍聽听聾聋肅肃脅胁脈脉脛胫脣唇脩修脫脱脹胀腎肾腖胨腡脶腦脑腫肿腳脚腸肠膃腽膕腘膚肤膞䏝膠胶膩腻膽胆膾脍膿脓臉脸臍脐臏膑臘腊臚胪臟脏臠脔臢臜臥卧臨临臺台與与興兴舉举舊旧舘馆艙舱艤舣艦舰艫舻艱艰艷艳芻刍苧苎茲兹荊荆莊庄莖茎莢荚莧苋華华菴庵菸烟萇苌萊莱萬万萴荝萵莴葉叶葒荭葤荮葦苇葯药葷荤蒍蔿蒐搜蒓莼蒔莳蒕蒀蒞莅蒼苍蓀荪蓆席蓋盖蓮莲蓯苁蓴莼蓽荜蔔卜蔘参蔞蒌蔣蒋蔥葱蔦茑蔭荫蕁荨蕆蒇蕎荞蕒荬蕓芸蕕莸蕘荛蕢蒉蕩荡蕪芜蕭萧蕷蓣薀蕰薈荟薊蓟薌芗薑姜薔蔷薘荙薟莶薦荐薩萨薳䓕薴苧薵䓓薺荠藍蓝藎荩藝艺藥药藪薮藭䓖藴蕴藶苈藹蔼藺蔺蘀萚蘄蕲蘆芦蘇苏蘊蕴蘋苹蘚藓蘞蔹蘢茏蘭兰蘺蓠蘿萝虆蔂處处虛虚虜虏號号虧亏虯虬蛺蛱蛻蜕蜆蚬蝕蚀蝟猬蝦虾蝨虱蝸蜗螄蛳螞蚂螢萤螮䗖螻蝼螿螀蟄蛰蟈蝈蟎螨蟣虮蟬蝉蟯蛲蟲虫蟶蛏蟻蚁蠁蚃蠅蝇蠆虿蠍蝎蠐蛴蠑蝾蠔蚝蠟蜡蠣蛎蠨蟏蠱蛊蠶蚕蠻蛮衆众衊蔑術术衕同衚胡衛卫衝冲衞卫衹只袞衮裊袅裏里補补裝装裡里製制複复褌裈褘袆褲裤褳裢褸褛褻亵襇裥襉裥襏袯襖袄襝裣襠裆襤褴襪袜襬摆襯衬襲袭襴襕覈核見见覎觃規规覓觅視视覘觇覡觋覥觍覦觎親亲覬觊覯觏覲觐覷觑覺觉覽览覿觌觀观觴觞觶觯觸触訁讠訂订訃讣計计訊讯訌讧討讨訐讦訒讱訓训訕讪訖讫託托記记訛讹訝讶訟讼訢䜣訣诀訥讷訩讻訪访設设許许訴诉訶诃診诊註注証证詁诂詆诋詎讵詐诈詒诒詔诏評评詖诐詗诇詘诎詛诅詞词詠咏詡诩詢询詣诣試试詩诗詫诧詬诟詭诡詮诠詰诘話话該该詳详詵诜詼诙詿诖誄诔誅诛誆诓誇夸誌志認认誑诳誒诶誕诞誘诱誚诮語语誠诚誡诫誣诬誤误誥诰誦诵誨诲說说説说誰谁課课誶谇誹诽誼谊誾訚調调諂谄諄谆談谈諉诿請请諍诤諏诹諑诼諒谅論论諗谂諛谀諜谍諝谞諞谝諡谥諢诨諤谔諦谛諧谐諫谏諭谕諮咨諱讳諳谙諶谌諷讽諸诸諺谚諼谖諾诺謀谋謁谒謂谓謄誊謅诌謊谎謎谜謐谧謔谑謖谡謗谤謙谦謚谥講讲謝谢謠谣謡谣謨谟謫谪謬谬謭谫謳讴謹谨謾谩譁哗證证譎谲譏讥譖谮識识譙谯譚谭譜谱譟噪譫谵譭毁譯译議议譴谴護护譸诪譽誉譾谫讀读讅谉變变讋詟讌䜩讎雠讒谗讓让讕谰讖谶讚赞讜谠讞谳豈岂豎竖豐丰豔艳豬猪豶豮貓猫貙䝙貝贝貞贞貟贠負负財财貢贡貧贫貨货販贩貪贪貫贯責责貯贮貰贳貲赀貳贰貴贵貶贬買买貸贷貺贶費费貼贴貽贻貿贸賀贺賁贲賂赂賃赁賄贿賅赅資资賈贾賊贼賑赈賒赊賓宾賕赇賙赒賚赉賜赐賞赏賠赔賡赓賢贤賣卖賤贱賦赋賧赕質质賫赍賬账賭赌賰䞐賴赖賵赗賺赚賻赙購购賽赛賾赜贄贽贅赘贇赟贈赠贊赞贋赝贍赡贏赢贐赆贓赃贔赑贖赎贗赝贛赣贜赃赬赪趕赶趙赵趨趋趲趱跡迹踐践踰逾踴踊蹌跄蹕跸蹟迹蹠跖蹣蹒蹤踪蹺跷躂跶躉趸躊踌躋跻躍跃躎䟢躑踯躒跞躓踬躕蹰躚跹躡蹑躥蹿躦躜躪躏軀躯車车軋轧軌轨軍军軑轪軒轩軔轫軛轭軟软軤轷軫轸軲轱軸轴軹轵軺轺軻轲軼轶軾轼較较輅辂輇辁輈辀載载輊轾輒辄輓挽輔辅輕轻輛辆輜辎輝辉輞辋輟辍輥辊輦辇輩辈輪轮輬辌輯辑輳辏輸输輻辐輼辒輾辗輿舆轀辒轂毂轄辖轅辕轆辘轉转轍辙轎轿轔辚轟轰轡辔轢轹轤轳辦办辭辞辮辫辯辩農农迴回逕迳這这連连週周進进遊游運运過过達达違违遙遥遜逊遞递遠远遡溯適适遲迟遷迁選选遺遗遼辽邁迈還还邇迩邊边邏逻邐逦郟郏郵邮鄆郓鄉乡鄒邹鄔邬鄖郧鄧邓鄭郑鄰邻鄲郸鄴邺鄶郐鄺邝酇酂酈郦醃腌醖酝醜丑醞酝醟蒏醣糖醫医醬酱醱酦釀酿釁衅釃酾釅酽釋释釐厘釒钅釓钆釔钇釕钌釗钊釘钉釙钋針针釣钓釤钐釦扣釧钏釩钒釵钗釷钍釹钕釺钎釾䥺鈀钯鈁钫鈃钘鈄钭鈅钥鈈钚鈉钠鈍钝鈎钩鈐钤鈑钣鈒钑鈔钞鈕钮鈞钧鈡钟鈣钙鈥钬鈦钛鈧钪鈮铌鈰铈鈳钶鈴铃鈷钴鈸钹鈹铍鈺钰鈽钸鈾铀鈿钿鉀钾鉅巨鉆钻鉈铊鉉铉鉋铇鉍铋鉑铂鉕钷鉗钳鉚铆鉛铅鉞钺鉢钵鉤钩鉦钲鉬钼鉭钽鉳锫鉶铏鉸铰鉺铒鉻铬鉿铪銀银銃铳銅铜銍铚銑铣銓铨銖铢銘铭銚铫銛铦銜衔銠铑銣铷銥铱銦铟銨铵銩铥銪铕銫铯銬铐銱铞銳锐銷销銹锈銻锑銼锉鋁铝鋃锒鋅锌鋇钡鋌铤鋏铗鋒锋鋙铻鋝锊鋟锓鋣铘鋤锄鋥锃鋦锔鋨锇鋩铓鋪铺鋭锐鋮铖鋯锆鋰锂鋱铽鋶锍鋸锯鋼钢錁锞錄录錆锖錇锫錈锩錏铔錐锥錒锕錕锟錘锤錙锱錚铮錛锛錟锬錠锭錡锜錢钱錦锦錨锚錩锠錫锡錮锢錯错録录錳锰錶表錸铼錼镎鍀锝鍁锨鍃锪鍅钫鍆钔鍇锴鍈锳鍊炼鍋锅鍍镀鍔锷鍘铡鍚钖鍛锻鍠锽鍤锸鍥锲鍩锘鍬锹鍰锾鍵键鍶锶鍺锗鍼针鍾钟鎂镁鎄锿鎇镅鎊镑鎌镰鎔镕鎖锁鎘镉鎚锤鎛镈鎡镃鎢钨鎣蓥鎦镏鎧铠鎩铩鎪锼鎬镐鎭镇鎮镇鎰镒鎲镋鎳镍鎵镓鎶鿔鎸镌鎿镎鏃镞鏇旋鏈链鏌镆鏍镙鏐镠鏑镝鏗铿鏘锵鏜镗鏝镘鏞镛鏟铲鏡镜鏢镖鏤镂鏨錾鏰镚鏵铧鏷镤鏹镪鏺䥽鏽锈鐃铙鐋铴鐐镣鐒铹鐓镦鐔镡鐘钟鐙镫鐝镢鐠镨鐥䦅鐦锎鐧锏鐨镄鐫镌鐮镰鐯䦃鐲镯鐳镭鐵铁鐶镮鐸铎鐺铛鐿镱鑄铸鑊镬鑌镔鑑鉴鑒鉴鑔镲鑕锧鑞镴鑠铄鑣镳鑥镥鑭镧鑰钥鑱镵鑲镶鑷镊鑹镩鑼锣鑽钻鑾銮鑿凿钁镢钂镋長长門门閂闩閃闪閆闫閈闬閉闭開开閌闶閎闳閏闰閑闲閒闲間间閔闵閘闸閡阂閣阁閤合閥阀閨闺閩闽閫阃閬阆閭闾閱阅閲阅閶阊閹阉閻阎閼阏閽阍閾阈閿阌闃阒闆板闇暗闈闱闊阔闋阕闌阑闍阇闐阗闒阘闓闿闔阖闕阙闖闯關关闞阚闠阓闡阐闢辟闤阛闥闼陘陉陝陕陞升陣阵陰阴陳陈陸陆陽阳隉陧隊队階阶隕陨際际隨随險险隯陦隱隐隴陇隸隶隻只雋隽雖虽雙双雛雏雜杂雞鸡離离難难雲云電电霑沾霢霡霧雾霽霁靂雳靄霭靆叇靈灵靉叆靚靓靜静靝靔靦腼靨靥鞏巩鞝绱鞦秋鞽鞒韁缰韃鞑韆千韉鞯韋韦韌韧韍韨韓韩韙韪韜韬韝鞲韞韫韻韵響响頁页頂顶頃顷項项順顺頇顸須须頊顼頌颂頎颀頏颃預预頑顽頒颁頓顿頗颇領领頜颌頡颉頤颐頦颏頭头頮颒頰颊頲颋頴颕頷颔頸颈頹颓頻频頽颓顆颗題题額额顎颚顏颜顒颙顓颛顔颜願愿顙颡顛颠類类顢颟顥颢顧顾顫颤顬颥顯显顰颦顱颅顳颞顴颧風风颭飐颮飑颯飒颱台颳刮颶飓颸飔颺飏颻飖颼飕飀飗飄飘飆飙飈飚飛飞飠饣飢饥飣饤飥饦飩饨飪饪飫饫飭饬飯饭飱飧飲饮飴饴飼饲飽饱飾饰飿饳餃饺餄饸餅饼餈糍餉饷養养餌饵餎饹餏饻餑饽餒馁餓饿餕馂餖饾餘余餚肴餛馄餜馃餞饯餡馅館馆餬糊餱糇餳饧餵喂餶馉餷馇餺馎餼饩餾馏餿馊饁馌饃馍饅馒饈馐饉馑饊馓饋馈饌馔饑饥饒饶饗飨饜餍饞馋饢馕馬马馭驭馮冯馱驮馳驰馴驯馹驲駁驳駐驻駑驽駒驹駔驵駕驾駘骀駙驸駛驶駝驼駟驷駡骂駢骈駭骇駰骃駱骆駸骎駿骏騁骋騂骍騅骓騌骔騍骒騎骑騏骐騖骛騙骗騤骙騧䯄騫骞騭骘騮骝騰腾騶驺騷骚騸骟騾骡驀蓦驁骜驂骖驃骠驄骢驅驱驊骅驌骕驍骁驏骣驕骄驗验驚惊驛驿驟骤驢驴驤骧驥骥驦骦驪骊驫骉骯肮髏髅髒脏體体髕髌髖髋髮发鬆松鬍胡鬚须鬢鬓鬥斗鬧闹鬨哄鬩阋鬮阄鬱郁鬹鬶魎魉魘魇魚鱼魛鱽魢鱾魨鲀魯鲁魴鲂魷鱿魺鲄鮁鲅鮃鲆鮊鲌鮋鲉鮍鲏鮎鲇鮐鲐鮑鲍鮒鲋鮓鲊鮚鲒鮜鲘鮝鲞鮞鲕鮣䲟鮦鲖鮪鲔鮫鲛鮭鲑鮮鲜鮳鲓鮶鲪鮺鲝鯀鲧鯁鲠鯇鲩鯉鲤鯊鲨鯒鲬鯔鲻鯕鲯鯖鲭鯗鲞鯛鲷鯝鲴鯡鲱鯢鲵鯤鲲鯧鲳鯨鲸鯪鲮鯫鲰鯰鲶鯴鲺鯷鳀鯽鲫鯿鳊鰁鳈鰂鲗鰃鳂鰆䲠鰈鲽鰉鳇鰌䲡鰍鳅鰏鲾鰐鳄鰒鳆鰓鳃鰛鳁鰜鳒鰟鳑鰠鳋鰣鲥鰥鳏鰧䲢鰨鳎鰩鳐鰭鳍鰮鳁鰱鲢鰲鳌鰳鳓鰵鳘鰷鲦鰹鲣鰺鲹鰻鳗鰼鳛鰾鳔鱂鳉鱅鳙鱈鳕鱉鳖鱒鳟鱔鳝鱖鳜鱗鳞鱘鲟鱝鲼鱟鲎鱠鲙鱣鳣鱤鳡鱧鳢鱨鲿鱭鲚鱯鳠鱷鳄鱸鲈鱺鲡鳥鸟鳧凫鳩鸠鳬凫鳲鸤鳳凤鳴鸣鳶鸢鳾䴓鴆鸩鴇鸨鴉鸦鴒鸰鴕鸵鴛鸳鴝鸲鴞鸮鴟鸱鴣鸪鴦鸯鴨鸭鴯鸸鴰鸹鴴鸻鴷䴕鴻鸿鴿鸽鵁䴔鵂鸺鵃鸼鵐鹀鵑鹃鵒鹆鵓鹁鵜鹈鵝鹅鵠鹄鵡鹉鵪鹌鵬鹏鵮鹐鵯鹎鵰雕鵲鹊鵷鹓鵾鹍鶄䴖鶇鸫鶉鹑鶊鹒鶓鹋鶖鹙鶘鹕鶚鹗鶡鹖鶥鹛鶩鹜鶪䴗鶬鸧鶯莺鶲鹟鶴鹤鶹鹠鶺鹡鶻鹘鶼鹣鶿鹚鷀鹚鷁鹢鷂鹞鷄鸡鷉䴘鷊鹝鷓鹧鷖鹥鷗鸥鷙鸷鷚鹨鷥鸶鷦鹪鷫鹔鷯鹩鷲鹫鷳鹇鷴鹇鷸鹬鷹鹰鷺鹭鷽鸴鸂㶉鸇鹯鸊䴙鸌鹱鸏鹲鸕鸬鸘鹴鸚鹦鸛鹳鸝鹂鸞鸾鹵卤鹹咸鹺鹾鹼碱鹽盐麗丽麥麦麩麸麪面麫面麯曲麴曲麵面麼么黃黄黌黉點点黨党黲黪黴霉黶黡黷黩黽黾黿鼋鼂鼌鼉鼍鼕冬鼴鼹齊齐齋斋齎赍齏齑齒齿齔龀齕龁齗龂齙龅齜龇齟龃齠龆齡龄齣出齦龈齧啮齪龊齬龉齲龋齶腭齷龌龍龙龎厐龐庞龑䶮龔龚龕龛龜龟鿁䜤鿓鿒";

  // src/script.ts
  var TO_SIMPLIFIED = /* @__PURE__ */ new Map();
  for (let i = 0; i < HANT_PAIRS.length; i += 2) TO_SIMPLIFIED.set(HANT_PAIRS[i], HANT_PAIRS[i + 1]);
  var STYLE_WORDS = "载載页頁号號条條项項译譯编編书書学學论論报報网網访訪问問发發废廢订訂节節册冊辑輯点點题題稳穩为為注註门門";
  var TO_TRADITIONAL = /* @__PURE__ */ new Map();
  for (let i = 0; i < STYLE_WORDS.length; i += 2) TO_TRADITIONAL.set(STYLE_WORDS[i], STYLE_WORDS[i + 1]);
  var simplified = (text) => [...text].map((ch) => TO_SIMPLIFIED.get(ch) ?? ch).join("");
  var isTraditional = (text) => [...text].filter((ch) => TO_SIMPLIFIED.has(ch)).length >= 2;
  var SIMPLIFIED_ONLY = /[国这个们为说时会来对学发经过还动进实现与关应开样当从问点长头让书条项号页载编译论报网规办则权证门间检认议设专业务产气电车东华岁决]/;
  var isSimplified = (text) => SIMPLIFIED_ONLY.test(text);
  var Script = class {
    text;
    plain;
    traditional;
    /** `traditional` may be decided for the whole article, since a short note (上註18) says little about itself. */
    constructor(text, traditional = isTraditional(text)) {
      this.text = text;
      this.plain = simplified(text);
      this.traditional = traditional;
    }
    /**
     * The author's own characters for a piece of the simplified copy. A piece put together from parts of the text
     * (生态环境部 + 网站) is restored character by character, wherever the text uses that character one way only.
     */
    original(piece) {
      if (!this.traditional || !piece) return piece;
      const at = this.plain.indexOf(piece);
      if (at >= 0) return this.text.slice(at, at + piece.length);
      return [...piece].map((ch) => this.back().get(ch) ?? ch).join("");
    }
    backMap;
    back() {
      if (this.backMap) return this.backMap;
      const seen = /* @__PURE__ */ new Map();
      [...this.plain].forEach((ch, i) => seen.set(ch, (seen.get(ch) ?? /* @__PURE__ */ new Set()).add([...this.text][i])));
      this.backMap = new Map([...seen].filter(([, forms]) => forms.size === 1).map(([ch, forms]) => [ch, [...forms][0]]));
      for (const [ch, t] of TO_TRADITIONAL) if (!seen.has(ch)) this.backMap.set(ch, t);
      return this.backMap;
    }
    /** The style's own words in traditional script; characters the author used are never changed. */
    restyle(output) {
      if (!this.traditional) return output;
      return [...output].map((ch) => this.text.includes(ch) ? ch : TO_TRADITIONAL.get(ch) ?? ch).join("");
    }
  };

  // src/article.ts
  var noteTypes = (note2) => [...new Set(note2.pieces.flatMap((p) => p.type ? [typeName(p.type)] : p.kind === "short" ? ["交叉引用"] : []))];
  var LAW_TYPES = /* @__PURE__ */ new Set(["statute", "normative", "case", "case_gazette", "case_guiding", "case_library"]);
  var REMARK = /〔(?!\d{4}〕)[^〔〕]*〕/g;
  var UNVERIFIED = /未读|未阅读|未经阅读|未与原文核对|未与官方文本核对|未核对|有待.*?(?:核对|阅读)|仅见|仅读过|二手|待标明|未能找到|未见/;
  var SIGNAL = /^(?:参见|另见|又见|详见|转引自|例如)\s*/;
  var SHORT_REF = (n) => `同前注[${n}]`;
  function prepare(text) {
    let out = "", titles = 0;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === "《") titles++;
      if (ch === "》") titles = Math.max(0, titles - 1);
      const end = ch === "〈" && !titles ? closing(text, i) : -1;
      if (end > 0) {
        out += `《${text.slice(i + 1, end - 1).replace(/《/g, "〈").replace(/》/g, "〉")}》`;
        i = end - 1;
      } else out += ch;
    }
    return out.replace(/([頁页])\s*(\d+(?:\s*[-–—]\s*\d+)?)\s*(起|以下)?/g, (_, p, n, more) => `第${n}${p}${more ? "以下" : ""}`);
  }
  var strings = (fields, map) => Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, typeof v === "string" ? map(v) : Array.isArray(v) ? v.map((x) => typeof x === "string" ? map(x) : x) : v]));
  function plausible(fields, body, output, missing) {
    const type = String(fields.type);
    if (type === "normative") return Boolean(fields.doc_no || fields.date || fields.issuer);
    if (type === "statute") return true;
    const names2 = Array.isArray(fields.authors) ? fields.authors.map(String) : [];
    if (names2.some((n) => n.length > 25 || /[：:《》，,。（(]/.test(n))) return false;
    if (type === "book" && blank(fields.publisher)) return false;
    if (/^case/.test(type) && missing.length) return false;
    if (missing.length > 2 || missing.includes("出版社") && missing.includes("出版年份")) return false;
    return (body.match(/\d+/g) ?? []).every((n) => output.includes(n));
  }
  function readSource(script, from) {
    const body = script.plain.slice(from);
    const parts = splitTop(body, "，,");
    for (let n = parts.length; n >= 1; n--) {
      const lead = parts.slice(0, n).map((p, i) => p.part + (i < n - 1 ? p.sep : "")).join("");
      if (!lead.trim()) continue;
      let fields;
      try {
        fields = parse(lead.trim());
      } catch {
        continue;
      }
      const restored = strings(fields, (s) => script.original(s));
      let result;
      try {
        result = cite(restored);
      } catch {
        continue;
      }
      if (!plausible(fields, lead, result.text, result.missing)) continue;
      const warnings = Array.isArray(restored.unused) && restored.unused.length ? [`未写入引注：${restored.unused.join("；")}`] : [];
      return {
        known: { fields: restored, plain: fields, text: script.text },
        text: script.restyle(result.text),
        missing: result.missing,
        warnings,
        rest: script.text.slice(from + lead.length)
      };
    }
    return null;
  }
  function readCore(script) {
    const leads = [0];
    const signal = script.plain.match(SIGNAL);
    if (signal) leads.push(signal[0].length);
    const colon = topIndex(script.plain, "：");
    if (colon > 0) leads.push(colon + 1);
    for (const at of leads) {
      const reading = readSource(script, at);
      if (reading) return { ...reading, prefix: script.text.slice(0, at) };
    }
    return null;
  }
  var SAME = /^同上注?(?:[，,：:]\s*(?<rest>.*))?$/;
  var BARE = /^见?(?:上|前)注\s*(?<nums>\d+(?:\s*[、，,]\s*\d+)*)(?<rest>.*)$/;
  var LABELLED = /^(?<label>.{1,60}?)\s*[（(]见?(?:上|前)注\s*(?<n>\d+)[）)](?<rest>.*)$/;
  var LOCATOR = /^[，,]?\s*(?<where>第(?:[^，,。；;：:（(]|[（(][一二三四五六七八九十\d]+[）)])+)(?:[（(](?<version>\d{4}年(?:修订|修正))[）)])?(?<after>.*)$/;
  var PAGES3 = /^第(?<pages>\d+(?:[-–—、]\d+)*)页(?<more>以下)?$/;
  function locate(rest, script) {
    const m = rest.match(LOCATOR);
    if (!m) return { where: null, version: null, after: script.original(rest) };
    const where = m.groups.where.trim().replace(
      /第[（(]?([一二三四五六七八九十百]+|\d+)[）)]?(条|款|项|目)/g,
      (_, n, unit) => `第${/^\d+$/.test(n) ? n : toArabic(n)}${unit}`
    );
    return { where: script.original(where), version: m.groups.version ?? null, after: script.original(m.groups.after ?? "") };
  }
  function toArabic(numeral) {
    const digits = "零一二三四五六七八九";
    let total = 0, digit = 0;
    for (const ch of numeral) {
      if (digits.includes(ch)) digit = digits.indexOf(ch);
      else {
        total += (digit || 1) * { 十: 10, 百: 100 }[ch];
        digit = 0;
      }
    }
    return String(total + digit);
  }
  function score(label, known) {
    const p = known.plain;
    const name = String(p.name ?? p.title ?? "").replace(/^中华人民共和国/, "");
    const bare = name.replace(/（[^）]*）$/, "");
    const numbers = [String(p.doc_no ?? "")].flatMap((d) => [d, d.replace(/^.*令(第\d+号)$/, "$1令")]).filter(Boolean);
    const authors9 = Array.isArray(p.authors) ? p.authors.map(String) : [];
    if ([name, String(p.alias ?? ""), ...numbers, ...authors9].includes(label)) return 4;
    if (bare.endsWith(label)) return 3;
    if (name.includes(label) || numbers.some((d) => d.includes(label))) return 2;
    let at = 0;
    for (const ch of label) {
      at = bare.indexOf(ch, at);
      if (at < 0) return 0;
      at++;
    }
    return label.length >= 3 && bare.endsWith(label.at(-1)) ? 1 : 0;
  }
  function expand(known, where, version, script, keep) {
    const fields = { ...known.fields };
    delete fields.unused;
    if (keep && !where) {
    } else if (LAW_TYPES.has(String(fields.type))) {
      if (where) fields.locator = where;
      else delete fields.locator;
      if (version && fields.type === "statute") fields.version = script.original(version);
    } else {
      const pages3 = where && new Script(where).plain.match(PAGES3);
      if (where && !pages3) return null;
      if (pages3) fields.pages = pages3.groups.pages + (pages3.groups.more ? "以下" : "");
      else delete fields.pages;
    }
    const result = cite(fields);
    return { text: new Script(script.text + known.text, script.traditional).restyle(result.text), missing: result.missing, fields };
  }
  var noteScript = (note2, ctx) => isTraditional(note2) || ctx.traditional && !isSimplified(note2);
  function crossReference(script, ctx) {
    const local = script, plain2 = script.plain;
    const short = (text, warnings = []) => ({ text, kind: "short", missing: [], warnings, known: null });
    const written = (known, where, version, after, keep = false) => {
      const out = expand(known, where, version, local, keep);
      if (!out) return null;
      const joint = !where && after && !/^[，,：:]/.test(after) ? "，" : "";
      return {
        text: after ? out.text.replace(/。$/, "") + joint + after : out.text,
        kind: "expanded",
        missing: out.missing,
        warnings: [],
        known: { ...known, fields: out.fields }
      };
    };
    const same = plain2.match(SAME);
    if (same) {
      const { where, version, after } = locate(same.groups.rest ?? "", local);
      if (ctx.previous.length === 1) {
        const out = written(ctx.previous[0], where, version, after, !after || /^[：:]/.test(after));
        if (out) return out;
      }
      const tail = where ? `，${where}${after}` : after ? `，${after}` : "";
      return short(`${local.restyle("同上注")}${tail}`, ctx.previous.length > 1 ? ["上一注引了不止一种文献，“同上”所指不明（第13条只允许前后紧邻、文献完全相同时写“同上注”）"] : []);
    }
    const bare = plain2.match(BARE);
    if (bare) {
      const nums = bare.groups.nums.split(/\s*[、，,]\s*/);
      const { where, version, after } = locate(bare.groups.rest ?? "", local);
      const targets = nums.length === 1 ? ctx.notes.get(nums[0]) ?? [] : [];
      if (targets.length === 1) {
        const out = written(targets[0], where, version, after, !after || /^[：:]/.test(after));
        if (out) return out;
      }
      const tail = where ? `，${where}${after}` : after;
      return short(`${local.restyle(SHORT_REF(nums.join("]、[")))}${tail}`);
    }
    const labelled = plain2.match(LABELLED);
    if (labelled) {
      const n = labelled.groups.n;
      const label = labelled.groups.label.trim();
      if (/[，,：:；;「」“”]/.test(label)) return null;
      const rest = labelled.groups.rest ?? "";
      if (rest && !/^[，,：:]|^第/.test(rest)) return null;
      const { where, version, after } = locate(rest, local);
      const key = label.replace(/[《》〈〉]/g, "").replace(/^\d{4}年/, "");
      const ranked = (ctx.notes.get(n) ?? []).map((k) => [score(key, k), k]).filter(([s]) => s > 0).sort((a, b) => b[0] - a[0]);
      if (ranked.length) {
        const out = written(ranked[0][1], where, version, after);
        if (out) return out;
      }
      const tail = where ? `，${where}${after}` : after ? `，${after.replace(/^[，,]/, "")}` : "";
      const self = readSource(new Script(local.text.slice(0, labelled.groups.label.length), local.traditional), 0);
      if (self && !self.rest && LAW_TYPES.has(String(self.known.fields.type)))
        return { text: self.text.replace(/。$/, "") + (where ? `，${where}` : "") + after, kind: "cited", missing: self.missing, warnings: [], known: self.known };
      return short(`${local.restyle(SHORT_REF(n))}，${local.original(label)}${tail}`);
    }
    return null;
  }
  function referenceAfterLead(script, ctx) {
    const colon = topIndex(script.plain, "：");
    for (const at of colon > 0 ? [0, colon + 1] : [0]) {
      const ref = crossReference(new Script(script.text.slice(at), script.traditional), ctx);
      if (ref) return { ...ref, prefix: script.text.slice(0, at) };
    }
    return null;
  }
  function quoteAt(core) {
    let at = 0;
    for (const { part, sep } of splitTop(core, "：:")) {
      at += part.length + sep.length;
      if (sep && /^[「“『"]/.test(core.slice(at))) return at - 1;
    }
    return -1;
  }
  function convertNote(label, source, ctx) {
    const text = prepare(source.trim());
    const pieces = [], cited = [];
    let out = "";
    for (const { part, sep } of splitTop(text, "。；;")) {
      const remarks = part.match(REMARK) ?? [];
      let core = part.replace(REMARK, "");
      const q = quoteAt(core);
      const quote = q >= 0 ? core.slice(q) : "";
      core = core.slice(0, core.length - quote.length);
      const trimmed = core.trim();
      const warnings = remarks.some((r) => UNVERIFIED.test(new Script(r).plain)) ? ["作者自注显示来源尚未核实。手册第2条：未经核实的文献不得引用，请先核对原文"] : [];
      const close = (body) => sep || quote || remarks.length ? body.replace(/。$/, "") + quote + remarks.join("") + sep : /[。.]$/.test(body) ? body : `${body}。`;
      if (!trimmed) {
        out += part + sep;
        if (part.trim()) pieces.push({ source: part, text: part, kind: "kept", type: null, missing: [], warnings });
        continue;
      }
      const script = new Script(trimmed, noteScript(text, ctx));
      const ref = looksJapanese(trimmed) ? null : referenceAfterLead(script, ctx);
      if (ref) {
        if (ref.known) cited.push(ref.known);
        const body = close(ref.prefix + ref.text);
        pieces.push({
          source: part,
          text: body,
          kind: ref.kind,
          type: ref.known ? String(ref.known.fields.type) : null,
          missing: ref.missing,
          warnings: [...ref.warnings, ...warnings]
        });
        out += body;
        continue;
      }
      const reading = looksJapanese(trimmed) ? readJapanese(trimmed) : readCore(script);
      if (reading) {
        cited.push(reading.known);
        const body = close(reading.prefix + (reading.rest ? reading.text.replace(/。$/, "") + reading.rest : reading.text));
        pieces.push({
          source: part,
          text: body,
          kind: "cited",
          type: String(reading.known.fields.type),
          missing: reading.missing,
          warnings: [...reading.warnings, ...warnings]
        });
        out += body;
        continue;
      }
      pieces.push({ source: part, text: part, kind: "kept", type: null, missing: [], warnings });
      out += part + sep;
    }
    ctx.notes.set(label, cited);
    ctx.previous = cited;
    const unread = pieces.filter((p) => p.kind === "kept" && (/[《〈]/.test(p.source) || /\d{4}年\d{1,2}月/.test(p.source) && /报道|通报|报告|规定|办法|文件|公布|发布|日报|晚报/.test(new Script(p.source).plain) && !/检索/.test(new Script(p.source).plain)));
    const status = unread.length === 0 && pieces.some((p) => p.kind !== "kept") ? "done" : pieces.some((p) => p.kind !== "kept") ? "partial" : "kept";
    return { label, source, text: out, pieces, status };
  }
  function readJapanese(core) {
    try {
      const fields = parse(core);
      const result = cite(fields);
      if (!plausible(fields, core, result.text, result.missing)) return null;
      return { known: { fields, plain: fields, text: core }, text: result.text, missing: result.missing, warnings: [], rest: "", prefix: "" };
    } catch {
      return null;
    }
  }
  function citeReference(raw) {
    if (looksJapanese(raw)) return cite(parse(raw));
    const script = new Script(prepare(raw.trim().replace(/。$/, "")));
    const result = cite(strings(parse(script.plain), (s) => script.original(s)));
    return { ...result, text: script.restyle(result.text) };
  }
  var DEFINITION = /^\[\^([^\]\s]+)\]:[ \t]?(.*)$/;
  var CONTINUED = /^(?: {4}|\t)(.*)$/;
  var LINE_MARK = /^\s*(?:\[(\d+)\]|〔(\d+)〕|［(\d+)］|(\d+)[.、．)）]|[（(](\d+)[）)]|([①-⑳]))\s*/;
  function convertNotes(notes) {
    const traditional = isTraditional(notes.map((n) => n.text).join(""));
    const ctx = { previous: [], notes: /* @__PURE__ */ new Map(), traditional };
    return notes.map((n) => convertNote(n.label, n.text, ctx));
  }
  function convertArticle(input2) {
    const lines = input2.split(/\r?\n/);
    const found = [];
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(DEFINITION);
      if (!m) continue;
      let text = m[2], to = i;
      while (to + 1 < lines.length && CONTINUED.test(lines[to + 1])) text += " " + lines[++to].match(CONTINUED)[1].trim();
      found.push({ label: m[1], text, from: i, to });
      i = to;
    }
    if (found.length) {
      const notes2 = convertNotes(found);
      const out2 = [...lines];
      for (let k = found.length - 1; k >= 0; k--) {
        const { from, to, label } = found[k];
        out2.splice(from, to - from + 1, `[^${label}]: ${notes2[k].text}`);
      }
      return { format: "markdown", notes: notes2, document: out2.join("\n") };
    }
    const listed = lines.map((line, i) => ({ line, i })).filter(({ line }) => line.trim());
    const notes = convertNotes(listed.map(({ line }, k) => {
      const mark = line.match(LINE_MARK);
      const label = mark ? mark.slice(1).find(Boolean) : String(k + 1);
      return { label: /^[①-⑳]$/.test(label) ? String(label.charCodeAt(0) - 9311) : label, text: mark ? line.slice(mark[0].length) : line };
    }));
    const out = [...lines];
    listed.forEach(({ line, i }, k) => {
      out[i] = (line.match(LINE_MARK)?.[0] ?? "") + notes[k].text;
    });
    return { format: "lines", notes, document: out.join("\n") };
  }

  // src/zip.ts
  var u16 = (b, at) => b[at] | b[at + 1] << 8;
  var u32 = (b, at) => (u16(b, at) | u16(b, at + 2) << 16) >>> 0;
  async function through(data, stream) {
    return new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(stream)).arrayBuffer());
  }
  function readZip(zip) {
    let end = zip.length - 22;
    while (end >= 0 && u32(zip, end) !== 101010256) end--;
    if (end < 0) throw new Error("这不是有效的 Word 文件（.docx）。");
    const entries = [];
    let at = u32(zip, end + 16);
    for (let n = u16(zip, end + 10); n > 0; n--) {
      const nameLength = u16(zip, at + 28);
      const local = u32(zip, at + 42);
      const start = local + 30 + u16(zip, local + 26) + u16(zip, local + 28);
      entries.push({
        name: new TextDecoder().decode(zip.subarray(at + 46, at + 46 + nameLength)),
        flags: u16(zip, at + 8),
        method: u16(zip, at + 10),
        time: u16(zip, at + 12),
        date: u16(zip, at + 14),
        crc: u32(zip, at + 16),
        size: u32(zip, at + 24),
        data: zip.subarray(start, start + u32(zip, at + 20))
      });
      at += 46 + nameLength + u16(zip, at + 30) + u16(zip, at + 32);
    }
    return entries;
  }
  async function contents(entry) {
    if (entry.method === 0) return entry.data;
    if (entry.method === 8) return through(entry.data, new DecompressionStream("deflate-raw"));
    throw new Error(`无法解压 ${entry.name}（压缩方式 ${entry.method}）。`);
  }
  var CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
    for (let k = 0; k < 8; k++) n = n & 1 ? 3988292384 ^ n >>> 1 : n >>> 1;
    return n >>> 0;
  });
  function crc32(data) {
    let crc = 4294967295;
    for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 255] ^ crc >>> 8;
    return (crc ^ 4294967295) >>> 0;
  }
  async function replaced(entry, data) {
    return { ...entry, method: 8, crc: crc32(data), size: data.length, data: await through(data, new CompressionStream("deflate-raw")) };
  }
  function writeZip(entries) {
    const parts = [], central = [];
    let offset = 0;
    for (const e of entries) {
      const name = new TextEncoder().encode(e.name);
      const fields = (header, at2) => {
        header.setUint16(at2, 20, true);
        header.setUint16(at2 + 2, e.flags & ~8, true);
        header.setUint16(at2 + 4, e.method, true);
        header.setUint16(at2 + 6, e.time, true);
        header.setUint16(at2 + 8, e.date, true);
        header.setUint32(at2 + 10, e.crc, true);
        header.setUint32(at2 + 14, e.data.length, true);
        header.setUint32(at2 + 18, e.size, true);
        header.setUint16(at2 + 22, name.length, true);
      };
      const local = new Uint8Array(30 + name.length), lv = new DataView(local.buffer);
      lv.setUint32(0, 67324752, true);
      fields(lv, 4);
      local.set(name, 30);
      const record = new Uint8Array(46 + name.length), cv = new DataView(record.buffer);
      cv.setUint32(0, 33639248, true);
      cv.setUint16(4, 20, true);
      fields(cv, 6);
      cv.setUint32(42, offset, true);
      record.set(name, 46);
      parts.push(local, e.data);
      central.push(record);
      offset += local.length + e.data.length;
    }
    const size = central.reduce((n, r) => n + r.length, 0);
    const end = new Uint8Array(22), ev = new DataView(end.buffer);
    ev.setUint32(0, 101010256, true);
    ev.setUint16(8, entries.length, true);
    ev.setUint16(10, entries.length, true);
    ev.setUint32(12, size, true);
    ev.setUint32(16, offset, true);
    const out = new Uint8Array(offset + size + 22);
    let at = 0;
    for (const part of [...parts, ...central, end]) {
      out.set(part, at);
      at += part.length;
    }
    return out;
  }

  // src/docx.ts
  var FOOTNOTES = "word/footnotes.xml";
  var FOOTNOTE = /<w:footnote\b([^>]*)>([\s\S]*?)<\/w:footnote>/g;
  var SEPARATOR = /w:type="(?:separator|continuationSeparator|continuationNotice)"/;
  var PARAGRAPH = /<w:p\b[^>]*?(?:\/>|>[\s\S]*?<\/w:p>)/g;
  var RUN = /<w:r\b[^>]*>[\s\S]*?<\/w:r>/g;
  var REFERENCE = /<w:r\b[^>]*>(?:(?!<\/w:r>)[\s\S])*?<w:footnoteRef\s*\/>[\s\S]*?<\/w:r>/;
  var IS_REFERENCE = /<w:footnoteRef\s*\/>/;
  var unescape = (text) => text.replace(/&(?:#(\d+)|#x([\da-f]+)|(amp|lt|gt|quot|apos));/gi, (_, dec, hex, named) => dec ? String.fromCodePoint(Number(dec)) : hex ? String.fromCodePoint(parseInt(hex, 16)) : { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }[named.toLowerCase()]);
  var escape = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  async function footnotesXml(file) {
    const entries = readZip(file);
    const at = entries.findIndex((e) => e.name === FOOTNOTES);
    return { entries, at, xml: at < 0 ? "" : new TextDecoder().decode(await contents(entries[at])) };
  }
  async function docxFootnotes(file) {
    const notes = [];
    for (const m of (await footnotesXml(file)).xml.matchAll(FOOTNOTE)) {
      if (SEPARATOR.test(m[1])) continue;
      const text = [...m[2].matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\s*\/>/g)].map((t) => t[1] === void 0 ? " " : unescape(t[1])).join("");
      notes.push({ label: String(notes.length + 1), text: text.trim() });
    }
    return notes;
  }
  async function reviseDocx(file, notes, revision = {}) {
    const { entries, at, xml } = await footnotesXml(file);
    const changed = new Map(notes.filter((n) => n.text !== n.source).map((n) => [n.label, n]));
    if (at < 0 || !changed.size) return file;
    const marks = new Marks(revision);
    let index = 0;
    const revised = xml.replace(FOOTNOTE, (whole, attributes, body) => {
      if (SEPARATOR.test(attributes)) return whole;
      const note2 = changed.get(String(++index));
      if (!note2) return whole;
      const runs = textRuns(` ${note2.text}`, baseFormat(body), !note2.source.includes("*"));
      return `<w:footnote${attributes}>${revision.track === false ? replace(body, runs) : track(body, runs, marks)}</w:footnote>`;
    });
    entries[at] = await replaced(entries[at], new TextEncoder().encode(revised));
    return writeZip(entries);
  }
  function baseFormat(body) {
    const run = [...body.matchAll(RUN)].map((m) => m[0]).find((r) => /<w:t\b/.test(r) && !IS_REFERENCE.test(r));
    const format = run?.match(/<w:rPr>[\s\S]*?<\/w:rPr>/)?.[0] ?? "";
    return format.replace(/<w:(?:i|iCs|vertAlign)\b[^>]*\/>|<w:rStyle w:val="FootnoteReference"\s*\/>/g, "").replace(/<w:rPr>\s*<\/w:rPr>/, "");
  }
  function italic(format) {
    const inner = format.replace(/^<w:rPr>|<\/w:rPr>$/g, "");
    const lead = inner.match(/^(?:<w:(?:rStyle|rFonts|b|bCs)\b[^>]*\/>)*/)[0];
    return `<w:rPr>${lead}<w:i/><w:iCs/>${inner.slice(lead.length)}</w:rPr>`;
  }
  function textRuns(text, format, markdown) {
    const parts = markdown ? text.split(/\*([^*\n]+)\*/) : [text];
    return parts.map((part, i) => part && `<w:r>${i % 2 ? italic(format) : format}<w:t xml:space="preserve">${escape(part)}</w:t></w:r>`).join("");
  }
  function replace(body, runs) {
    const paragraphs = [...body.matchAll(PARAGRAPH)];
    if (!paragraphs.length) return body;
    const first = paragraphs[0][0], last = paragraphs.at(-1);
    const open = first.endsWith("/>") ? "<w:p>" : first.match(/^<w:p\b[^>]*>/)[0];
    const settings = first.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)?.[0] ?? "";
    const number = body.match(REFERENCE)?.[0] ?? "";
    return body.slice(0, paragraphs[0].index) + `${open}${settings}${number}${runs}</w:p>` + body.slice(last.index + last[0].length);
  }
  var Marks = class {
    id = 9e5;
    author;
    date;
    constructor(revision) {
      this.author = escape(revision.author ?? "引注整理");
      this.date = (revision.date ?? /* @__PURE__ */ new Date()).toISOString().replace(/\.\d+Z$/, "Z");
    }
    next() {
      return `w:id="${this.id++}" w:author="${this.author}" w:date="${this.date}"`;
    }
  };
  function track(body, runs, marks) {
    const paragraphs = [...body.matchAll(PARAGRAPH)];
    if (!paragraphs.length) return body;
    let out = body.slice(0, paragraphs[0].index);
    paragraphs.forEach((m, k) => {
      let p = m[0].endsWith("/>") ? m[0].replace(/\/>$/, "></w:p>") : m[0];
      p = p.replace(/<w:del\b[^>]*\/>|<w:del\b[^>]*>[\s\S]*?<\/w:del>|<w:pPr>[\s\S]*?<\/w:pPr>|<w:r\b[^>]*>[\s\S]*?<\/w:r>/g, (part) => !part.startsWith("<w:r") || IS_REFERENCE.test(part) ? part : `<w:del ${marks.next()}>${part.replace(/<(\/?)w:t\b/g, "<$1w:delText").replace(/<(\/?)w:instrText\b/g, "<$1w:delInstrText")}</w:del>`);
      if (k < paragraphs.length - 1) p = deleteMark(p, `<w:del ${marks.next()}/>`);
      else p = p.replace(/<\/w:p>$/, `<w:ins ${marks.next()}>${runs}</w:ins></w:p>`);
      const next = paragraphs[k + 1];
      out += p + body.slice(m.index + m[0].length, next ? next.index : body.length);
    });
    return out;
  }
  function deleteMark(p, mark) {
    p = p.replace(/<w:pPr\s*\/>/, "");
    const settings = p.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)?.[0];
    if (!settings) return p.replace(/^<w:p\b[^>]*>/, (open) => `${open}<w:pPr><w:rPr>${mark}</w:rPr></w:pPr>`);
    const revised = settings.includes("<w:rPr>") ? settings.replace(/<w:rPr>(<w:ins\b[^>]*\/>)?/, `<w:rPr>$1${mark}`) : settings.replace(/(<w:sectPr\b|<w:pPrChange\b|<\/w:pPr>)/, `<w:rPr>${mark}</w:rPr>$1`);
    return p.replace(settings, revised);
  }

  // src/ui/types.ts
  var TYPES = {
    book: [TYPE_NAMES.book, [
      ["authors", "作者", "list", 1],
      ["nationality", "国籍（如 美、德）"],
      ["dynasty", "朝代（古籍）"],
      ["role", "著作方式（主编、编、整理）"],
      ["title", "书名", "text", 1, 1],
      ["edition", "版次（数字或“修订版”）"],
      ["volume", "卷册（如 第3卷）"],
      ["translators", "译者"],
      ["collators", "点校者"],
      ["publisher", "出版社", "text", 1],
      ["year", "出版年份", "text", 1],
      ["pages", "页码"],
      ["chapter", "章节（代替页码）"],
      ["is_translation", "译著（必须写译者）", "check"],
      ["specific", "引用了具体内容（必须标页码）", "check"],
      ["et_al", "作者较多，后加“等”", "check"],
      ["no_author", "常用典籍或辞书，不写作者", "check"]
    ]],
    article: [TYPE_NAMES.article, [
      ["authors", "作者", "list", 1],
      ["nationality", "国籍"],
      ["title", "篇名", "text", 1, 1],
      ["journal", "刊名", "text", 1],
      ["year", "年份", "text", 1],
      ["issue", "期次", "text", 1],
      ["pages", "页码"],
      ["specific", "引用了具体内容（必须标页码）", "check"]
    ]],
    chapter: [TYPE_NAMES.chapter, [
      ["authors", "作者", "list", 1],
      ["nationality", "国籍"],
      ["title", "篇名", "text", 1, 1],
      ["translators", "译者"],
      ["editors", "编者", "list"],
      ["editor_role", "编者身份（默认 主编）"],
      ["book_title", "文集或集刊名", "text", 1, 1],
      ["volume", "卷、辑（如 第1卷）"],
      ["publisher", "出版社", "text", 1],
      ["year", "出版年份", "text", 1],
      ["pages", "页码"],
      ["specific", "引用了具体内容（必须标页码）", "check"]
    ]],
    newspaper: [TYPE_NAMES.newspaper, [["authors", "作者", "list", 1], ["title", "标题", "text", 1, 1], ["paper", "报纸名称", "text", 1], ["date", "出版日期", "date", 1], ["section", "版面", "text", 1]]],
    web: [TYPE_NAMES.web, [
      ["authors", "作者（无署名可空）", "list"],
      ["title", "标题", "text", 1, 1],
      ["site", "网站名称", "text", 1],
      ["date", "上传日期", "date"],
      ["url", "网页链接", "text", 0, 1],
      ["accessed", "访问日期（无上传日期时）", "date"]
    ]],
    wechat: [TYPE_NAMES.wechat, [["authors", "作者", "list", 1], ["title", "标题", "text", 1, 1], ["account", "公众号名称", "text", 1], ["date", "发布日期", "date", 1]]],
    thesis: [TYPE_NAMES.thesis, [
      ["authors", "作者", "list", 1],
      ["title", "题目", "text", 1, 1],
      ["school", "授予单位", "text", 1],
      ["year", "答辩年份", "text", 1],
      ["degree", "学位层级（博士、硕士）", "text", 1],
      ["pages", "页码"],
      ["specific", "引用了具体内容（必须标页码）", "check"]
    ]],
    statute: [TYPE_NAMES.statute, [
      ["name", "法律名称", "text", 1, 1],
      ["issuer", "制定机关（法规规章可选）"],
      ["version", "版本（如 2013年修正）"],
      ["article", "条", "text", 1],
      ["article_suffix", "条后缀（如 之一）"],
      ["paragraph", "款"],
      ["item", "项"],
      ["amended", "法律修改过（必须写版本）", "check"],
      ["repealed", "已废止", "check"]
    ]],
    normative: [TYPE_NAMES.normative, [
      ["issuer", "制定机关"],
      ["name", "文件名称", "text", 1, 1],
      ["doc_no", "文号", "text", 1],
      ["date", "发布日期（无文号时）", "date"],
      ["section", "节（如 四）"],
      ["subsection", "小节（如 一）"],
      ["article", "条"],
      ["inline", "文号用括号括注", "check"]
    ]],
    case: [TYPE_NAMES.case, [
      ["name", "案例名称", "text", 1, 1],
      ["court", "审判法院（全称）", "text", 1, 1],
      ["year", "案号年份", "text", 1],
      ["case_no", "案号（年份之后的部分）", "text", 1],
      ["doc_type", "文书类型（如 民事判决书）", "text", 1],
      ["date", "裁判日期（可选）", "date"]
    ]],
    case_gazette: [TYPE_NAMES.case_gazette, [["name", "案例名称", "text", 1, 1], ["gazette", "公报名称（默认 最高人民法院公报）"], ["year", "年份", "text", 1], ["issue", "期次", "text", 1]]],
    case_guiding: [TYPE_NAMES.case_guiding, [["name", "案例名称", "text", 1, 1], ["number", "指导性案例序号", "text", 1], ["year", "发布年份", "text", 1]]],
    case_library: [TYPE_NAMES.case_library, [["name", "案例名称", "text", 1, 1], ["library_no", "入库编号", "text", 1]]],
    en_book: [TYPE_NAMES.en_book, [
      ["authors", "Authors（名 姓；多人用分号）", "enlist", 1, 1],
      ["role", "ed. / eds."],
      ["title", "Title", "text", 1, 1],
      ["subtitle", "Subtitle"],
      ["edition", "Edition（如 10th）"],
      ["translated_by", "Translator"],
      ["publisher", "Publisher", "text", 1],
      ["year", "Year", "text", 1],
      ["pages", "Pages"],
      ["specific", "引用了具体内容（必须标页码）", "check"]
    ]],
    en_article: [TYPE_NAMES.en_article, [
      ["authors", "Authors（名 姓；多人用分号）", "enlist", 1, 1],
      ["title", "Title", "text", 1, 1],
      ["volume", "Volume", "text", 1],
      ["journal", "Journal（可用缩写）", "text", 1],
      ["first_page", "First page", "text", 1],
      ["pin", "Pin cite"],
      ["year", "Year", "text", 1]
    ]],
    en_case_us: [TYPE_NAMES.en_case_us, [
      ["name", "Case name", "text", 1, 1],
      ["volume", "Volume", "text", 1],
      ["reporter", "Reporter（如 U.S.、F.2d）", "text", 1],
      ["first_page", "First page", "text", 1],
      ["pin", "Pin cite"],
      ["court", "Court（如 D.C. Cir.）"],
      ["year", "Year", "text", 1]
    ]],
    en_case_uk: [TYPE_NAMES.en_case_uk, [
      ["name", "Case name", "text", 1, 1],
      ["year", "Year", "text", 1],
      ["report", "Report（如 AC 40、EWCA Civ 1599）", "text", 1, 1],
      ["pin", "Pin cite（如 para. 30）"],
      ["round", "年份用圆括号（年份不是报告编号的一部分）", "check"]
    ]],
    fr_book: [TYPE_NAMES.fr_book, [
      ["authors", "Auteurs（名 姓；多人用分号）", "enlist", 1, 1],
      ["role", "编者写 (dir.)"],
      ["title", "Titre", "text", 1, 1],
      ["edition", "版次（数字）"],
      ["publisher", "Éditeur", "text", 1],
      ["year", "Année", "text", 1],
      ["pages", "页码（如 16-29、197 s.）"],
      ["specific", "引用了具体内容（必须标页码）", "check"]
    ]],
    fr_article: [TYPE_NAMES.fr_article, [
      ["authors", "Auteurs（名 姓；多人用分号）", "enlist", 1, 1],
      ["title", "Titre", "text", 1, 1],
      ["journal", "Revue（可用通行缩写）", "text", 1],
      ["year", "Année", "text", 1],
      ["issue", "期号（n°）"],
      ["pages", "页码"],
      ["specific", "引用了具体内容（必须标页码）", "check"]
    ]],
    de_book: [TYPE_NAMES.de_book, [
      ["authors", "Autoren（名 姓；多人用分号）", "enlist", 1, 1],
      ["role", "编者写 (Hrsg.)"],
      ["title", "Titel", "text", 1, 1],
      ["volume", "卷（如 Band I）"],
      ["edition", "版次（数字）"],
      ["publisher", "Verlag", "text", 1],
      ["year", "Jahr", "text", 1],
      ["pages", "位置（如 § 15 Rn. 19，或页码 46 ff.）", "text", 0, 1],
      ["specific", "引用了具体内容（必须标页码）", "check"]
    ]],
    de_article: [TYPE_NAMES.de_article, [
      ["authors", "Autoren（名 姓；多人用分号）", "enlist", 1, 1],
      ["title", "Titel", "text", 1, 1],
      ["journal", "Zeitschrift（可用缩写，如 NJW）", "text", 1],
      ["volume", "卷（如 129）"],
      ["year", "Jahr", "text", 1],
      ["pages", "页码（如 630、238 f.）", "text", 1]
    ]],
    it_book: [TYPE_NAMES.it_book, [
      ["authors", "Autori（名 姓；多人用分号）", "enlist", 1, 1],
      ["role", "编者写 (a cura di)"],
      ["title", "Titolo", "text", 1, 1],
      ["edition", "版次（数字）"],
      ["publisher", "Editore", "text", 1],
      ["year", "Anno", "text", 1],
      ["pages", "页码（如 34 ss.）"],
      ["specific", "引用了具体内容（必须标页码）", "check"]
    ]],
    it_article: [TYPE_NAMES.it_article, [
      ["authors", "Autori（名 姓；多人用分号）", "enlist", 1, 1],
      ["title", "Titolo", "text", 1, 1],
      ["journal", "Rivista", "text", 1],
      ["year", "Anno", "text", 1],
      ["volume", "卷（数字会改成罗马数字）"],
      ["issue", "期号"],
      ["pages", "页码"],
      ["specific", "引用了具体内容（必须标页码）", "check"]
    ]],
    ru_book: [TYPE_NAMES.ru_book, [
      ["authors", "Авторы（名 姓，如 И. И. Иванов；多人用分号）", "enlist", 1, 1],
      ["title", "Название", "text", 1, 1],
      ["edition", "版次（数字）"],
      ["publisher", "Издательство", "text", 1],
      ["year", "Год", "text", 1],
      ["pages", "页码"],
      ["specific", "引用了具体内容（必须标页码）", "check"]
    ]],
    ru_article: [TYPE_NAMES.ru_article, [
      ["authors", "Авторы（名 姓；多人用分号）", "enlist", 1, 1],
      ["title", "Название", "text", 1, 1],
      ["journal", "Журнал", "text", 1],
      ["year", "Год", "text", 1],
      ["issue", "期号（№）"],
      ["pages", "页码"],
      ["specific", "引用了具体内容（必须标页码）", "check"]
    ]],
    ja_book: [TYPE_NAMES.ja_book, [
      ["authors", "著者（多人用顿号）", "list", 1],
      ["title", "書名", "text", 1, 1],
      ["publisher", "出版社", "text", 1],
      ["year", "出版年（公元或年号，如 昭和46年）", "text", 1],
      ["pages", "頁"],
      ["specific", "引用了具体内容（必须标页码）", "check"]
    ]],
    ja_article: [TYPE_NAMES.ja_article, [
      ["authors", "著者（多人用顿号）", "list", 1],
      ["title", "論文名", "text", 1, 1],
      ["journal", "刊名", "text", 1],
      ["volume", "巻"],
      ["issue", "号"],
      ["year", "年（公元或年号）", "text", 1],
      ["pages", "頁"],
      ["specific", "引用了具体内容（必须标页码）", "check"]
    ]]
  };
  var GROUPS = [
    ["中文文献", ["book", "article", "chapter", "newspaper", "web", "wechat", "thesis"]],
    ["法律与案例", ["statute", "normative", "case", "case_gazette", "case_guiding", "case_library"]],
    ["英文", ["en_book", "en_article", "en_case_us", "en_case_uk"]],
    ["其他外文", ["fr_book", "fr_article", "de_book", "de_article", "it_book", "it_article", "ru_book", "ru_article", "ja_book", "ja_article"]]
  ];
  var SAMPLE = {
    article: [
      "# 示例文章",
      "",
      "程序具有独立的价值。[^1] 行政诉讼的受案范围由法律列举。[^2] 不属于受案范围的事项另有规定。[^3]",
      "农村最低生活保障制度于2007年在全国建立。[^4] 前引文章对程序价值另有论述。[^5] 实务中的看法并不一致。[^6]",
      "",
      "[^1]: 季衞東：〈法律程序的意義——對中國法制建設的另一種思考〉，《中國社會科學》1993年第1期，頁91。",
      "[^2]: 《中华人民共和国行政诉讼法》（1989年4月4日通过，2014年11月1日修正，2017年6月27日修正）第12条第1款第（一）项。",
      "[^3]: 同上，第13条。",
      "[^4]: 国务院：《关于在全国建立农村最低生活保障制度的通知》（国发〔2007〕19号，2007年7月11日）第四节。",
      "[^5]: 季衞東（上註1），頁95–96。",
      "[^6]: 笔者曾就此请教多位法官，意见并不一致。"
    ].join("\n"),
    raw: [
      "王名扬. 美国行政法[M]. 北京: 中国法制出版社, 1995: 18.",
      "王保树. 股份有限公司机关构造中的董事和董事会[C]//梁慧星, 主编. 民商法论丛: 第1卷. 北京: 法律出版社, 1994: 110.",
      "张新宝《侵权责任法》第5版 73-75页",
      "中华人民共和国民法典 第一千二百二十四条第一款第（一）项",
      "国务院关于在全国建立农村最低生活保障制度的通知 国发(2007)19号",
      "包郑照诉苍南县人民政府强制拆除房屋案，浙江省高级人民法院，1988年判决",
      "Charles A. Reich, The New Property, 73 Yale L.J. 733, 737–38 (1964).",
      "Ridge v Baldwin [1964] AC 40",
      "CHEVALLIER (J.), L'État de droit, Paris, Montchrestien, 4e éd., 2003, p. 16-29",
      "Roxin, Claus: Strafrecht Allgemeiner Teil, Bd. I, 4. Aufl., München 2006, § 15 Rn. 19",
      "Falzea A., L'offerta reale e la liberazione coattiva del debitore, Milano, Giuffrè, 1947, p. 34 s.",
      "Автор А. А. Название статьи // Государство и право. 2023. № 3. С. 17–30.",
      "我妻栄『新訂担保物権法（民法講義III）』（岩波書店，昭和46年）50頁",
      "王保树，股份有限公司机关构造中的董事和董事会，民商法论丛"
    ].join("\n"),
    form: { type: "book", authors: "哈特穆特·毛雷尔", nationality: "德", title: "行政法学总论", publisher: "法律出版社", year: "2000", is_translation: true, specific: true }
  };

  // src/ui/app.ts
  var typePills = (names2) => names2.map((n) => `<span class="pill kind">${esc(n)}</span>`).join("");
  var $ = (id) => document.getElementById(id);
  var input = (id) => $(id);
  var esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  var italics = (s, tag) => s.replace(/\*(.+?)\*/g, `<${tag}>$1</${tag}>`);
  var prefs = {
    get(key) {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, value);
      } catch {
      }
    }
  };
  function attempt(citation, source) {
    try {
      return { ...citation(), source };
    } catch (error) {
      return { error: error.message, source };
    }
  }
  var STATUS = {
    done: ["ok", "已按手册改写"],
    partial: ["gaps", "部分改写，其余保留原文"],
    kept: ["muted", "未识别，保留原文"]
  };
  var noteItem = (note2) => ({
    text: note2.text,
    source: note2.source,
    label: note2.label,
    status: note2.status,
    missing: note2.pieces.flatMap((p) => p.missing),
    warnings: [...new Set(note2.pieces.flatMap((p) => p.warnings))],
    types: noteTypes(note2)
  });
  var results = {
    items: [],
    show(items) {
      this.items = items;
      this.render();
    },
    footnote(item) {
      let html = italics(esc(item.text), "em");
      for (const label of new Set(item.missing)) html = html.split(`[${esc(label)}]`).join(`<span class="gap">[${esc(label)}]</span>`);
      return html;
    },
    row(item, i) {
      if (item.label !== void 0) return this.note(item, i);
      const source = item.source ? `<div class="src">原文：${esc(item.source)}</div>` : "";
      if (item.error) return `<div class="cite error"><div class="text">${esc(item.error)}</div>${source}<div class="meta"><span class="pill err">无法转换</span></div></div>`;
      const missing = item.missing;
      const pill = missing.length ? `<span class="pill gaps">缺 ${missing.length} 项：${esc(missing.join("、"))}</span>` : `<span class="pill ok">要素齐全</span>`;
      return `<div class="cite"><div class="text">${this.footnote(item)}</div>${source}<div class="meta">${typePills([typeName(item.type)])}${pill}<button class="btn small" data-copy="${i}">复制</button></div></div>`;
    },
    note(item, i) {
      const [cls, words] = STATUS[item.status];
      const missing = item.missing.length ? `<span class="pill gaps">缺 ${item.missing.length} 项：${esc(item.missing.join("、"))}</span>` : "";
      const warnings = item.warnings.map((w) => `<div class="warn">${esc(w)}</div>`).join("");
      const source = item.source !== item.text ? `<details class="src"><summary>原文</summary>${esc(item.source)}</details>` : "";
      return `<div class="cite note" data-label="[${esc(item.label)}]"><div class="text">${this.footnote(item)}</div>${warnings}${source}<div class="meta">${typePills(item.types)}<span class="pill ${cls}">${words}</span>${missing}<button class="btn small" data-copy="${i}">复制</button></div></div>`;
    },
    render() {
      $("results").innerHTML = this.items.length ? this.items.map((it, i) => this.row(it, i)).join("") : `<div class="empty">在左边粘贴原文或逐项填写，结果会显示在这里。</div>`;
      const count = (test) => this.items.filter(test).length;
      if (this.items.some((it) => it.status)) {
        $("tally").textContent = [
          [count((it) => it.status === "done"), "条已改写"],
          [count((it) => it.status === "partial"), "条部分改写"],
          [count((it) => it.status === "kept"), "条保留原文"],
          [count((it) => it.missing.length > 0), "条有缺项"]
        ].filter(([n]) => n).map(([n, s]) => `${n} ${s}`).join(" · ");
        return;
      }
      $("tally").textContent = [
        [count((it) => !it.error && !it.missing.length), "条齐全"],
        [count((it) => !it.error && it.missing.length > 0), "条有缺项"],
        [count((it) => Boolean(it.error)), "条无法转换"]
      ].filter(([n]) => n).map(([n, s]) => `${n} ${s}`).join(" · ");
    }
  };
  var toastTimer;
  function toast(message) {
    const el = $("toast");
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.hidden = true;
    }, 1600);
  }
  async function copy(texts) {
    const plain2 = texts.map((t) => t.replace(/\*(.+?)\*/g, "$1")).join("\n");
    const html = texts.map((t) => `<p>${italics(esc(t), "i")}</p>`).join("");
    const done = () => toast(texts.length > 1 ? `已复制 ${texts.length} 条` : "已复制");
    try {
      await navigator.clipboard.write([new ClipboardItem({
        "text/plain": new Blob([plain2], { type: "text/plain" }),
        "text/html": new Blob([html], { type: "text/html" })
      })]);
      done();
    } catch {
      try {
        await navigator.clipboard.writeText(plain2);
        done();
      } catch {
        toast("浏览器不允许复制，请手动选中文字复制");
      }
    }
  }
  function convertRaw() {
    const raw = $("raw").value;
    prefs.set("cmlc-raw", raw);
    const lines = raw.split("\n").map((s) => s.trim()).filter(Boolean);
    results.show(lines.map((line) => attempt(() => citeReference(line), line)));
  }
  var form = {
    id: (type, key) => `f-${type}-${key}`,
    field(type, [key, label, kind = "text", required, wide], values) {
      const id = this.id(type, key), v = values[key];
      if (kind === "check") return `<div class="field wide"><label class="check"><input type="checkbox" id="${id}"${v ? " checked" : ""}> ${esc(label)}</label></div>`;
      const cls = `field${wide || kind === "date" ? " wide" : ""}${required ? " req" : ""}`;
      if (kind === "date") {
        const d = v ?? {};
        const parts = [["year", "年"], ["month", "月"], ["day", "日"]].map(([k, unit]) => `<input type="number" id="${id}-${k}" placeholder="${unit}" aria-label="${esc(label)}${unit}" value="${esc(d[k] ?? "")}">`).join("");
        return `<div class="${cls}"><label for="${id}-year">${esc(label)}</label><div class="row" style="flex-wrap:nowrap">${parts}</div></div>`;
      }
      return `<div class="${cls}"><label for="${id}">${esc(label)}</label><input type="text" id="${id}" value="${esc(String(v ?? ""))}"></div>`;
    },
    build(type, values = {}) {
      $("type").value = type;
      $("fields").innerHTML = TYPES[type][1].map((spec) => this.field(type, spec, values)).join("");
    },
    read() {
      const type = $("type").value, fields = { type };
      const readers = {
        check: (id) => input(id).checked || void 0,
        date(id) {
          const [year2, month, day] = ["year", "month", "day"].map((k) => input(`${id}-${k}`).value || null);
          return year2 || month || day ? { year: year2, month, day } : void 0;
        },
        list: (id) => input(id).value.split(/[、,，]/).map((s) => s.trim()).filter(Boolean),
        enlist: (id) => input(id).value.split(/\s*;\s*/).filter(Boolean),
        text: (id) => input(id).value.trim()
      };
      for (const [key, , kind = "text"] of TYPES[type][1]) {
        const value = readers[kind](this.id(type, key));
        if (!blank(value)) fields[key] = value;
      }
      if (fields.is_translation && !("translators" in fields)) fields.translators = null;
      if (input("unverified").checked) fields.unverified = true;
      return fields;
    }
  };
  var articleBox = $("article");
  var download = { name: "", data: null, type: "" };
  var word = null;
  var SAVE_AS = {
    doc: "在 Word 中选“文件 → 另存为”，格式选“Word 文档（.docx）”",
    wps: "在 WPS 中选“文件 → 另存为”，格式选“Word 文件（.docx）”",
    pages: "在 Pages 中选“文件 → 导出为 → Word”",
    odt: "在 LibreOffice 中选“文件 → 另存为”，格式选“Word 2007–365（.docx）”",
    rtf: "在 Word 中选“文件 → 另存为”，格式选“Word 文档（.docx）”"
  };
  function convertPasted() {
    word = null;
    const text = articleBox.value;
    if (!text.trim()) {
      results.show([]);
      return;
    }
    const article2 = convertArticle(text);
    offer(article2.document, "article.revised.md");
    results.show(article2.notes.map(noteItem));
  }
  async function offerWord() {
    if (!word) return;
    const data = await reviseDocx(word.file, word.notes, { track: input("track").checked });
    offer(data, word.name.replace(/\.docx$/i, "") + ".revised.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  }
  async function convertFile(file) {
    const ext = file.name.match(/\.(\w+)$/)?.[1]?.toLowerCase() ?? "";
    try {
      if (ext in SAVE_AS) {
        offer(null, "");
        results.show([{ source: file.name, error: `网页版不能直接打开 .${ext} 文件。请${SAVE_AS[ext]}，再上传 .docx；处理后的 .docx 可以照常用原来的软件打开。` }]);
      } else if (ext === "docx") {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const notes = convertNotes(await docxFootnotes(bytes));
        if (!notes.length) {
          toast("这份 Word 文件里没有脚注");
          return;
        }
        articleBox.value = "";
        word = { file: bytes, name: file.name, notes };
        await offerWord();
        results.show(notes.map(noteItem));
      } else {
        articleBox.value = await file.text();
        convertPasted();
        offer(download.data, file.name.replace(/(\.\w+)?$/, ".revised$1"));
      }
    } catch (error) {
      toast(error.message);
    }
  }
  function offer(data, name, type = "text/plain;charset=utf-8") {
    Object.assign(download, { data, name, type });
    $("download-article").hidden = !data;
    $("download-article").textContent = /\.docx$/.test(name) ? "下载修订后的 Word 文件" : "下载修订稿";
    $("track-option").hidden = !word;
  }
  function save() {
    if (!download.data) return;
    const url = URL.createObjectURL(new Blob([download.data], { type: download.type }));
    const a = Object.assign(document.createElement("a"), { href: url, download: download.name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1e3);
  }
  var TABS = ["raw", "form", "article"];
  function showTab(name) {
    for (const tab of TABS) {
      $(`tab-${tab}`).setAttribute("aria-selected", String(tab === name));
      $(`pane-${tab}`).hidden = tab !== name;
    }
    prefs.set("cmlc-tab", name);
  }
  var rawBox = $("raw");
  $("type").innerHTML = GROUPS.map(([group, keys]) => `<optgroup label="${group}">${keys.map((k) => `<option value="${k}">${TYPES[k][0]}</option>`).join("")}</optgroup>`).join("");
  $("type").addEventListener("change", (e) => form.build(e.target.value));
  $("tab-raw").addEventListener("click", () => showTab("raw"));
  $("tab-form").addEventListener("click", () => showTab("form"));
  $("tab-article").addEventListener("click", () => showTab("article"));
  $("go-article").addEventListener("click", convertPasted);
  $("sample-article").addEventListener("click", () => {
    articleBox.value = SAMPLE.article;
    convertPasted();
  });
  $("clear-article").addEventListener("click", () => {
    articleBox.value = "";
    input("article-file").value = "";
    word = null;
    offer(null, "");
    results.show([]);
  });
  $("download-article").addEventListener("click", save);
  input("track").addEventListener("change", () => {
    offerWord().catch((error) => toast(error.message));
  });
  input("article-file").addEventListener("change", () => {
    const file = input("article-file").files?.[0];
    if (file) convertFile(file);
  });
  $("go-raw").addEventListener("click", convertRaw);
  $("sample-raw").addEventListener("click", () => {
    rawBox.value = SAMPLE.raw;
    convertRaw();
  });
  $("clear-raw").addEventListener("click", () => {
    rawBox.value = "";
    prefs.set("cmlc-raw", "");
    results.show([]);
  });
  $("go-form").addEventListener("click", () => results.show([attempt(() => cite(form.read()), "")]));
  $("clear-form").addEventListener("click", () => {
    form.build($("type").value);
    input("unverified").checked = false;
  });
  $("results").addEventListener("click", (e) => {
    const i = e.target.dataset.copy;
    if (i !== void 0) copy([results.items[Number(i)].text]);
  });
  $("copy-all").addEventListener("click", () => {
    const texts = results.items.filter((it) => !it.error).map((it) => it.text);
    if (texts.length) copy(texts);
  });
  form.build(SAMPLE.form.type, SAMPLE.form);
  rawBox.value = prefs.get("cmlc-raw")?.trim() ? prefs.get("cmlc-raw") : SAMPLE.raw;
  var saved = prefs.get("cmlc-tab");
  showTab(saved === "form" || saved === "article" ? saved : "raw");
  if (saved === "article") results.show([]);
  else convertRaw();
})();
