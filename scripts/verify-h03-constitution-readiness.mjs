import { readFileSync } from "node:fs";
import { verifyH03ConstitutionReadinessConfig } from "../packages/kernel/dist/h03/constitution-readiness.js";
import { readRequiredSinglePathArg } from "./lib/cli-args.mjs";

const configPath = readRequiredSinglePathArg({
  check: "h03_constitution_readiness_verifier",
  usage: "Usage: node scripts/verify-h03-constitution-readiness.mjs <config.json>"
});

const report = verifyH03ConstitutionReadinessConfig(JSON.parse(readFileSync(configPath, "utf8")));
console.log(JSON.stringify(report, null, 2));
if (report.status !== "passed") {
  process.exit(1);
}
