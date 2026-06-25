import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const textFilePattern = /\.(cjs|js|json|md|mjs|ts|tsx|yaml|yml)$/u;
const result = spawnSync("git", ["ls-files"], { encoding: "utf8" });

if (result.status !== 0) {
  console.error(JSON.stringify({ status: "failed", check: "format", error: result.stderr.trim() }));
  process.exit(1);
}

const findings = [];
for (const path of result.stdout.split(/\r?\n/u).filter(Boolean)) {
  if (!textFilePattern.test(path)) continue;
  const text = readFileSync(path, "utf8");

  if (text.includes("\r\n")) findings.push({ path, kind: "crlf_line_endings" });
  if (!text.endsWith("\n")) findings.push({ path, kind: "missing_final_newline" });
  if (/\n\n\n$/u.test(text)) findings.push({ path, kind: "extra_blank_lines_at_eof" });

  const lines = text.split("\n");
  lines.forEach((line, index) => {
    if (/[ \t]$/u.test(line)) findings.push({ path, line: index + 1, kind: "trailing_whitespace" });
    if (line.includes("\t")) findings.push({ path, line: index + 1, kind: "tab_indentation" });
  });
}

if (findings.length > 0) {
  console.error(JSON.stringify({ status: "failed", check: "format", findings }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ status: "passed", check: "format" }));
