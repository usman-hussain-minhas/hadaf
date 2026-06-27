import { readFileSync } from "node:fs";
import { verifyH08MergeReadinessConfig } from "../packages/kernel/dist/h08/merge-readiness.js";
import { readRequiredSinglePathArg } from "./lib/cli-args.mjs";

const configPath = readRequiredSinglePathArg({
  check: "h08_merge_readiness",
  usage: "Usage: node scripts/verify-h08-merge-readiness.mjs <config.json>"
});

const report = verifyH08MergeReadinessConfig(JSON.parse(readFileSync(configPath, "utf8")));
console.log(JSON.stringify(report, null, 2));

if (report.status !== "passed") {
  process.exit(1);
}
