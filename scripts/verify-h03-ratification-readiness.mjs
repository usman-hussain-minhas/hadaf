import { readFileSync } from "node:fs";
import { verifyH03ConstitutionReadinessConfig } from "../packages/kernel/dist/h03/constitution-readiness.js";
import { readRequiredSinglePathArg } from "./lib/cli-args.mjs";

const configPath = readRequiredSinglePathArg({
  check: "h03_ratification_readiness_verifier",
  usage: "Usage: node scripts/verify-h03-ratification-readiness.mjs <config.json>"
});

const report = verifyH03ConstitutionReadinessConfig(JSON.parse(readFileSync(configPath, "utf8")));
console.log(JSON.stringify(report, null, 2));

if (report.readiness_mode !== "final_mode") {
  console.error(JSON.stringify({
    status: "failed",
    check: "h03_ratification_readiness_verifier",
    findings: [
      {
        kind: "final_mode_required",
        expected: "final_mode",
        actual: report.readiness_mode
      }
    ]
  }));
  process.exit(1);
}

if (report.status !== "passed") {
  process.exit(1);
}
