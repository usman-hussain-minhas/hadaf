import { readFileSync } from "node:fs";
import { verifyH10AntiRepeatConfig } from "../packages/kernel/dist/h10/anti-repeat.js";
import { readRequiredSinglePathArg } from "./lib/cli-args.mjs";

const configPath = readRequiredSinglePathArg({
  check: "h10_anti_repeat",
  usage: "Usage: node scripts/verify-h10-anti-repeat.mjs <config.json>"
});

const report = verifyH10AntiRepeatConfig(JSON.parse(readFileSync(configPath, "utf8")));
console.log(JSON.stringify(report, null, 2));

if (report.status !== "passed") {
  process.exit(1);
}
