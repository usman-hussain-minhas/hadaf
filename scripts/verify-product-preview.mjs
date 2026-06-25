import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { verifyProductPreviewConfig } from "../packages/kernel/dist/index.js";
import { readRequiredSinglePathArg } from "./lib/cli-args.mjs";

const configPath = readRequiredSinglePathArg({
  check: "product_preview_verifier",
  usage: "Usage: node scripts/verify-product-preview.mjs <config.json>",
  exitCode: 2
});

const config = JSON.parse(await readFile(resolve(configPath), "utf8"));
const report = verifyProductPreviewConfig(config);
console.log(JSON.stringify(report, null, 2));
process.exit(report.status === "passed" ? 0 : 1);
