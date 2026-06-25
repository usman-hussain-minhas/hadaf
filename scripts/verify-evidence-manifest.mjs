import { readFileSync } from "node:fs";
import { verifyEvidenceConfig } from "../packages/kernel/dist/verification/evidence.js";
import { readRequiredSinglePathArg } from "./lib/cli-args.mjs";

const configPath = readRequiredSinglePathArg({
  check: "evidence_manifest_verifier",
  usage: "Usage: node scripts/verify-evidence-manifest.mjs <config.json>"
});

const report = verifyEvidenceConfig(JSON.parse(readFileSync(configPath, "utf8")));
console.log(JSON.stringify(report, null, 2));
if (report.status !== "passed") {
  process.exit(1);
}
