import { verifyQualityClassificationConfig } from "../packages/kernel/dist/verification/quality-classification.js";

const reportPath = process.argv[2];
if (!reportPath) {
  console.error(JSON.stringify({
    status: "failed",
    check: "quality_classification_verifier",
    error: "Usage: node scripts/verify-quality-classification.mjs <quality-report.json>"
  }));
  process.exit(1);
}

const report = verifyQualityClassificationConfig({ reportPath });
console.log(JSON.stringify(report, null, 2));
if (report.status !== "passed") {
  process.exit(1);
}
