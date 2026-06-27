import { readFileSync } from "node:fs";
import { verifyH09RecoveryExecutionConfig } from "../packages/kernel/dist/h09/recovery-execution.js";
import { readRequiredSinglePathArg } from "./lib/cli-args.mjs";

const configPath = readRequiredSinglePathArg({
  check: "h09_recovery_execution",
  usage: "Usage: node scripts/verify-h09-recovery-execution.mjs <config.json>"
});

const report = verifyH09RecoveryExecutionConfig(JSON.parse(readFileSync(configPath, "utf8")));
console.log(JSON.stringify(report, null, 2));

if (report.status !== "passed") {
  process.exit(1);
}
