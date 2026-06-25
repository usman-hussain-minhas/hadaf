import { readFileSync } from "node:fs";
import { normalizeH03PlanConfig } from "../packages/kernel/dist/h03/plan-normalization.js";
import { readRequiredSinglePathArg } from "./lib/cli-args.mjs";

const configPath = readRequiredSinglePathArg({
  check: "h03_plan_normalization_verifier",
  usage: "Usage: node scripts/verify-h03-plan-normalization.mjs <config.json>"
});

const report = normalizeH03PlanConfig(JSON.parse(readFileSync(configPath, "utf8")));
console.log(JSON.stringify(report, null, 2));
if (report.status !== "passed") {
  process.exit(1);
}
