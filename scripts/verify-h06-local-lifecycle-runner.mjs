import { readFileSync } from "node:fs";
import { verifyH06LocalLifecycleRunnerConfig } from "../packages/kernel/dist/h06/local-lifecycle-runner.js";
import { readRequiredSinglePathArg } from "./lib/cli-args.mjs";

const configPath = readRequiredSinglePathArg({
  check: "h06_local_lifecycle_runner_verifier",
  usage: "Usage: node scripts/verify-h06-local-lifecycle-runner.mjs <config.json>"
});

const report = verifyH06LocalLifecycleRunnerConfig(JSON.parse(readFileSync(configPath, "utf8")));
console.log(JSON.stringify(report, null, 2));

if (report.status !== "passed") {
  process.exit(1);
}
