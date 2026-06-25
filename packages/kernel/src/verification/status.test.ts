import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import test from "node:test";

import {
  reconcileStatusConfig,
  type StatusReconciliationConfig
} from "./status.js";

test("passes when closeout, git, and GitHub truth match", () => {
  const fixture = buildFixture();
  const report = reconcileStatusConfig(fixture.config);

  assert.equal(report.status, "passed");
  assert.deepEqual(report.findings, []);
  assert.deepEqual(report.classified_mismatches, []);
  assert.equal(report.verified_refs.length, 3);
  assert.equal(report.final_posture_recommendation, "fixture_posture");
});

test("classifies stale generated state without letting it override Git truth", () => {
  const fixture = buildFixture();
  writeJson(fixture.currentStatePath, {
    final_main_sha: fixture.previousSha,
    current_status: "HADAF_H00_QUALITY_FOUNDATION_IMPLEMENTED_WITH_INDEPENDENT_QUALIFICATION_DEBT"
  });
  writeJson(fixture.runtimePath, {
    main_sha: fixture.previousSha,
    checkpoint_hash: "sha256:pending-until-hasher",
    state: {
      main_sha: fixture.previousSha,
      posture: "HADAF_BOOTSTRAP_IMPLEMENTING"
    }
  });

  const report = reconcileStatusConfig(fixture.config);

  assert.equal(report.status, "passed");
  assertFinding(report.classified_mismatches, "current_state_stale_main_sha");
  assertFinding(report.classified_mismatches, "runtime_checkpoint_stale_main_sha");
  assertFinding(report.classified_mismatches, "runtime_checkpoint_placeholder_hash");
  assert.equal(report.findings.length, 0);
});

test("fails when a required closeout is missing", () => {
  const fixture = buildFixture();
  const report = reconcileStatusConfig({
    ...fixture.config,
    closeouts: [
      {
        ffetId: "H00-MISSING",
        path: join(fixture.root, "missing-closeout.json"),
        required: true
      }
    ]
  });

  assert.equal(report.status, "failed");
  assertFinding(report.findings, "missing_closeout");
});

test("fails when closeout and GitHub PR truth disagree", () => {
  const fixture = buildFixture();
  writeJson(fixture.closeoutPath, {
    closeoutFor: "H00-FIXTURE",
    prNumber: 42,
    exactHeadSha: fixture.gitSha,
    mergeSha: fixture.gitSha,
    implementationStatus: "implemented",
    qualificationStatus: "self_verified_with_independent_qualification_debt"
  });

  const report = reconcileStatusConfig(fixture.config);

  assert.equal(report.status, "failed");
  assertFinding(report.findings, "closeout_head_sha_mismatch");
  assertFinding(report.findings, "github_pr_head_sha_mismatch");
});

test("fails when generated status overclaims a forbidden posture", () => {
  const fixture = buildFixture();
  writeJson(fixture.currentStatePath, {
    final_main_sha: fixture.gitSha,
    current_status: "SELF_HOSTING_READY"
  });

  const report = reconcileStatusConfig(fixture.config);

  assert.equal(report.status, "failed");
  assertFinding(report.findings, "generated_status_overclaim");
});

function buildFixture(): {
  readonly root: string;
  readonly gitSha: string;
  readonly previousSha: string;
  readonly closeoutPath: string;
  readonly currentStatePath: string;
  readonly runtimePath: string;
  readonly config: StatusReconciliationConfig;
} {
  const root = mkdtempSync(join(tmpdir(), "hadaf-status-fixture-"));
  const productRoot = join(root, "product");
  mkdirSync(productRoot, { recursive: true });
  writeFileSync(join(productRoot, "README.md"), "one\n");
  git(productRoot, ["init"]);
  git(productRoot, ["config", "user.email", "fixture@example.test"]);
  git(productRoot, ["config", "user.name", "Fixture"]);
  git(productRoot, ["add", "README.md"]);
  git(productRoot, ["commit", "-m", "one"]);
  const previousSha = git(productRoot, ["rev-parse", "HEAD"]);
  writeFileSync(join(productRoot, "README.md"), "two\n");
  git(productRoot, ["add", "README.md"]);
  git(productRoot, ["commit", "-m", "two"]);
  const gitSha = git(productRoot, ["rev-parse", "HEAD"]);

  const controlRoot = join(root, "control");
  const runtimeRoot = join(root, "runtime");
  mkdirSync(controlRoot, { recursive: true });
  mkdirSync(runtimeRoot, { recursive: true });
  const closeoutPath = join(controlRoot, "closeout.json");
  const currentStatePath = join(controlRoot, "current-state.json");
  const runtimePath = join(runtimeRoot, "checkpoint.json");
  writeJson(closeoutPath, {
    closeoutFor: "H00-FIXTURE",
    prNumber: 42,
    exactHeadSha: previousSha,
    mergeSha: gitSha,
    implementationStatus: "implemented",
    qualificationStatus: "self_verified_with_independent_qualification_debt"
  });
  writeJson(currentStatePath, {
    final_main_sha: gitSha,
    current_status: "HADAF_H00_FOUNDATION_SELF_VERIFIED_WITH_INDEPENDENT_QUALIFICATION_DEBT"
  });
  writeJson(runtimePath, {
    main_sha: gitSha,
    checkpoint_hash: `sha256:${sha256("checkpoint")}`,
    state: {
      main_sha: gitSha,
      posture: "HADAF_H00_FOUNDATION_SELF_VERIFIED_WITH_INDEPENDENT_QUALIFICATION_DEBT"
    }
  });

  return {
    root,
    gitSha,
    previousSha,
    closeoutPath,
    currentStatePath,
    runtimePath,
    config: {
      productRoot,
      expectedMainSha: gitSha,
      githubPullRequests: [
        {
          number: 42,
          state: "MERGED",
          headRefOid: previousSha,
          mergeCommit: { oid: gitSha }
        }
      ],
      githubExpectations: [
        {
          number: 42,
          state: "MERGED",
          headSha: previousSha,
          mergeSha: gitSha
        }
      ],
      closeouts: [
        {
          ffetId: "H00-FIXTURE",
          path: closeoutPath,
          required: true,
          prNumber: 42,
          headSha: previousSha,
          mergeSha: gitSha,
          allowedImplementationStatuses: ["implemented"],
          allowedQualificationStatuses: ["self_verified_with_independent_qualification_debt"]
        }
      ],
      generatedStateRecords: [
        {
          id: "fixture-current-state",
          path: currentStatePath,
          kind: "current_state",
          mainShaFields: ["final_main_sha"],
          claimFields: ["current_status"],
          allowStale: true
        },
        {
          id: "fixture-runtime",
          path: runtimePath,
          kind: "runtime_checkpoint",
          mainShaFields: ["main_sha", "state.main_sha"],
          placeholderHashFields: ["checkpoint_hash"],
          claimFields: ["state.posture"],
          allowStale: true,
          allowPlaceholderHashes: true
        }
      ],
      forbiddenClaims: ["self_hosting_ready", "release_candidate", "production_ready"],
      finalPostureRecommendation: "fixture_posture",
      cannotClaim: ["fixture_claim"]
    }
  };
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function git(cwd: string, args: readonly string[]): string {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim());
  }
  return result.stdout.trim();
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function assertFinding(
  findings: readonly { readonly kind: string }[],
  kind: string
): void {
  assert.equal(
    findings.some((finding) => finding.kind === kind),
    true
  );
}
