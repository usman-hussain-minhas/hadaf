import { readFileSync } from "node:fs";
import { verifyH04CloseoutChainConfig } from "../packages/kernel/dist/h04/closeout-chain.js";
import { readRequiredSinglePathArg } from "./lib/cli-args.mjs";

const configPath = readRequiredSinglePathArg({
  check: "h04_closeout_chain_verifier",
  usage: "Usage: node scripts/verify-h04-closeout-chain.mjs <config.json>"
});

const report = verifyH04CloseoutChainConfig(JSON.parse(readFileSync(configPath, "utf8")));
console.log(JSON.stringify(report, null, 2));
if (report.status !== "passed") {
  process.exit(1);
}
