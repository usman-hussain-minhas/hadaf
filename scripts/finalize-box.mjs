import { readFileSync } from "node:fs";
import { verifyH04FinalizeBoxConfig } from "../packages/kernel/dist/h04/finalize-box.js";
import { readRequiredSinglePathArg } from "./lib/cli-args.mjs";

const configPath = readRequiredSinglePathArg({
  check: "h04_finalize_box",
  usage: "Usage: node scripts/finalize-box.mjs <config.json>"
});

const report = verifyH04FinalizeBoxConfig(JSON.parse(readFileSync(configPath, "utf8")));
console.log(JSON.stringify(report, null, 2));
if (report.status !== "passed") {
  process.exit(1);
}
