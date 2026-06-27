import { readFileSync } from "node:fs";
import { deriveH07HmcProofProjection } from "../packages/kernel/dist/h07/hmc-proof-projection.js";
import { readRequiredSinglePathArg } from "./lib/cli-args.mjs";

const configPath = readRequiredSinglePathArg({
  check: "h07_hmc_proof_projection",
  usage: "Usage: node scripts/verify-h07-proof-projection.mjs <config.json>"
});

const report = deriveH07HmcProofProjection(JSON.parse(readFileSync(configPath, "utf8")));
console.log(JSON.stringify(report, null, 2));

if (report.status !== "passed") {
  process.exit(1);
}
