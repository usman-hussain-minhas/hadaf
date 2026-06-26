import { readFileSync } from "node:fs";
import { verifyH05UpskillRecordsConfig } from "../packages/kernel/dist/h05/upskill-records.js";
import { readRequiredSinglePathArg } from "./lib/cli-args.mjs";

const configPath = readRequiredSinglePathArg({
  check: "h05_upskill_records_verifier",
  usage: "Usage: node scripts/verify-h05-upskill-records.mjs <config.json>"
});

const report = verifyH05UpskillRecordsConfig(JSON.parse(readFileSync(configPath, "utf8")));
console.log(JSON.stringify(report, null, 2));

if (report.status !== "passed") {
  process.exit(1);
}
