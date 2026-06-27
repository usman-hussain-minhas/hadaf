import { readFileSync } from "node:fs";
import { verifyH10MistakeLedgerConfig } from "../packages/kernel/dist/h10/mistake-ledger.js";
import { readRequiredSinglePathArg } from "./lib/cli-args.mjs";

const configPath = readRequiredSinglePathArg({
  check: "h10_mistake_ledger",
  usage: "Usage: node scripts/verify-h10-mistake-ledger.mjs <config.json>"
});

const report = verifyH10MistakeLedgerConfig(JSON.parse(readFileSync(configPath, "utf8")));
console.log(JSON.stringify(report, null, 2));

if (report.status !== "passed") {
  process.exit(1);
}
