import { readFileSync } from "node:fs";
import { verifyH08HmcGitProjectionConfig } from "../packages/kernel/dist/h08/hmc-git-projection.js";
import { readRequiredSinglePathArg } from "./lib/cli-args.mjs";

const configPath = readRequiredSinglePathArg({
  check: "h08_git_projection",
  usage: "Usage: node scripts/verify-h08-git-projection.mjs <config.json>"
});

const report = verifyH08HmcGitProjectionConfig(JSON.parse(readFileSync(configPath, "utf8")));
console.log(JSON.stringify(report, null, 2));

if (report.status !== "passed") {
  process.exit(1);
}
