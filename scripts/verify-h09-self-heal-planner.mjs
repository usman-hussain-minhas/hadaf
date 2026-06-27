import { readFileSync } from "node:fs";
import { verifyH09SelfHealPlannerConfig } from "../packages/kernel/dist/h09/self-heal-planner.js";
import { readRequiredSinglePathArg } from "./lib/cli-args.mjs";

const configPath = readRequiredSinglePathArg({
  check: "h09_self_heal_planner",
  usage: "Usage: node scripts/verify-h09-self-heal-planner.mjs <config.json>"
});

const report = verifyH09SelfHealPlannerConfig(JSON.parse(readFileSync(configPath, "utf8")));
console.log(JSON.stringify(report, null, 2));

if (report.status !== "passed") {
  process.exit(1);
}
