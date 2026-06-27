import { readFileSync } from "node:fs";
import { verifyH10LearningIngestionConfig } from "../packages/kernel/dist/h10/learning-ingestion.js";
import { readRequiredSinglePathArg } from "./lib/cli-args.mjs";

const configPath = readRequiredSinglePathArg({
  check: "h10_learning_ingestion",
  usage: "Usage: node scripts/verify-h10-learning-ingestion.mjs <config.json>"
});

const report = verifyH10LearningIngestionConfig(JSON.parse(readFileSync(configPath, "utf8")));
console.log(JSON.stringify(report, null, 2));

if (report.status !== "passed") {
  process.exit(1);
}
