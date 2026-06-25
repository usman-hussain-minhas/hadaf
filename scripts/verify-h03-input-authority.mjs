import { readFileSync } from "node:fs";
import { verifyH03InputAuthorityConfig } from "../packages/kernel/dist/h03/input-authority.js";
import { readRequiredSinglePathArg } from "./lib/cli-args.mjs";

const configPath = readRequiredSinglePathArg({
  check: "h03_input_authority_verifier",
  usage: "Usage: node scripts/verify-h03-input-authority.mjs <config.json>"
});

const report = verifyH03InputAuthorityConfig(JSON.parse(readFileSync(configPath, "utf8")));
console.log(JSON.stringify(report, null, 2));
if (report.status !== "passed") {
  process.exit(1);
}
