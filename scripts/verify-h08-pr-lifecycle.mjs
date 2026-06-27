import { readFileSync } from "node:fs";
import { verifyH08PrLifecycleConfig } from "../packages/kernel/dist/h08/pr-lifecycle.js";
import { readRequiredSinglePathArg } from "./lib/cli-args.mjs";

const configPath = readRequiredSinglePathArg({
  check: "h08_pr_lifecycle",
  usage: "Usage: node scripts/verify-h08-pr-lifecycle.mjs <config.json>"
});

const report = verifyH08PrLifecycleConfig(JSON.parse(readFileSync(configPath, "utf8")));
console.log(JSON.stringify(report, null, 2));

if (report.status !== "passed") {
  process.exit(1);
}
