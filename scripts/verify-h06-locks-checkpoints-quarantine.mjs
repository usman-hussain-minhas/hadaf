import { readFileSync } from "node:fs";
import { verifyH06LocksCheckpointsQuarantineConfig } from "../packages/kernel/dist/h06/locks-checkpoints-quarantine.js";
import { readRequiredSinglePathArg } from "./lib/cli-args.mjs";

const configPath = readRequiredSinglePathArg({
  check: "h06_locks_checkpoints_quarantine_verifier",
  usage: "Usage: node scripts/verify-h06-locks-checkpoints-quarantine.mjs <config.json>"
});

const report = verifyH06LocksCheckpointsQuarantineConfig(JSON.parse(readFileSync(configPath, "utf8")));
console.log(JSON.stringify(report, null, 2));

if (report.status !== "passed") {
  process.exit(1);
}
