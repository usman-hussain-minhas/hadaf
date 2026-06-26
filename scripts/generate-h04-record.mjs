import { readFileSync } from "node:fs";
import { generateH04RecordFromRequest } from "../packages/kernel/dist/h04/record-generator.js";
import { readRequiredSinglePathArg } from "./lib/cli-args.mjs";

const requestPath = readRequiredSinglePathArg({
  check: "h04_record_generator",
  usage: "Usage: node scripts/generate-h04-record.mjs <request.json>"
});

const record = generateH04RecordFromRequest(JSON.parse(readFileSync(requestPath, "utf8")));
console.log(JSON.stringify(record, null, 2));
