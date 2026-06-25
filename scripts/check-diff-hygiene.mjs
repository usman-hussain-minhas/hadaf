import { spawnSync } from "node:child_process";

const checks = [
  ["working_tree_diff", ["diff", "--check"]],
  ["staged_diff", ["diff", "--cached", "--check"]]
];
const findings = [];

for (const [checkId, args] of checks) {
  const result = spawnSync("git", args, { encoding: "utf8" });
  if (result.status !== 0) {
    findings.push({
      checkId,
      command: `git ${args.join(" ")}`,
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim()
    });
  }
}

if (findings.length > 0) {
  console.error(JSON.stringify({ status: "failed", check: "diff_hygiene", findings }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ status: "passed", check: "diff_hygiene" }));
