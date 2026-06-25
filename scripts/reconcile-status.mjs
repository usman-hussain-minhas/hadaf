import { readFileSync } from "node:fs";
import { reconcileStatusConfig } from "../packages/kernel/dist/verification/status.js";
import { readRequiredSinglePathArg } from "./lib/cli-args.mjs";

const configPath = readRequiredSinglePathArg({
  check: "status_reconciler",
  usage: "Usage: node scripts/reconcile-status.mjs <config.json>"
});

const report = reconcileStatusConfig(JSON.parse(readFileSync(configPath, "utf8")));
console.log(JSON.stringify(report, null, 2));
if (report.status !== "passed") {
  process.exit(1);
}
