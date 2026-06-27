import { readFileSync } from "node:fs";
import { verifyH08ConductorConfig } from "../packages/kernel/dist/h08/conductor.js";
import { readRequiredSinglePathArg } from "./lib/cli-args.mjs";

const configPath = readRequiredSinglePathArg({
  check: "h08_conductor",
  usage: "Usage: node scripts/verify-h08-conductor.mjs <config.json>"
});

const report = verifyH08ConductorConfig(JSON.parse(readFileSync(configPath, "utf8")));
console.log(JSON.stringify(report, null, 2));

if (report.status !== "passed") {
  process.exit(1);
}
