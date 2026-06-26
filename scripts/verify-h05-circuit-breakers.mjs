import { readFileSync } from "node:fs";
import { verifyH05CircuitBreakerConfig } from "../packages/kernel/dist/h05/circuit-breakers.js";
import { readRequiredSinglePathArg } from "./lib/cli-args.mjs";

const configPath = readRequiredSinglePathArg({
  check: "h05_circuit_breakers_verifier",
  usage: "Usage: node scripts/verify-h05-circuit-breakers.mjs <config.json>"
});

const report = verifyH05CircuitBreakerConfig(JSON.parse(readFileSync(configPath, "utf8")));
console.log(JSON.stringify(report, null, 2));

if (report.status !== "passed") {
  process.exit(1);
}
