import { verifyQualityClassificationConfig } from "../packages/kernel/dist/verification/quality-classification.js";
import { readRequiredSinglePathArg } from "./lib/cli-args.mjs";

const reportPath = readRequiredSinglePathArg({
  check: "quality_classification_verifier",
  usage: "Usage: node scripts/verify-quality-classification.mjs <quality-report.json>"
});

const report = verifyQualityClassificationConfig({ reportPath });
console.log(JSON.stringify(report, null, 2));
if (report.status !== "passed") {
  process.exit(1);
}
