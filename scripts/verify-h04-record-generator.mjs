import { readFileSync } from "node:fs";
import { verifyH04RecordGeneratorConfig } from "../packages/kernel/dist/h04/record-generator.js";
import { readRequiredSinglePathArg } from "./lib/cli-args.mjs";

const configPath = readRequiredSinglePathArg({
  check: "h04_record_generator_verifier",
  usage: "Usage: node scripts/verify-h04-record-generator.mjs <config.json>"
});

const report = verifyH04RecordGeneratorConfig(JSON.parse(readFileSync(configPath, "utf8")));
console.log(JSON.stringify(report, null, 2));
if (report.status !== "passed") {
  process.exit(1);
}
