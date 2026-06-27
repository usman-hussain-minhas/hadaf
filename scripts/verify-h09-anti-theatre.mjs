import { readFileSync } from "node:fs";
import { verifyH09AntiTheatreConfig } from "../packages/kernel/dist/h09/anti-theatre.js";
import { readRequiredSinglePathArg } from "./lib/cli-args.mjs";

const configPath = readRequiredSinglePathArg({
  check: "h09_anti_theatre",
  usage: "Usage: node scripts/verify-h09-anti-theatre.mjs <config.json>"
});

const report = verifyH09AntiTheatreConfig(JSON.parse(readFileSync(configPath, "utf8")));
console.log(JSON.stringify(report, null, 2));

if (report.status !== "passed") {
  process.exit(1);
}
