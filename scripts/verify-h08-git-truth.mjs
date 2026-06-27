import { readFileSync } from "node:fs";
import { verifyH08GitTruthConfig } from "../packages/kernel/dist/h08/git-truth.js";
import { readRequiredSinglePathArg } from "./lib/cli-args.mjs";

const configPath = readRequiredSinglePathArg({
  check: "h08_git_truth",
  usage: "Usage: node scripts/verify-h08-git-truth.mjs <config.json>"
});

const report = verifyH08GitTruthConfig(JSON.parse(readFileSync(configPath, "utf8")));
console.log(JSON.stringify(report, null, 2));

if (report.status !== "passed") {
  process.exit(1);
}
