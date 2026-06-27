import { readFileSync } from "node:fs";
import { verifyH07ProofVerifierConfig } from "../packages/kernel/dist/h07/proof-verifier.js";
import { readRequiredSinglePathArg } from "./lib/cli-args.mjs";

const configPath = readRequiredSinglePathArg({
  check: "h07_proof_verifier",
  usage: "Usage: node scripts/verify-h07-proof-verifier.mjs <config.json>"
});

const report = verifyH07ProofVerifierConfig(JSON.parse(readFileSync(configPath, "utf8")));
console.log(JSON.stringify(report, null, 2));

if (report.status !== "passed") {
  process.exit(1);
}
