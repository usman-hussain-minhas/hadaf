import { readFileSync } from "node:fs";
import { verifyH05AgentRegistryConfig } from "../packages/kernel/dist/h05/agent-registry.js";
import { readRequiredSinglePathArg } from "./lib/cli-args.mjs";

const configPath = readRequiredSinglePathArg({
  check: "h05_agent_registry_verifier",
  usage: "Usage: node scripts/verify-h05-agent-registry.mjs <config.json>"
});

const report = verifyH05AgentRegistryConfig(JSON.parse(readFileSync(configPath, "utf8")));
console.log(JSON.stringify(report, null, 2));

if (report.status !== "passed") {
  process.exit(1);
}
