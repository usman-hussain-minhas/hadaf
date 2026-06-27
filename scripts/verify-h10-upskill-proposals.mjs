import { readFileSync } from "node:fs";
import { verifyH10UpskillProposalConfig } from "../packages/kernel/dist/h10/upskill-proposals.js";
import { readRequiredSinglePathArg } from "./lib/cli-args.mjs";

const configPath = readRequiredSinglePathArg({
  check: "h10_upskill_proposals",
  usage: "Usage: node scripts/verify-h10-upskill-proposals.mjs <config.json>"
});

const report = verifyH10UpskillProposalConfig(JSON.parse(readFileSync(configPath, "utf8")));
console.log(JSON.stringify(report, null, 2));

if (report.status !== "passed") {
  process.exit(1);
}
