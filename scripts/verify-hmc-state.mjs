import { readFileSync } from "node:fs";
import { deriveHmcStateConfig } from "../packages/kernel/dist/hmc/state.js";
import { readRequiredSinglePathArg } from "./lib/cli-args.mjs";

const configPath = readRequiredSinglePathArg({
  check: "hmc_state_verifier",
  usage: "Usage: node scripts/verify-hmc-state.mjs <config.json>"
});

const report = deriveHmcStateConfig(JSON.parse(readFileSync(configPath, "utf8")));
console.log(JSON.stringify(report, null, 2));
if (report.status !== "passed") {
  process.exit(1);
}
