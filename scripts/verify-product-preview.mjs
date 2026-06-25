import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { verifyProductPreviewConfig } from "../packages/kernel/dist/index.js";

const configPath = process.argv[2];
if (!configPath) {
  console.error(JSON.stringify({ status: "failed", findings: [{ kind: "missing_config_path" }] }));
  process.exit(2);
}

const config = JSON.parse(await readFile(resolve(configPath), "utf8"));
const report = verifyProductPreviewConfig(config);
console.log(JSON.stringify(report, null, 2));
process.exit(report.status === "passed" ? 0 : 1);
