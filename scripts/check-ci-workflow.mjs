import { readFileSync } from "node:fs";

const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
const expectedPinnedActions = [
  "actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5",
  "actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020"
];
const floatingActionPattern = /uses:\s+[^@\s]+@[A-Za-z0-9._-]*[A-Za-z._-][A-Za-z0-9._-]*/g;
const failures = [];

for (const action of expectedPinnedActions) {
  if (!workflow.includes(action)) {
    failures.push(`Missing pinned action ${action}`);
  }
}

for (const match of workflow.matchAll(floatingActionPattern)) {
  if (!/[a-f0-9]{40}$/.test(match[0])) {
    failures.push(`Workflow action is not pinned to a full commit SHA: ${match[0]}`);
  }
}

if (!/permissions:\s*\n\s+contents:\s+read/m.test(workflow)) {
  failures.push("Workflow must use least-privilege contents: read permissions");
}

if (!/run:\s+pnpm run quality/m.test(workflow)) {
  failures.push("Workflow must run the classified quality gate through pnpm run quality");
}

if (failures.length > 0) {
  console.error(JSON.stringify({ status: "failed", check: "ci_workflow", failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ status: "passed", check: "ci_workflow" }));
