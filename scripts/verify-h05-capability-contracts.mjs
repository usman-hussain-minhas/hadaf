import { readFileSync } from "node:fs";
import { verifyH05CapabilityContractConfig } from "../packages/kernel/dist/h05/capability-contracts.js";
import { readRequiredSinglePathArg } from "./lib/cli-args.mjs";

const configPath = readRequiredSinglePathArg({
  check: "h05_capability_contracts_verifier",
  usage: "Usage: node scripts/verify-h05-capability-contracts.mjs <config.json>"
});

const report = verifyH05CapabilityContractConfig(JSON.parse(readFileSync(configPath, "utf8")));
console.log(JSON.stringify(report, null, 2));

if (report.status !== "passed") {
  process.exit(1);
}
