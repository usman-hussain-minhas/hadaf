import { readFileSync } from "node:fs";
import { verifyH07ProofPackageConfig } from "../packages/kernel/dist/h07/proof-package.js";
import { readRequiredSinglePathArg } from "./lib/cli-args.mjs";

const configPath = readRequiredSinglePathArg({
  check: "h07_proof_package_verifier",
  usage: "Usage: node scripts/verify-h07-proof-package.mjs <config.json>"
});

const report = verifyH07ProofPackageConfig(JSON.parse(readFileSync(configPath, "utf8")));
console.log(JSON.stringify(report, null, 2));

if (report.status !== "passed") {
  process.exit(1);
}
