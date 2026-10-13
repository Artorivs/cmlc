/**
 * Tests the examples in README.md: expected outputs are read from its “转换：” lines,
 * so the tests follow the examples file. From example 18 on, the raw text is tested too:
 * 原始 → parse → cite → 转换.  Run: npm test
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import {
    docNumber,
    pages,
    roman,
    toInt,
    westernYear,
} from "../src/normalize.ts";
import {
    cite,
    parse,
    ParseError,
    UnverifiedSourceError,
    type Fields,
} from "../src/cmlc.ts";

const EXAMPLES = readFileSync(new URL("../README.md", import.meta.url), "utf8");

function examples(field: "原始" | "转换"): Map<number, string> {
    const out = new Map<number, string>();
    let current: number | null = null;
    for (const line of EXAMPLES.split("\n")) {
        const head = line.match(/^\*\*(\d+)\./);
        if (head) current = Number(head[1]);
        const m = line.match(new RegExp(`^- ${field}：(.+)$`));
        if (m && current !== null)
            out.set(
                current,
                field === "原始" ? m[1]!.match(/^`(.+?)`/)![1]! : m[1]!.trim()
            );
    }
    return out;
}
const expected = examples("转换");

const INPUTS: Record<number, Fields> = {
    1: {
        type: "book",
        authors: ["王名扬"],
        title: "美国行政法",
        publisher: "中国法制出版社",
        year: 1995,
        pages: 18,
    },
    2: {
        type: "book",
        authors: ["富勒"],
        nationality: "美",
        title: "法律的道德性",
        translators: "郑戈",
        publisher: "商务印书馆",
        year: 2005,
    },
    3: {
        type: "article",
        authors: ["季卫东"],
        title: "法律程序的意义——对中国法制建设的另一种思考",
        journal: "中国社会科学",
        year: 1993,
        issue: 1,
        pages: 91,
    },
    4: {
        type: "chapter",
        authors: ["王保树"],
        title: "股份有限公司机关构造中的董事和董事会",
        editors: ["梁慧星"],
        book_title: "民商法论丛",
        volume: "第1卷",
        publisher: "法律出版社",
        year: 1994,
        pages: 110,
    },
    5: {
        type: "statute",
        name: "中华人民共和国民法典",
        article: "一千二百二十四",
        paragraph: "一",
        item: "（一）",
    },
    6: {
        type: "normative",
        name: "国务院关于在全国建立农村最低生活保障制度的通知",
        doc_no: "国发(2007)19号",
        section: "四",
        subsection: "一",
    },
    7: {
        type: "case_gazette",
        name: "陆红霞诉南通市发展和改革委员会政府信息公开答复案",
        year: 2015,
        issue: 11,
    },
    8: {
        type: "en_article",
        authors: ["Charles A. Reich"],
        title: "The New Property",
        volume: 73,
        journal: "Yale L.J.",
        first_page: 733,
        pin: "737–38",
        year: 1964,
    },
    9: {
        type: "web",
        title: "全国打击治理农村诈骗工作现场会召开",
        site: "人民网",
        url: "http://society.people.com.cn/n1/2024/1012/c1008-40337761.html",
    },
    10: {
        type: "book",
        authors: ["张新宝"],
        title: "侵权责任法",
        edition: 5,
        pages: "73-75",
    },
    11: {
        type: "newspaper",
        authors: ["何海波"],
        title: "判决书上网",
        paper: "法制日报",
        date: { year: 2000 },
    },
    12: {
        type: "case",
        name: "包郑照等诉苍南县人民政府强制拆除房屋案",
        court: "浙江省高级人民法院",
        year: 1988,
    },
    13: {
        type: "book",
        authors: ["哈特穆特·毛雷尔"],
        nationality: "德",
        title: "行政法学总论",
        translators: null,
        publisher: "法律出版社",
        year: 2000,
        specific: true,
    },
    14: {
        type: "en_book",
        authors: [{ given: null, family: "Alford" }],
        title: "To Steal a Book Is an Elegant Offense",
        subtitle: null,
        publisher: "Stanford UP",
        year: 1995,
        specific: true,
    },
    15: { type: "statute", name: "公司法", amended: true, article: 16 },
    16: {
        type: "thesis",
        title: "游走在上帝与凯撒之间——美国宪法第一修正案中的政教关系研究",
        school: "中国政法大学",
        specific: true,
    },
};

const EXPECTED_MISSING: Record<number, string[]> = {
    10: ["出版社", "出版年份"],
    11: ["月", "日", "版面"],
    12: ["案号", "文书类型"],
    13: ["译者", "页码"],
    14: ["作者名", "副标题", "页码"],
    15: ["修订或修正年份"],
    16: ["作者", "答辩年份", "博士/硕士", "页码"],
};

describe("示例 1–17：结构化输入", () => {
    for (const [n, fields] of Object.entries(INPUTS)) {
        test(`示例 ${n}`, () => {
            const c = cite(fields);
            assert.equal(c.text, expected.get(Number(n)));
            assert.deepEqual(c.missing, EXPECTED_MISSING[Number(n)] ?? []);
        });
    }

    test("示例 17：未经核实的文献被拒绝", () => {
        assert.throws(
            () =>
                cite({
                    type: "article",
                    unverified: true,
                    title: "数字行政中的算法问责",
                    journal: "法学研究",
                    year: 2021,
                    issue: 4,
                }),
            UnverifiedSourceError
        );
    });
});

describe("示例 18 起：原始文本直接转换", () => {
    const raw = [...examples("原始")].filter(([n]) => n >= 18);
    test("至少有 28 个原始文本示例", () => assert.ok(raw.length >= 28));
    for (const [n, text] of raw)
        test(`示例 ${n}`, () =>
            assert.equal(cite(parse(text)).text, expected.get(n)));
});

describe("原始文本：其他写法", () => {
    const cases: Record<string, string> = {
        "王名扬. 美国行政法[M]. 北京: 中国法制出版社, 1995: 18.":
            expected.get(1)!,
        "季卫东. 法律程序的意义——对中国法制建设的另一种思考[J]. 中国社会科学, 1993(1): 91.":
            expected.get(3)!,
        "中华人民共和国民法典 第一千二百二十四条第一款第（一）项":
            expected.get(5)!,
        "Charles A. Reich, The New Property, 73 Yale L.J. 733, 737–38 (1964).":
            expected.get(8)!,
        "国务院关于在全国建立农村最低生活保障制度的通知 国发(2007)19号":
            "《国务院关于在全国建立农村最低生活保障制度的通知》，国发〔2007〕19号。",
        "何海波. 判决书上网[N]. 法制日报, 2000-05-01(3).":
            "何海波：《判决书上网》，载《法制日报》2000年5月1日，第3版。",
        "Ridge v Baldwin [1964] AC 40": "*Ridge v. Baldwin* [1964] AC 40.",
        "James Bagg's Case (1615) 11 Co. Rep. 93b":
            "*James Bagg's Case* (1615) 11 Co. Rep. 93b.",
        "Иванов И. И. Гражданское право. 2-е изд. М.: Статут, 2010. С. 15.":
            "И. И. Иванов. *Гражданское право* (2-е изд.). Статут, 2010. С. 15.",
        "著者「論文名」法学協会雑誌100巻1号（1983年）1頁":
            "著者「論文名」法学協会雑誌100巻1号（1983年）1頁。",
        "Claus Roxin, Strafrecht Allgemeiner Teil, Band I, 4. Aufl., C.H.Beck, 2006, § 15 Rn. 19.":
            "Claus Roxin, Strafrecht Allgemeiner Teil, Band I, 4. Aufl., C.H.Beck, 2006, § 15 Rn. 19.",
        "Andrée Dupont et Hélène Martin, Les obligations, Paris, LGDJ, 2015, p. 4":
            "Andrée Dupont et Hélène Martin, *Les obligations*, LGDJ, 2015, p. 4.",
    };
    for (const [raw, want] of Object.entries(cases))
        test(raw, () => assert.equal(cite(parse(raw)).text, want));

    test("缺项会列出", () => {
        assert.deepEqual(
            cite(
                parse(
                    "Roxin, Claus: Strafrecht Allgemeiner Teil, Bd. I, 4. Aufl., München 2006, § 15 Rn. 19"
                )
            ).missing,
            ["出版社"]
        );
        assert.deepEqual(
            cite(
                parse(
                    "包郑照诉苍南县人民政府强制拆除房屋案，浙江省高级人民法院，1988年判决"
                )
            ).missing,
            ["案号", "文书类型"]
        );
    });

    test("识别不了的写法", () => {
        for (const raw of [
            "随便写的一段话",
            "某标准[S]. 北京: 中国标准出版社, 2020.",
            "Martin Schwab, in Münchener Kommentar BGB, Band 6, 6. Aufl., C.H.Beck, 2013, § 817 Rn. 9.",
        ]) {
            assert.throws(() => parse(raw), ParseError, raw);
        }
    });
});

describe("规则细节", () => {
    test("数字、页码、文号、罗马数字、年号", () => {
        assert.equal(toInt("一千二百二十四"), 1224);
        assert.equal(toInt("二十"), 20);
        assert.equal(toInt("（一）"), 1);
        assert.equal(pages("737–38"), "737-738");
        assert.equal(pages("55, 64, 68"), "55、64、68");
        assert.equal(docNumber("法发[1993]36号"), "法发〔1993〕36号");
        assert.equal(roman(14), "XIV");
        assert.equal(westernYear("昭和46年"), "1971");
        assert.equal(westernYear("平成元年"), "1989");
    });

    test("条之一与法律版本", () => {
        assert.equal(
            cite({
                type: "statute",
                name: "刑法",
                article: 17,
                article_suffix: "之一",
            }).text,
            "《刑法》第17条之一。"
        );
        assert.equal(
            cite({
                type: "statute",
                name: "公司法",
                version: "2013年修正",
                article: 36,
            }).text,
            "《公司法》（2013年修正）第36条。"
        );
    });

    test("微信公众号不写链接", () => {
        const c = cite({
            type: "wechat",
            authors: ["某作者"],
            title: "某文章",
            account: "中国法律评论",
            date: { year: 2019, month: 11, day: 1 },
        });
        assert.equal(
            c.text,
            "某作者：《某文章》，载微信公众号“中国法律评论”2019年11月1日。"
        );
    });

    test("网页没有任何日期时要求上传日期", () => {
        const c = cite({
            type: "web",
            title: "某页面",
            site: "某网站",
            url: "https://example.org/a",
        });
        assert.equal(
            c.text,
            "《某页面》，载某网站[上传日期]，https://example.org/a。"
        );
    });

    test("德文缩写结尾不重复句点", () => {
        assert.equal(
            cite({
                type: "de_article",
                authors: ["Claus Roxin"],
                title: "X",
                journal: "JuS",
                year: 2012,
                pages: "238 f.",
            }).text,
            "Claus Roxin, X, JuS 2012, S. 238 f."
        );
    });
});
