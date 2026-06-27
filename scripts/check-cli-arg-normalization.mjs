import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const tempRoot = mkdtempSync(join(tmpdir(), "hadaf-cli-args-"));

const fixturePaths = buildFixturePaths();
const cases = [
  pnpmCase("hmc-direct", ["verify:hmc-state", "fixtures/hmc-state/valid-config.json"]),
  pnpmCase("hmc-separator", ["verify:hmc-state", "--", "fixtures/hmc-state/valid-config.json"]),
  pnpmCase("preview-direct", ["verify:product-preview", "fixtures/product-preview/valid-config.json"]),
  pnpmCase("preview-separator", ["verify:product-preview", "--", "fixtures/product-preview/valid-config.json"]),
  pnpmCase("source-manifest-direct", ["verify:source-manifest", "fixtures/source-manifest/valid-config.json"]),
  pnpmCase("source-manifest-separator", ["verify:source-manifest", "--", "fixtures/source-manifest/valid-config.json"]),
  pnpmCase("source-authority-direct", ["classify:source-authority", "fixtures/source-classification/valid-config.json"]),
  pnpmCase("source-authority-separator", ["classify:source-authority", "--", "fixtures/source-classification/valid-config.json"]),
  pnpmCase("evidence-direct", ["verify:evidence", fixturePaths.evidenceConfig]),
  pnpmCase("evidence-separator", ["verify:evidence", "--", fixturePaths.evidenceConfig]),
  pnpmCase("status-direct", ["verify:status", fixturePaths.statusConfig]),
  pnpmCase("status-separator", ["verify:status", "--", fixturePaths.statusConfig]),
  pnpmCase("quality-direct", ["verify:quality-classification", fixturePaths.qualityReport]),
  pnpmCase("quality-separator", ["verify:quality-classification", "--", fixturePaths.qualityReport]),
  pnpmCase("h03-schema-registry-direct", ["verify:h03-schema-registry", "fixtures/h03-schema-registry/valid-config.json"]),
  pnpmCase("h03-schema-registry-separator", ["verify:h03-schema-registry", "--", "fixtures/h03-schema-registry/valid-config.json"]),
  pnpmCase("h03-input-authority-direct", ["verify:h03-input-authority", "fixtures/h03-input-authority/valid-config.json"]),
  pnpmCase("h03-input-authority-separator", ["verify:h03-input-authority", "--", "fixtures/h03-input-authority/valid-config.json"]),
  pnpmCase("h03-plan-normalization-direct", ["verify:h03-plan-normalization", "fixtures/h03-plan-normalization/valid-config.json"]),
  pnpmCase("h03-plan-normalization-separator", ["verify:h03-plan-normalization", "--", "fixtures/h03-plan-normalization/valid-config.json"]),
  pnpmCase("h03-question-register-direct", ["verify:h03-question-register", "fixtures/h03-question-register/valid-config.json"]),
  pnpmCase("h03-question-register-separator", ["verify:h03-question-register", "--", "fixtures/h03-question-register/valid-config.json"]),
  pnpmCase("h03-delivery-constitution-direct", ["verify:h03-delivery-constitution", "fixtures/h03-delivery-constitution/valid-config.json"]),
  pnpmCase("h03-delivery-constitution-separator", ["verify:h03-delivery-constitution", "--", "fixtures/h03-delivery-constitution/valid-config.json"]),
  pnpmCase("h03-constitution-readiness-direct", ["verify:h03-constitution-readiness", "fixtures/h03-constitution-readiness/valid-config.json"]),
  pnpmCase("h03-constitution-readiness-separator", ["verify:h03-constitution-readiness", "--", "fixtures/h03-constitution-readiness/valid-config.json"]),
  pnpmCase("h05-agent-registry-direct", ["verify:h05-agent-registry", "fixtures/h05-agent-registry/valid-config.json"]),
  pnpmCase("h05-agent-registry-separator", ["verify:h05-agent-registry", "--", "fixtures/h05-agent-registry/valid-config.json"]),
  pnpmCase("h05-capability-contracts-direct", ["verify:h05-capability-contracts", "fixtures/h05-capability-contracts/valid-config.json"]),
  pnpmCase("h05-capability-contracts-separator", ["verify:h05-capability-contracts", "--", "fixtures/h05-capability-contracts/valid-config.json"]),
  pnpmCase("h05-circuit-breakers-direct", ["verify:h05-circuit-breakers", "fixtures/h05-circuit-breakers/valid-config.json"]),
  pnpmCase("h05-circuit-breakers-separator", ["verify:h05-circuit-breakers", "--", "fixtures/h05-circuit-breakers/valid-config.json"]),
  pnpmCase("h05-upskill-records-direct", ["verify:h05-upskill-records", "fixtures/h05-upskill-records/valid-config.json"]),
  pnpmCase("h05-upskill-records-separator", ["verify:h05-upskill-records", "--", "fixtures/h05-upskill-records/valid-config.json"]),
  pnpmCase("h05-agent-projection-direct", ["verify:h05-agent-projection", "fixtures/h05-agent-projection/valid-config.json"]),
  pnpmCase("h05-agent-projection-separator", ["verify:h05-agent-projection", "--", "fixtures/h05-agent-projection/valid-config.json"]),
  pnpmCase("h06-resource-quotas-direct", ["verify:h06-resource-quotas", "fixtures/h06-resource-quotas/valid-config.json"]),
  pnpmCase("h06-resource-quotas-separator", ["verify:h06-resource-quotas", "--", "fixtures/h06-resource-quotas/valid-config.json"]),
  pnpmCase("h06-worktree-lifecycle-direct", ["verify:h06-worktree-lifecycle", "fixtures/h06-worktree-lifecycle/valid-config.json"]),
  pnpmCase("h06-worktree-lifecycle-separator", ["verify:h06-worktree-lifecycle", "--", "fixtures/h06-worktree-lifecycle/valid-config.json"]),
  pnpmCase("h06-locks-checkpoints-quarantine-direct", ["verify:h06-locks-checkpoints-quarantine", "fixtures/h06-locks-checkpoints-quarantine/valid-config.json"]),
  pnpmCase("h06-locks-checkpoints-quarantine-separator", ["verify:h06-locks-checkpoints-quarantine", "--", "fixtures/h06-locks-checkpoints-quarantine/valid-config.json"]),
  pnpmCase("h06-pod-scheduler-direct", ["verify:h06-pod-scheduler", "fixtures/h06-pod-scheduler/valid-config.json"]),
  pnpmCase("h06-pod-scheduler-separator", ["verify:h06-pod-scheduler", "--", "fixtures/h06-pod-scheduler/valid-config.json"]),
  pnpmCase("h06-local-lifecycle-runner-direct", ["verify:h06-local-lifecycle-runner", "fixtures/h06-local-lifecycle-runner/valid-config.json"]),
  pnpmCase("h06-local-lifecycle-runner-separator", ["verify:h06-local-lifecycle-runner", "--", "fixtures/h06-local-lifecycle-runner/valid-config.json"]),
  pnpmCase("target-guard-direct", ["check:target-guard", "fixtures/target-guard/valid-config.json"]),
  pnpmCase("target-guard-separator", ["check:target-guard", "--", "fixtures/target-guard/valid-config.json"]),
  nodeCase("pr-metadata-direct", ["scripts/check-pr-metadata-public-safety.mjs", fixturePaths.prBody]),
  nodeCase("pr-metadata-separator", ["scripts/check-pr-metadata-public-safety.mjs", "--", fixturePaths.prBody]),
  nodeCase("missing-required-arg-fails", ["scripts/verify-hmc-state.mjs"], 1),
  nodeCase("excess-required-arg-fails", [
    "scripts/verify-hmc-state.mjs",
    "fixtures/hmc-state/valid-config.json",
    "fixtures/hmc-state/valid-config.json"
  ], 1),
  {
    name: "hyphen-prefixed-path-direct",
    command: process.execPath,
    args: [resolve(rootDir, "scripts/verify-hmc-state.mjs"), "-hmc.json"],
    cwd: fixturePaths.hyphenCwd,
    expectedStatus: 0
  }
];

const failures = cases.flatMap(runCase);
if (failures.length > 0) {
  console.error(JSON.stringify({ status: "failed", check: "cli_arg_normalization", failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: "passed",
  check: "cli_arg_normalization",
  cases: cases.length
}));

function pnpmCase(name, args, expectedStatus = 0) {
  return { name, command: "pnpm", args, cwd: rootDir, expectedStatus };
}

function nodeCase(name, args, expectedStatus = 0) {
  return { name, command: process.execPath, args, cwd: rootDir, expectedStatus };
}

function runCase(testCase) {
  const result = spawnSync(testCase.command, testCase.args, {
    cwd: testCase.cwd,
    encoding: "utf8"
  });
  if (result.status === testCase.expectedStatus) return [];
  return [{
    name: testCase.name,
    expectedStatus: testCase.expectedStatus,
    actualStatus: result.status,
    stdout: compact(result.stdout),
    stderr: compact(result.stderr)
  }];
}

function buildFixturePaths() {
  const evidenceRoot = join(tempRoot, "evidence");
  const controlRoot = join(tempRoot, "control");
  mkdirSync(join(evidenceRoot, "sample"), { recursive: true });
  mkdirSync(join(controlRoot, "sample"), { recursive: true });
  const artifactText = JSON.stringify({ status: "passed" });
  const artifactHash = sha256(artifactText);
  writeFileSync(join(evidenceRoot, "sample/artifact.json"), artifactText);
  writeFileSync(
    join(controlRoot, "sample/manifest.json"),
    JSON.stringify({
      artifacts: [
        {
          ref: "evidence://sample/artifact.json",
          sha256: artifactHash
        }
      ]
    })
  );
  const evidenceConfig = join(tempRoot, "evidence-config.json");
  writeFileSync(
    evidenceConfig,
    JSON.stringify({
      logicalRoots: {
        control: controlRoot,
        evidence: evidenceRoot
      },
      manifestRefs: ["control://sample/manifest.json"],
      requiredRefs: ["evidence://sample/artifact.json"]
    })
  );

  const statusConfig = join(tempRoot, "status-config.json");
  writeFileSync(statusConfig, JSON.stringify({ finalPostureRecommendation: "fixture_only" }));

  const qualityReport = join(tempRoot, "quality-report.json");
  writeFileSync(
    qualityReport,
    JSON.stringify({
      dimensions: [
        {
          dimensionId: "fixture",
          maturity: "ci_enforced",
          status: "passed",
          executable: true,
          command: "fixture"
        }
      ],
      cannotClaim: ["fixture_only"]
    })
  );

  const prBody = join(tempRoot, "pr-body.md");
  writeFileSync(prBody, "Public-safe PR body fixture.\n");

  const hyphenCwd = join(tempRoot, "hyphen");
  mkdirSync(hyphenCwd, { recursive: true });
  writeFileSync(join(hyphenCwd, "-hmc.json"), readFileSync(join(rootDir, "fixtures/hmc-state/valid-config.json")));

  return {
    evidenceConfig,
    statusConfig,
    qualityReport,
    prBody,
    hyphenCwd
  };
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function compact(text) {
  return text.length > 800 ? `${text.slice(0, 800)}...<truncated>` : text;
}
