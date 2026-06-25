import { readFileSync } from "node:fs";
import { verifyH03SchemaRegistryConfig } from "../packages/kernel/dist/h03/schema-registry.js";
import { readRequiredSinglePathArg } from "./lib/cli-args.mjs";

const configPath = readRequiredSinglePathArg({
  check: "h03_schema_registry_verifier",
  usage: "Usage: node scripts/verify-h03-schema-registry.mjs <config.json>"
});

const report = verifyH03SchemaRegistryConfig(JSON.parse(readFileSync(configPath, "utf8")));
console.log(JSON.stringify(report, null, 2));
if (report.status !== "passed") {
  process.exit(1);
}
