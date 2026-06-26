import { readFileSync } from "node:fs";
import { verifyH04FfetLifecycleConfig } from "../packages/kernel/dist/h04/ffet-lifecycle.js";
import { readRequiredSinglePathArg } from "./lib/cli-args.mjs";

const configPath = readRequiredSinglePathArg({
  check: "h04_ffet_lifecycle_verifier",
  usage: "Usage: node scripts/verify-h04-ffet-lifecycle.mjs <config.json>"
});

const report = verifyH04FfetLifecycleConfig(JSON.parse(readFileSync(configPath, "utf8")));
console.log(JSON.stringify(report, null, 2));
if (report.status !== "passed") {
  process.exit(1);
}
