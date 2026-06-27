import { readFileSync } from "node:fs";
import { verifyH08CiWatcherConfig } from "../packages/kernel/dist/h08/ci-watcher.js";
import { readRequiredSinglePathArg } from "./lib/cli-args.mjs";

const configPath = readRequiredSinglePathArg({
  check: "h08_ci_watcher",
  usage: "Usage: node scripts/verify-h08-ci-watcher.mjs <config.json>"
});

const report = verifyH08CiWatcherConfig(JSON.parse(readFileSync(configPath, "utf8")));
console.log(JSON.stringify(report, null, 2));

if (report.status !== "passed") {
  process.exit(1);
}
