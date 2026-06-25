import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const forbiddenNames = new Set(["license", "license.md", "license.txt", "copying", "copying.md"]);
const ignoredDirectories = new Set([".git", "node_modules", "dist", "coverage"]);
const findings = [];

function walk(directory) {
  for (const entry of readdirSync(directory)) {
    if (ignoredDirectories.has(entry)) continue;
    const path = join(directory, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) {
      walk(path);
      continue;
    }
    if (forbiddenNames.has(entry.toLowerCase())) {
      findings.push(path);
    }
  }
}

walk(".");

if (findings.length > 0) {
  console.error(JSON.stringify({ status: "failed", check: "no_license_file", findings }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ status: "passed", check: "no_license_file" }));
