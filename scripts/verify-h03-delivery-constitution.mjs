import { readFileSync } from "node:fs";
import { compileH03DeliveryConstitutionConfig } from "../packages/kernel/dist/h03/delivery-constitution.js";
import { readRequiredSinglePathArg } from "./lib/cli-args.mjs";

const configPath = readRequiredSinglePathArg({
  check: "h03_delivery_constitution_verifier",
  usage: "Usage: node scripts/verify-h03-delivery-constitution.mjs <config.json>"
});

const report = compileH03DeliveryConstitutionConfig(JSON.parse(readFileSync(configPath, "utf8")));
console.log(JSON.stringify(report, null, 2));
if (report.status !== "passed") {
  process.exit(1);
}
