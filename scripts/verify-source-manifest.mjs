import { readFileSync } from "node:fs";
import { verifySourceManifestConfig } from "../packages/kernel/dist/source-vault/manifest.js";
import { readRequiredSinglePathArg } from "./lib/cli-args.mjs";

const configPath = readRequiredSinglePathArg({
  check: "source_manifest_verifier",
  usage: "Usage: node scripts/verify-source-manifest.mjs <config.json>"
});

const report = verifySourceManifestConfig(JSON.parse(readFileSync(configPath, "utf8")));
console.log(JSON.stringify(report, null, 2));
if (report.status !== "passed") {
  process.exit(1);
}
