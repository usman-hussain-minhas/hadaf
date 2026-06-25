import { readFileSync } from "node:fs";
import { reconcileStatusConfig } from "../packages/kernel/dist/verification/status.js";

const configPath = process.argv[2];
if (!configPath) {
  console.error(JSON.stringify({
    status: "failed",
    check: "status_reconciler",
    error: "Usage: node scripts/reconcile-status.mjs <config.json>"
  }));
  process.exit(1);
}

const report = reconcileStatusConfig(JSON.parse(readFileSync(configPath, "utf8")));
console.log(JSON.stringify(report, null, 2));
if (report.status !== "passed") {
  process.exit(1);
}
