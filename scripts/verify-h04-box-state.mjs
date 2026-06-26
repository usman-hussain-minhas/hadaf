import { readFileSync } from "node:fs";
import { verifyH04BoxStateConfig } from "../packages/kernel/dist/h04/box-state.js";
import { readRequiredSinglePathArg } from "./lib/cli-args.mjs";

const configPath = readRequiredSinglePathArg({
  check: "h04_box_state_verifier",
  usage: "Usage: node scripts/verify-h04-box-state.mjs <config.json>"
});

const report = verifyH04BoxStateConfig(JSON.parse(readFileSync(configPath, "utf8")));
console.log(JSON.stringify(report, null, 2));
if (report.status !== "passed") {
  process.exit(1);
}
