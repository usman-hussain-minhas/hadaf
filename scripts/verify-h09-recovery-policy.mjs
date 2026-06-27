import { readFileSync } from "node:fs";
import { verifyH09RecoveryPolicyConfig } from "../packages/kernel/dist/h09/recovery-policy.js";
import { readRequiredSinglePathArg } from "./lib/cli-args.mjs";

const configPath = readRequiredSinglePathArg({
  check: "h09_recovery_policy",
  usage: "Usage: node scripts/verify-h09-recovery-policy.mjs <config.json>"
});

const report = verifyH09RecoveryPolicyConfig(JSON.parse(readFileSync(configPath, "utf8")));
console.log(JSON.stringify(report, null, 2));

if (report.status !== "passed") {
  process.exit(1);
}
