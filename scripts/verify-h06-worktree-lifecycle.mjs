import { readFileSync } from "node:fs";
import { verifyH06WorktreeLifecycleConfig } from "../packages/kernel/dist/h06/worktree-lifecycle.js";
import { readRequiredSinglePathArg } from "./lib/cli-args.mjs";

const configPath = readRequiredSinglePathArg({
  check: "h06_worktree_lifecycle_verifier",
  usage: "Usage: node scripts/verify-h06-worktree-lifecycle.mjs <config.json>"
});

const report = verifyH06WorktreeLifecycleConfig(JSON.parse(readFileSync(configPath, "utf8")));
console.log(JSON.stringify(report, null, 2));

if (report.status !== "passed") {
  process.exit(1);
}
