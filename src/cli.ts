/**
 * Command line.
 *
 *   node src/cli.ts refs.json              # one object or a list, each with a "type"
 *   node src/cli.ts --raw "王名扬. 美国行政法[M]. 北京: 中国法制出版社, 1995: 18."
 *   node src/cli.ts --raw-file refs.txt    # one raw reference per line
 */
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { cite, parse, type Fields } from "./cmlc.ts";

const HELP = `用法：node src/cli.ts [JSON 文件] [--raw 原始文本] [--raw-file 文本文件]
按《法学引注手册》（第二版）格式化引注。缺项写成 [字段名]，并在标准错误输出中列出。`;

function references(json: string | undefined, raw: string | undefined, rawFile: string | undefined): (string | Fields)[] {
  const found: (string | Fields)[] = [];
  if (raw) found.push(raw);
  if (rawFile) found.push(...readFileSync(rawFile, "utf8").split(/\r?\n/).filter(line => line.trim()));
  if (json) found.push(...[JSON.parse(readFileSync(json, "utf8"))].flat());
  return found;
}

export function main(argv: string[]): number {
  const { values, positionals } = parseArgs({
    args: argv, allowPositionals: true,
    options: { raw: { type: "string" }, "raw-file": { type: "string" }, help: { type: "boolean", short: "h" } },
  });
  const found = values.help ? [] : references(positionals[0], values.raw, values["raw-file"]);
  if (!found.length) {
    console.log(HELP);
    return 1;
  }
  let status = 0;
  for (const reference of found) {
    try {
      const citation = cite(typeof reference === "string" ? parse(reference) : reference);
      console.log(citation.text);
      if (citation.missing.length) console.error(`  缺少：${citation.missing.join("、")}`);
    } catch (error) {
      console.log(`[无法转换] ${typeof reference === "string" ? reference.trim() : JSON.stringify(reference)}：${(error as Error).message}`);
      status = 2;
    }
  }
  return status;
}

if (import.meta.main) process.exitCode = main(process.argv.slice(2));
