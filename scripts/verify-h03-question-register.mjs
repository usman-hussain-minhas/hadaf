import { readFileSync } from "node:fs";
import { compileH03QuestionRegisterConfig } from "../packages/kernel/dist/h03/question-register.js";
import { readRequiredSinglePathArg } from "./lib/cli-args.mjs";

const configPath = readRequiredSinglePathArg({
  check: "h03_question_register_verifier",
  usage: "Usage: node scripts/verify-h03-question-register.mjs <config.json>"
});

const report = compileH03QuestionRegisterConfig(JSON.parse(readFileSync(configPath, "utf8")));
console.log(JSON.stringify(report, null, 2));
if (report.status !== "passed") {
  process.exit(1);
}
