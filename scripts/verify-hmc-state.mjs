import { readFileSync } from "node:fs";
import { deriveHmcStateConfig } from "../packages/kernel/dist/hmc/state.js";

const configPath = process.argv[2];
if (!configPath) {
  console.error(JSON.stringify({
    status: "failed",
    check: "hmc_state_verifier",
    error: "Usage: node scripts/verify-hmc-state.mjs <config.json>"
  }));
  process.exit(1);
}

const report = deriveHmcStateConfig(JSON.parse(readFileSync(configPath, "utf8")));
console.log(JSON.stringify(report, null, 2));
if (report.status !== "passed") {
  process.exit(1);
}
