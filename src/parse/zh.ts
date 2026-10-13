/** Chinese legal sources and loosely written Chinese notes. */
import type { Fields } from "../entry.ts";
import * as normalize from "../normalize.ts";
import {
    closing,
    compact,
    cut,
    date,
    groups,
    matched,
    search,
    splitTop,
    type Parser,
} from "./util.ts";

// ── statutes and documents ─────────────────────────────────────────────────

const NUMERAL = "[\\d一二三四五六七八九十百千零〇两]+";
const STATUTE = new RegExp(
    `^《?(?<name>[^《》\\s第]+?(?:法典|法|条例|规定|办法|解释))》?\\s*` +
        `第(?<article>${NUMERAL})条(?<article_suffix>之[一二三四五六七八九十]+)?` +
        `(?:第(?<paragraph>${NUMERAL})款)?(?:第[（(]?(?<item>${NUMERAL})[）)]?项)?$`
);
const DOCUMENT =
    /^《?(?<name>.+?)》?[\s，,]*[（(]?(?<doc_no>[一-龥]+[(（[【［〔]\d{4}[)）\]】］〕]\d+号)[）)]?$/;

/** 中华人民共和国民法典 第一千二百二十四条第一款第（一）项 */
const statute: Parser = (text) => matched(STATUTE, text, "statute");

/** 国务院关于……的通知 国发(2007)19号 */
const document: Parser = (text) => {
    const fields = matched(DOCUMENT, text, "normative");
    return fields && String(fields.name).length >= 4 ? fields : null;
};

// ── laws and documents with their dates, as articles cite them ──────────────

/** 制定机关 before the title: 国务院、中共中央办公厅、某某调查组 … */
const ISSUER =
    /^[^《》，,。；;：:\s]{2,60}?(?:院|部|局|委|会|厅|组|中央|政府|办公室|办|署|室|党委|省委|市委|司|处)$/;
/** 国发〔2005〕11号, 国务院令第493号, 应急管理部令第11号, CCAR-395. */
const DOC_NO =
    /^(?:[一-龥]+〔\d{4}〕\d+号|[一-龥]*令第\d+号|[A-Z]{2,}-\d+[A-Z\d-]*)$/;
const LAW_NAME =
    /(?:法典|法|条例|规定|办法|规则|细则|解释|修正案(?:（[^）]+）)?)(?:（(?:试行|草案)）)?$/;
const BARE_LAW =
    /^((?:中华人民共和国)?[^《》（(，,。；;：:\s第]{1,40}?(?:法典|法|条例|修正案（[^）]+）))(?=[（(]\d{4}年|第\s*[\d一二三四五六七八九十百千]+\s*条)/;
const ALIAS = /^(?:以下简称|下称|简称)[「“"](?<alias>[^」”"]+)[」”"]$/;
const DATE = /(?<year>\d{4})年(?:(?<month>\d{1,2})月(?:(?<day>\d{1,2})日)?)?/;
const EVENT = /(通过|公布|发布|印发|施行|成文|批准)(?:并施行)?$/;

interface Parts {
    doc_no?: string;
    version?: string;
    year?: string;
    repealed?: boolean;
    alias?: string;
    unused: string[];
}
type Dated = [rank: number, date: Fields["date"], event: string];

/** What the brackets and commas after a title say: 文号, 修订/修正, dates, 已废止, 下称…. Returns false for a part it cannot place. */
function place(part: string, found: Parts, dates: Dated[]): boolean {
    part = part.trim();
    const number = normalize.docNumber(part)!;
    if (DOC_NO.test(number)) return Boolean((found.doc_no = number));
    const alias = part.match(ALIAS);
    if (alias) return Boolean((found.alias = alias.groups!.alias));
    if (/(?:废止|失效)$/.test(part)) return Boolean((found.repealed = true));
    const amended = part.match(/(修订|修正)$/);
    if (amended && DATE.test(part)) {
        const year = Math.max(
            ...[...part.matchAll(/(\d{4})年/g)].map((m) => Number(m[1]))
        );
        if (!found.version || Number(found.version.slice(0, 4)) <= year)
            found.version = `${year}年${amended[1]}`;
        return true;
    }
    const when = part.match(DATE);
    if (when && (EVENT.test(part) || when[0] === part)) {
        const { year, month, day } = when.groups!;
        const rank = /公布|发布|印发/.test(part) ? 0 : when[0] === part ? 1 : 2;
        dates.push([
            rank * 10 + (day ? 0 : month ? 1 : 2),
            { year, month, day },
            part.match(EVENT)?.[1] ?? "",
        ]);
        if (when[0] === part && !month) found.year = year;
        return true;
    }
    return false;
}

/** 条款项目用阿拉伯数字（第70条）: '第七条第（一）项' → '第7条第1项'. */
const provisionText = (text: string): string =>
    text.replace(
        /第[（(]?([一二三四五六七八九十百千零〇两\d]+)[）)]?(条|款|项|目)/g,
        (_, n: string, unit: string) => `第${normalize.toInt(n)}${unit}`
    );

/**
 * 中共中央、国务院：《国家突发事件总体应急预案》（2025年2月印发，新华社2025年2月25日发布）第1.3节
 * 《中华人民共和国安全生产法》（2002年通过，2009年、2014年及2021年修正）第86条第1款
 */
const legal: Parser = (text) => {
    text = text.replace(/[。.]\s*$/, "");
    const open = text.indexOf("《");
    if (open < 0) {
        // 中华人民共和国监察法（2018年3月20日通过……）第2、3条: a law named without 书名号
        const bare = text.match(BARE_LAW);
        return bare
            ? legal(`《${bare[1]}》${text.slice(bare[1]!.length)}`)
            : null;
    }
    const before = text
        .slice(0, open)
        .replace(/\s*[：:]\s*$/, "")
        .trim();
    if (before && !ISSUER.test(before)) return null;
    const end = closing(text, open);
    if (end < 0) return null;
    const name = text.slice(open + 1, end - 1);
    let rest = text.slice(end).trim();
    const found: Parts = { unused: [] },
        dates: Dated[] = [];
    if (/^[（(]/.test(rest)) {
        const close = closing(rest, 0);
        if (close < 0) return null;
        for (const { part } of splitTop(rest.slice(1, close - 1), "，,；;"))
            if (!place(part, found, dates)) found.unused.push(part.trim());
        rest = rest.slice(close).trim();
    }
    while (/^[，,]/.test(rest)) {
        // ，已由……废止 / ，应急管理部2022年1月21日公布
        const [{ part }] = splitTop(rest.slice(1), "，,");
        if (!place(part!, found, dates)) break;
        rest = rest.slice(1 + part!.length).trim();
    }
    const where = rest.match(
        /^[，,]?\s*(第(?:[^，,。；;：:（(]|[（(][一二三四五六七八九十\d]+[）)])+)$/
    );
    if (rest && !where) return null;
    const locator = where ? provisionText(where[1]!.trim()) : null;
    const [, date, event] = dates.sort((a, b) => a[0] - b[0])[0] ?? [];
    const site = found.unused.find((p) => /^载.+(?:网站|网)$/.test(p));
    if (site && date) {
        // （2020年8月27日，载该部网站）: a page on a website (第51条)
        const unused = found.unused.filter((p) => p !== site);
        return compact({
            type: "web",
            title: name,
            site: site.slice(1).replace(/^该(?:部|局|委|院|会|厅|署)/, before),
            date,
            unused,
        });
    }
    const statute =
        !/关[于於]/.test(name) &&
        LAW_NAME.test(name) &&
        !(found.doc_no && !found.doc_no.includes("令"));
    if (statute) {
        const version =
            found.version ??
            (found.year && dates.length === 1 && !found.doc_no
                ? `${found.year}年`
                : undefined);
        return compact({
            type: "statute",
            name,
            issuer: before,
            version,
            repealed: found.repealed,
            locator,
            alias: found.alias,
            doc_no: found.doc_no,
            unused: found.unused,
        });
    }
    return compact({
        type: "normative",
        name,
        issuer: before,
        doc_no: found.doc_no,
        date,
        date_event: event === "通过" ? event : null,
        repealed: found.repealed,
        locator,
        alias: found.alias,
        unused: found.unused,
    });
};

/** 《标题》，应急管理部网站，2025年12月18日 — a web page cited by site and date. */
const WEB_NOTE =
    /^(?:(?<authors>[^《》：:，,]{2,30})[：:])?《(?<title>.+)》[，,]\s*(?<site>[^，,《》]+?(?:网站|网|官网))[，,]?\s*(?<date>\d{4}年\d{1,2}月\d{1,2}日)(?:[，,]\s*(?<url>https?:\/\/\S+))?$/;
const webNote: Parser = (text) => {
    const m = text.match(WEB_NOTE);
    if (!m) return null;
    const { authors, date: when, ...fields } = groups(m);
    return {
        type: "web",
        ...fields,
        ...(authors ? { authors: [String(authors)] } : {}),
        date: date(String(when)),
    };
};

// ── cases ──────────────────────────────────────────────────────────────────

const CASE_NAME = /(?<name>[^，,。：:；;\s]+?案)(?=[，,。：:；;\s（(]|$)/;
const CASE_NO =
    /[（(〔[](?<year>\d{4})[）)〕\]]\s*(?<case_no>[^号，,。\s]+?)\s*号/;
const COURT = /(?<court>[一-龥]+?法院)/;
const DOC_TYPE =
    /(?<doc_type>(?:民事|刑事|行政|执行|国家赔偿|赔偿)(?:判决书|裁定书|调解书|决定书))/;
const JUDGED = /\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日/;

/** The case name, wherever it stands; a missing name becomes a gap. */
const caseOf = (text: string, type: string, fields: Fields): Fields => ({
    type,
    name: search(CASE_NAME, text, "name"),
    ...compact(fields),
});

/** ……案，人民法院案例库 2023-01-2-087-001 */
const caseLibrary: Parser = (text) => {
    const number =
        text.includes("案例库") && text.match(/\d{4}-\d{2}-\d-\d{3}-\d{3}/);
    return number
        ? caseOf(text, "case_library", { library_no: number[0] })
        : null;
};

/** 指导案例24号：……案 — the release year stays a gap unless given. */
const caseGuiding: Parser = (text) => {
    const m = text.match(/指导(?:性)?案例\s*(?:第\s*)?(?<number>\d+)\s*号/);
    if (!m) return null;
    return {
        ...caseOf(text, "case_guiding", { number: m.groups!.number }),
        year: search(/(?<year>\d{4})\s*年?/, cut(text, m), "year"),
    };
};

/** ……案，最高人民法院公报 2015-11 / 《最高人民法院公报》2015年第11期 */
const caseGazette: Parser = (text) => {
    const m = text.match(
        /《?(?<gazette>[^《》\s，,、]*公报)》?\s*[,，]?\s*(?<year>\d{4})\s*(?:年\s*第?|[-—/.]|[（(])\s*(?<issue>\d{1,2})\s*[期）)]?/
    );
    return m && caseOf(text, "case_gazette", groups(m));
};

/** ……案，浙江省高级人民法院（1988）……号民事判决书 — needs a case number, or a case name and a court. */
const judgment: Parser = (text) => {
    const number = text.match(CASE_NO),
        name = text.match(CASE_NAME);
    const rest = name ? text.slice(name.index! + name[0].length) : text;
    const court = search(COURT, rest, "court");
    if (!(number || (name && court))) return null;
    const judged = rest.match(JUDGED);
    return caseOf(text, "case", {
        court,
        year:
            number?.groups!.year ?? search(/(?<year>\d{4})\s*年/, rest, "year"),
        case_no: number?.groups!.case_no,
        doc_type: search(DOC_TYPE, rest, "doc_type"),
        date: judged && date(judged[0]),
    });
};

// ── loosely written notes: 作者《题名》+ whatever follows ───────────────────

const NOTE = {
    author: /^\s*(?:[[［【（(](?<nationality>[^\]］】）)]{1,4})[\]］】）)])?\s*(?<names>.*?)\s*(?:著|撰)?\s*[：:，,]?\s*$/,
    inJournal:
        /(?<year>\d{4})\s*(?:年\s*第\s*(?<issue>\d+)\s*期|[（(]\s*(?<issue2>\d+)\s*[）)])/,
    inBook: /载\s*(?:(?<editors>[^《》：:，,]+?)(?<editor_role>主编|编著|编译|编)\s*[：:]?\s*)?《/,
    edition:
        /[（(]?第\s*(?<edition>\d+)\s*版[）)]?|[（(]?(?<edition_name>修订版|增订版)[）)]?/,
    volume: /第[\d一二三四五六七八九十]+[卷册辑](?:第[\d一二三四五六七八九十]+[卷册辑分册]+)?/,
    translators: /(?<translators>[^，,。\s》《]+?)\s*译(?![者本文林])/,
    publisher:
        /(?<publisher>[^，,。\s》《\d]+?(?:出版社|书局|印书馆|书店|出版公司))/,
    year: /(?<!\d)(?<year>1[89]\d{2}|20\d{2})(?!\d|\s*页|\s*[-–—~～]\s*\d)/,
    pages: /第?\s*(?<pages>\d+(?:\s*[-–—~～]\s*\d+)?)\s*页(?<more>以下)?/,
};

/** '第77页以下' → '77以下'. */
const pagesOf = (text: string): string | null => {
    const m = text.match(NOTE.pages);
    return m ? m.groups!.pages! + (m.groups!.more ?? "") : null;
};

/** Book details searched for anywhere in the text after the title. */
const imprint = (text: string): Fields => ({
    volume: search(NOTE.volume, text, 0),
    publisher: search(NOTE.publisher, text, "publisher"),
    year: search(NOTE.year, text, "year"),
});

/** 张新宝《侵权责任法》第5版 73-75页 / 季卫东：《……》，载《中国社会科学》1993年第1期 */
const note: Parser = (text) => {
    const titles = [...text.matchAll(/《([^《》]+)》/g)].map((m) => m[1]!);
    if (!titles.length) return null;
    const head = text.slice(0, text.indexOf("《")),
        tail = text.slice(text.indexOf("》") + 1);
    const author = head.match(NOTE.author)!.groups!;
    const fields: Fields = {
        title: titles[0],
        authors: author
            .names!.split(/[、，,]/)
            .map((s) => s.trim())
            .filter(Boolean),
        nationality: author.nationality,
        pages: pagesOf(tail),
    };
    const journal = tail.match(NOTE.inJournal),
        host = tail.match(NOTE.inBook);
    if (titles.length > 1 && journal) {
        const { year, issue, issue2 } = journal.groups!;
        Object.assign(fields, {
            type: "article",
            journal: titles[1],
            year,
            issue: issue ?? issue2,
        });
    } else if (titles.length > 1 && host) {
        Object.assign(fields, {
            type: "chapter",
            book_title: titles[1],
            editors: host.groups!.editors,
            editor_role: host.groups!.editor_role,
            translators: search(
                NOTE.translators,
                tail.slice(0, host.index),
                "translators"
            ),
            ...imprint(tail.slice(host.index! + host[0].length)),
        });
    } else {
        const edition = tail.match(NOTE.edition)?.groups;
        Object.assign(fields, {
            type: "book",
            edition: edition && (edition.edition ?? edition.edition_name),
            translators: search(NOTE.translators, tail, "translators"),
            ...imprint(tail),
        });
    }
    return compact(fields);
};

export const parsers: Parser[] = [
    statute,
    document,
    legal,
    webNote,
    caseLibrary,
    caseGuiding,
    caseGazette,
    judgment,
    note,
];
