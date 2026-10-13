/**
 * Command line.
 *
 *   node src/cli.ts refs.json              # one object or a list, each with a "type"
 *   node src/cli.ts --raw "王名扬. 美国行政法[M]. 北京: 中国法制出版社, 1995: 18."
 *   node src/cli.ts --raw-file refs.txt    # one raw reference per line
 *   node src/cli.ts --article paper.md > paper.revised.md   # a whole article (.md or .txt)
 *   node src/cli.ts --article paper.docx                     # writes paper.revised.docx (also .doc .odt .rtf .pages)
 */
import { execFileSync } from "node:child_process";
import {
    copyFileSync,
    existsSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import { parseArgs } from "node:util";
import {
    convertArticle,
    convertNotes,
    citeReference,
    noteTypes,
    type Note,
} from "./article.ts";
import { cite, typeName, type Fields } from "./cmlc.ts";
import { docxFootnotes, reviseDocx } from "./docx.ts";

const HELP = `用法：node src/cli.ts [JSON 文件] [--raw 原始文本] [--raw-file 文本文件] [--article 文章 [--out 输出文件] [--clean]]
按《法学引注手册》（第二版）格式化引注。文献类型和缺项（写成 [字段名]）在标准错误输出中列出。
--article 读取整篇文章，改写其中的脚注，每条脚注的文献类型和处理情况写到标准错误输出。
  Markdown（[^1]: 脚注）或每行一条注释的文本：改写后的文章写到标准输出。
  Word（.docx）：写出“原名.revised.docx”（或 --out 指定的文件），改动以修订（可逐条接受或拒绝）标出；
  加 --clean 则直接替换，不留修订痕迹。
  .doc、.odt、.rtf、.pages：需要安装 LibreOffice，先转为 .docx 处理，再存回原格式（.pages 存为 .docx）。`;

/** Formats read through LibreOffice, and the format each is saved back in. */
const OFFICE: Record<string, string> = {
    ".doc": "doc",
    ".odt": "odt",
    ".rtf": "rtf",
    ".wps": "doc",
    ".pages": "docx",
};

const STATUS = {
    done: "已改写",
    partial: "部分改写",
    kept: "保留原文",
} as const;

/** What happened to each note, for the person checking the result. */
function report(notes: Note[]): void {
    for (const note of notes) {
        const missing = note.pieces.flatMap((p) => p.missing),
            warnings = note.pieces.flatMap((p) => p.warnings);
        const types = noteTypes(note);
        console.error(
            `[^${note.label}] ${STATUS[note.status]}${types.length ? `（${types.join("、")}）` : ""}` +
                `${missing.length ? `；缺少：${missing.join("、")}` : ""}`
        );
        for (const w of new Set(warnings)) console.error(`  ${w}`);
    }
    const count = (s: Note["status"]) =>
        notes.filter((n) => n.status === s).length;
    console.error(
        `共 ${notes.length} 条脚注：${count("done")} 条已改写，${count("partial")} 条部分改写，${count("kept")} 条保留原文。`
    );
}

/** LibreOffice, headless: converts `path` into `dir` as `format`, returning the new file. */
function office(path: string, format: string, dir: string): string {
    try {
        execFileSync(
            "soffice",
            ["--headless", "--convert-to", format, "--outdir", dir, path],
            { stdio: "ignore" }
        );
    } catch {
        throw new Error(
            `处理 ${extname(path)} 文件需要 LibreOffice（soffice 命令）。也可以先在 Word 或 Pages 中把文件另存为 .docx。`
        );
    }
    const made = join(dir, `${basename(path, extname(path))}.${format}`);
    if (!existsSync(made))
        throw new Error(
            `LibreOffice 无法打开 ${basename(path)}。请先在 Word 或 Pages 中把文件另存为 .docx。`
        );
    return made;
}

async function document(
    path: string,
    out: string | undefined,
    track: boolean
): Promise<number> {
    const ext = extname(path).toLowerCase();
    const back = OFFICE[ext] ?? "docx";
    const target = out ?? path.slice(0, -ext.length) + `.revised.${back}`;
    const work = mkdtempSync(join(tmpdir(), "cmlc-"));
    try {
        const docx = ext === ".docx" ? path : office(path, "docx", work);
        const file = new Uint8Array(readFileSync(docx));
        const notes = convertNotes(await docxFootnotes(file));
        if (!notes.length) throw new Error("这份文件里没有脚注。");
        const revised = await reviseDocx(file, notes, { track });
        if (back === "docx") writeFileSync(target, revised);
        else {
            const named = join(
                work,
                `${basename(target, extname(target))}.docx`
            );
            writeFileSync(named, revised);
            copyFileSync(office(named, back, join(work, "out")), target);
        }
        report(notes);
        console.error(`已写入 ${target}`);
        return 0;
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
}

async function article(
    path: string,
    out: string | undefined,
    track: boolean
): Promise<number> {
    if (/\.(docx|doc|odt|rtf|wps|pages)$/i.test(path))
        return document(path, out, track);
    const result = convertArticle(readFileSync(path, "utf8"));
    if (out) writeFileSync(out, result.document);
    else process.stdout.write(result.document);
    report(result.notes);
    return 0;
}

function references(
    json: string | undefined,
    raw: string | undefined,
    rawFile: string | undefined
): (string | Fields)[] {
    const found: (string | Fields)[] = [];
    if (raw) found.push(raw);
    if (rawFile)
        found.push(
            ...readFileSync(rawFile, "utf8")
                .split(/\r?\n/)
                .filter((line) => line.trim())
        );
    if (json) found.push(...[JSON.parse(readFileSync(json, "utf8"))].flat());
    return found;
}

export async function main(argv: string[]): Promise<number> {
    const { values, positionals } = parseArgs({
        args: argv,
        allowPositionals: true,
        options: {
            raw: { type: "string" },
            "raw-file": { type: "string" },
            article: { type: "string" },
            out: { type: "string", short: "o" },
            clean: { type: "boolean" },
            help: { type: "boolean", short: "h" },
        },
    });
    if (values.article && !values.help) {
        return article(values.article, values.out, !values.clean).catch(
            (error) => {
                console.error((error as Error).message);
                return 2;
            }
        );
    }
    const found = values.help
        ? []
        : references(positionals[0], values.raw, values["raw-file"]);
    if (!found.length) {
        console.log(HELP);
        return 1;
    }
    let status = 0;
    for (const reference of found) {
        try {
            const citation =
                typeof reference === "string"
                    ? citeReference(reference)
                    : cite(reference);
            console.log(citation.text);
            console.error(`  类型：${typeName(citation.type)}`);
            if (citation.missing.length)
                console.error(`  缺少：${citation.missing.join("、")}`);
        } catch (error) {
            console.log(
                `[无法转换] ${typeof reference === "string" ? reference.trim() : JSON.stringify(reference)}：${(error as Error).message}`
            );
            status = 2;
        }
    }
    return status;
}

if (import.meta.main) process.exitCode = await main(process.argv.slice(2));
