import { readFileSync } from "node:fs";
import { classifySourceAuthorityConfig } from "../packages/kernel/dist/source-vault/classifier.js";

const configPath = process.argv[2];
if (!configPath) {
  console.error(JSON.stringify({
    status: "failed",
    check: "source_authority_classifier",
    error: "Usage: node scripts/classify-source-authority.mjs <config.json>"
  }));
  process.exit(1);
}

const report = classifySourceAuthorityConfig(JSON.parse(readFileSync(configPath, "utf8")));
console.log(JSON.stringify(report, null, 2));
if (report.status !== "passed") {
  process.exit(1);
}
