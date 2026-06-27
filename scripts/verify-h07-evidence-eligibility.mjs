import { readFileSync } from "node:fs";
import { verifyH07EvidenceEligibilityConfig } from "../packages/kernel/dist/h07/evidence-eligibility.js";
import { readRequiredSinglePathArg } from "./lib/cli-args.mjs";

const configPath = readRequiredSinglePathArg({
  check: "h07_evidence_eligibility_verifier",
  usage: "Usage: node scripts/verify-h07-evidence-eligibility.mjs <config.json>"
});

const report = verifyH07EvidenceEligibilityConfig(JSON.parse(readFileSync(configPath, "utf8")));
console.log(JSON.stringify(report, null, 2));

if (report.status !== "passed") {
  process.exit(1);
}
