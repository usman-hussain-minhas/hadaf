import { readFileSync } from "node:fs";
import { verifyH04TruthLedgerConfig } from "../packages/kernel/dist/h04/truth-ledger.js";
import { readRequiredSinglePathArg } from "./lib/cli-args.mjs";

const configPath = readRequiredSinglePathArg({
  check: "h04_truth_ledger_verifier",
  usage: "Usage: node scripts/verify-h04-truth-ledger.mjs <config.json>"
});

const report = verifyH04TruthLedgerConfig(JSON.parse(readFileSync(configPath, "utf8")));
console.log(JSON.stringify(report, null, 2));
if (report.status !== "passed") {
  process.exit(1);
}
