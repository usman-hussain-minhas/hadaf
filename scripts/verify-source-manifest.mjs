import { readFileSync } from "node:fs";
import { verifySourceManifestConfig } from "../packages/kernel/dist/source-vault/manifest.js";

const configPath = process.argv[2];
if (!configPath) {
  console.error(JSON.stringify({
    status: "failed",
    check: "source_manifest_verifier",
    error: "Usage: node scripts/verify-source-manifest.mjs <config.json>"
  }));
  process.exit(1);
}

const report = verifySourceManifestConfig(JSON.parse(readFileSync(configPath, "utf8")));
console.log(JSON.stringify(report, null, 2));
if (report.status !== "passed") {
  process.exit(1);
}
