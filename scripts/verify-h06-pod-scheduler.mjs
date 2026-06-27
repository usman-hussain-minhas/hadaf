import { readFileSync } from "node:fs";
import { verifyH06PodSchedulerConfig } from "../packages/kernel/dist/h06/pod-scheduler.js";
import { readRequiredSinglePathArg } from "./lib/cli-args.mjs";

const configPath = readRequiredSinglePathArg({
  check: "h06_pod_scheduler_verifier",
  usage: "Usage: node scripts/verify-h06-pod-scheduler.mjs <config.json>"
});

const report = verifyH06PodSchedulerConfig(JSON.parse(readFileSync(configPath, "utf8")));
console.log(JSON.stringify(report, null, 2));

if (report.status !== "passed") {
  process.exit(1);
}
