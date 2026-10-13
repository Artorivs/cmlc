/**
 * Books and articles in English, French, German and Italian.
 *
 * The language is told by marker words (Aufl., éd., a cura di …); English is the fallback.
 * A reference is split at ', ' into author, title and parts that the language's Lexicon
 * classifies; a part nobody claims is the publisher (or, for an article, the journal).
 */
import type { Fields } from "../entry.ts";
import { groups, type Parser } from "./util.ts";

interface Lexicon {
    lang: string;
    marker: RegExp;
    edition: RegExp;
    locator: RegExp;
    volume: RegExp;
    role: string; // how an editor's role is written: (Hrsg.), (dir.), ed.
}

const NOTHING = /(?!)/;
const lexicon = (
    lang: string,
    marker: RegExp,
    edition: RegExp,
    locator: RegExp,
    volume = NOTHING,
    role = "({})"
): Lexicon => ({ lang, marker, edition, locator, volume, role });

const GERMAN = lexicon(
    "de",
    /Aufl\.|Rn\.|Hrsg\.|\bBd\.|\bS\.\s*\d|\bff?\.(?:\s|$)|[äöüßÄÖÜ]|§|\(\d{4}\),\s*\d/,
    /^(?<edition>\d+)\.\s*Aufl\.?(?:\s+(?<year>\d{4}))?$/,
    /^(?<pages>(?:§|Rn\.|S\.|Art\.).+)$/,
    /^(?:Band|Bd\.)\s*(?<volume>\S+)$/
);
const ITALIAN = lexicon(
    "it",
    /a cura di|trad\. it\.|\bss\.|Giuffrè|Cedam|Zanichelli|Utet|Jovene|Il Mulino|\d\s*ª|\bRiv\.|\bdell['’]|\b(?:Milano|Torino|Roma|Napoli|Padova|Bologna|Firenze|della|delle|dello|degli|del|nel|nella|il|gli|dei)\b/,
    /^(?<edition>\d+)\s*[ªa°]?\s*ed\.?$/,
    /^pp?\.\s*(?<pages>.+)$/,
    /^(?:vol\.\s*)?(?<volume>[IVXLC]+|\d{1,3})$/
);
const FRENCH = lexicon(
    "fr",
    /[«»]|(?:^|[^\p{L}])éd\.|\(dir\.\)|Mélanges|Thèse|\bop\. cit\.|\bPUF\b|LGDJ|Dalloz|Montchrestien|Economica|\bParis\b|\bn°|\b(?:de la|du|des|les|pour|dans)\b|[éèêàçœ]/u,
    /^(?<edition>\d+)(?:e|re|ème)\s*éd\.?$/,
    /^pp?\.\s*(?<pages>.+)$/
);
const ENGLISH = lexicon(
    "en",
    /(?:)/,
    /^(?<edition>\d+(?:st|nd|rd|th|d))\s+edn?\.?$/,
    /^(?:pp?\.|at)\s*(?<pages>.+)$/,
    NOTHING,
    "{}"
);
const LEXICONS = [GERMAN, ITALIAN, FRENCH, ENGLISH]; // tried in this order; English always matches

/** 不写出版地（第98条）. */
const CITIES = new Set([
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
    "Chicago",
]);
const ISSUE = /^(?:n°|n\.|No\.)\s*(?<issue>\d+)$/;
const YEAR = /^(?:(?<before>.*?)\s+)?(?<year>\d{4})\.?$/;

// ── authors ────────────────────────────────────────────────────────────────

const WORD = String.raw`(?:[A-ZÀ-Þ][\p{L}'’.\-]*|von|van|de|der|da|di|du|zu|le|la)`;
const INVERTED = new RegExp(
    String.raw`^(?<family>${WORD}(?:\s+${WORD})*),\s*(?<given>${WORD}(?:\s+${WORD})*)$`,
    "u"
);
const CAPS = /^(?<family>[A-ZÀ-Þ'’-]{2,})\s*\((?<given>[^)]+)\)$/u;
const INITIALS_AFTER =
    /^(?<family>[A-ZÀ-Þ][\p{L}'’-]+)\s+(?<given>(?:[A-Z]\.\s*)+)$/u;
const ET_AL = /\s*(?:et al\.?|u\.\s?a\.|e altri|and others)$/;
const ROLE = /\s*\(?(?<role>Hrsg\.|dir\.|a cura di|eds?\.)\)?$/;
const JOINERS = /\s*(?:&|\/|;|(?<!\p{L})(?:and|et|und|e)(?!\p{L}))\s*/u;

const titleCase = (s: string) =>
    s.replace(/\p{L}+/gu, (w) => w[0] + w.slice(1).toLowerCase());

/** 名在前、姓在后（第96条）: 'Roxin, Claus' / 'CHEVALLIER (J.)' / 'Falzea A.' → given + family. */
function person(name: string): string {
    name = name.trim();
    for (const pattern of [INVERTED, CAPS, INITIALS_AFTER]) {
        const g = name.match(pattern)?.groups;
        if (g)
            return `${g.given!.trim()} ${g.family === g.family!.toUpperCase() ? titleCase(g.family!) : g.family}`;
    }
    return name;
}

function people(text: string, lex: Lexicon): Fields {
    const fields: Fields = {};
    const etAl = text.match(ET_AL);
    if (etAl) [text, fields.et_al] = [text.slice(0, etAl.index), true];
    const role = text.match(ROLE);
    if (role)
        [text, fields.role] = [
            text.slice(0, role.index),
            lex.role.replace("{}", role.groups!.role!),
        ];
    return {
        authors: text
            .split(JOINERS)
            .filter((p) => p.trim())
            .map(person),
        ...fields,
    };
}

/** 'Roxin, Claus: Titel, …' (German list form) or 'Author, Title, …'. */
function splitAuthor(text: string): [string, string] | null {
    let g = text.match(
        /^(?<author>[^:,]+,[^:,]+(?:\/[^:,]+,[^:,]+)*):\s+(?<rest>.+)$/
    )?.groups;
    if (g && g.author!.split("/").every((p) => INVERTED.test(p.trim())))
        return [g.author!.replace(/\//g, " / "), g.rest!];
    g = text.match(/^(?<author>[^,]+?),\s+(?<rest>.+)$/)?.groups;
    return g ? [g.author!, g.rest!] : null;
}

// ── English parenthetical styles, rewritten into plain parts ───────────────

const OSCOLA =
    /\s*\((?:(?<edition>\d+\w*)\s+edn?,\s*)?(?<publisher>[^()\d][^()]*?)\s+(?<year>\d{4})\)\s*(?<pages>[\d–-]+)?\.?$/;
const BLUEBOOK_BOOK =
    /\s+(?<pages>\d+(?:[–-]\d+)?)?\s*\((?:(?<edition>\d+\w*)\s+ed\.\s+)?(?<year>\d{4})\)\.?$/;

/** 'Title (Stanford University Press 1995) 98' / 'Title 98 (10th ed. 1985)' → 'Title, …, 1995, p. 98'. */
function plain(text: string): string {
    for (const pattern of [OSCOLA, BLUEBOOK_BOOK]) {
        const m = text.match(pattern);
        if (!m) continue;
        const d = m.groups!;
        const parts = [
            d.edition && `${d.edition} ed.`,
            d.publisher,
            d.year,
            d.pages && `p. ${d.pages}`,
        ];
        return [text.slice(0, m.index), ...parts.filter(Boolean)].join(", ");
    }
    return text;
}

// ── the parser ─────────────────────────────────────────────────────────────

/** Fields the lexicon recognises, and the parts left over (publisher, journal, title fragments). */
function classify(parts: string[], lex: Lexicon): [Fields, string[]] {
    const fields: Fields = {},
        left: string[] = [];
    for (let part of parts) {
        const m = [lex.edition, lex.locator, lex.volume, ISSUE]
            .map((p) => part.match(p))
            .find(Boolean);
        if (m) {
            Object.assign(fields, groups(m));
            continue;
        }
        const year = part.match(YEAR)?.groups;
        if (year) [fields.year, part] = [year.year, year.before ?? ""];
        if (part && !CITIES.has(part)) left.push(part);
    }
    if (lex === GERMAN && fields.volume)
        fields.volume = `Band ${fields.volume}`;
    return [fields, left];
}

const GERMAN_ARTICLE =
    /^(?<title>.+?),\s*(?<journal>[^,]+?)\s+(?<volume>\d+)\s+\((?<year>\d{4})\),\s*(?<pages>.+?)\.?$/;
const GUILLEMETS = /^«\s*(?<title>.+?)\s*»\s*,?\s*(?<rest>.*)$/;
const inCollection = (part: string) => part.startsWith("in ");

/** Claus Roxin, Strafrecht AT, Bd. I, 4. Aufl., München 2006 / F. Zenati, « … », RTD civ. 1993, p. 305 s. */
const european: Parser = (text) => {
    if (!/[A-Za-z]/.test(text) || !/\d{4}/.test(text)) return null;
    const lex = LEXICONS.find((l) => l.marker.test(text))!;
    text = text.trim().replace(/\.+$/, "");
    const split = splitAuthor(lex === ENGLISH ? plain(text) : text);
    if (!split) return null;
    const [author, rest] = split,
        who = people(author, lex);
    const article = lex === GERMAN ? rest.match(GERMAN_ARTICLE) : null;
    if (article) return { type: "de_article", ...who, ...groups(article) };

    const quoted = rest.match(GUILLEMETS)?.groups;
    const [title, ...parts] = quoted
        ? [quoted.title!, ...quoted.rest!.split(/,\s+/)]
        : rest.split(/,\s+/);
    const kind =
        quoted || (lex === ITALIAN && parts.some(inCollection))
            ? "article"
            : "book";
    if (kind === "book" && [title!, ...parts].some(inCollection)) return null; // a contribution to a collection: use the form
    const [fields, left] = classify(parts, lex);
    if (kind === "article") {
        return left.length
            ? {
                  type: `${lex.lang}_article`,
                  ...who,
                  title,
                  journal: left[0]!.replace(/^in /, "").trim(),
                  ...fields,
              }
            : null;
    }
    return {
        type: `${lex.lang}_book`,
        ...who,
        title: [title, ...left.slice(0, -1)].join(", "),
        ...fields,
        publisher: left.at(-1) ?? null,
    };
};

export const parsers: Parser[] = [european];
