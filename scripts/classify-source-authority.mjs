import { readFileSync } from "node:fs";
import { classifySourceAuthorityConfig } from "../packages/kernel/dist/source-vault/classifier.js";
import { readRequiredSinglePathArg } from "./lib/cli-args.mjs";

const configPath = readRequiredSinglePathArg({
  check: "source_authority_classifier",
  usage: "Usage: node scripts/classify-source-authority.mjs <config.json>"
});

const report = classifySourceAuthorityConfig(JSON.parse(readFileSync(configPath, "utf8")));
console.log(JSON.stringify(report, null, 2));
if (report.status !== "passed") {
  process.exit(1);
}
