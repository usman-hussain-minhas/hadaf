import { readFileSync } from "node:fs";
import { deriveH05HmcAgentProjection } from "../packages/kernel/dist/h05/hmc-agent-projection.js";
import { readRequiredSinglePathArg } from "./lib/cli-args.mjs";

const configPath = readRequiredSinglePathArg({
  check: "h05_hmc_agent_projection_verifier",
  usage: "Usage: node scripts/verify-h05-agent-projection.mjs <config.json>"
});

const report = deriveH05HmcAgentProjection(JSON.parse(readFileSync(configPath, "utf8")));
console.log(JSON.stringify(report, null, 2));
if (report.status !== "passed") {
  process.exit(1);
}
