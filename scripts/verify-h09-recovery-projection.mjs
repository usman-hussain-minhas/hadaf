import { readFileSync } from "node:fs";
import { verifyH09HmcRecoveryProjectionConfig } from "../packages/kernel/dist/h09/hmc-recovery-projection.js";
import { readRequiredSinglePathArg } from "./lib/cli-args.mjs";

const configPath = readRequiredSinglePathArg({
  check: "h09_recovery_projection",
  usage: "Usage: node scripts/verify-h09-recovery-projection.mjs <config.json>"
});

const report = verifyH09HmcRecoveryProjectionConfig(JSON.parse(readFileSync(configPath, "utf8")));
console.log(JSON.stringify(report, null, 2));

if (report.status !== "passed") {
  process.exit(1);
}
