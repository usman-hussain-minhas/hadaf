import { readFileSync } from "node:fs";
import { verifyH06ResourceQuotaConfig } from "../packages/kernel/dist/h06/resource-quotas.js";
import { readRequiredSinglePathArg } from "./lib/cli-args.mjs";

const configPath = readRequiredSinglePathArg({
  check: "h06_resource_quotas_verifier",
  usage: "Usage: node scripts/verify-h06-resource-quotas.mjs <config.json>"
});

const report = verifyH06ResourceQuotaConfig(JSON.parse(readFileSync(configPath, "utf8")));
console.log(JSON.stringify(report, null, 2));

if (report.status !== "passed") {
  process.exit(1);
}
