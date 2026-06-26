import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

import {
  verifyH06WorktreeLifecycleConfig,
  type H06WorktreeLifecycleConfig
} from "./worktree-lifecycle.js";

const configPath = "fixtures/h06-worktree-lifecycle/valid-config.json";

function loadConfig(): H06WorktreeLifecycleConfig {
  return JSON.parse(readFileSync(configPath, "utf8")) as H06WorktreeLifecycleConfig;
}

test("verifies H06 worktree lifecycle records and boundaries", () => {
  const report = verifyH06WorktreeLifecycleConfig(loadConfig());

  assert.equal(report.status, "passed");
  assert.deepEqual(report.findings, []);
  assert.equal(report.registry_results.length, 9);
  assert.equal(report.final_posture_recommendation, "H06_F01_WORKTREE_LIFECYCLE_FIXTURE_VERIFIED");
  assert(report.verified_refs.some((ref) => ref.source === "schema"));
  assert(report.verified_refs.some((ref) => ref.source === "schema_ref"));
  assert(report.verified_refs.some((ref) => ref.source === "registry"));
  assert(report.cannot_claim.includes("H08_git_ci_pr_merge_conductor_implemented"));
});

test("calibrates worktree lifecycle negative fixtures", () => {
  const report = verifyH06WorktreeLifecycleConfig(loadConfig());
  const results = new Map(report.registry_results.map((result) => [result.registryId, result]));

  assert.equal(results.get("wt-H06-F01-active")?.status, "passed");
  assert.equal(results.get("wt-H06-F01-cleaned")?.status, "passed");
  assert.equal(results.get("wt-H06-F01-relative-cwd")?.status, "failed");
  assert.equal(results.get("wt-H06-F01-wrong-path")?.status, "failed");
  assert.equal(results.get("wt-H06-F01-branch-mismatch")?.status, "failed");
  assert.equal(results.get("wt-H06-F01-product-runtime")?.status, "failed");
  assert.equal(results.get("wt-H06-F01-private-path")?.status, "failed");
  assert.equal(results.get("wt-H06-F01-source-mutation")?.status, "failed");
  assert.equal(results.get("wt-H06-F01-missing-cannot-claim")?.status, "failed");

  for (const kind of [
    "relative_cwd_allowed",
    "worktree_path_suffix_mismatch",
    "branch_identity_mismatch",
    "schema_validation_failed",
    "private_path_in_worktree_registry",
    "source_mutation_boundary_violation",
    "required_cannot_claim_missing"
  ]) {
    assert(report.classified_mismatches.some((finding) => finding.kind === kind), kind);
  }
});

test("fails when the configured schema hash is a placeholder", () => {
  const loaded = loadConfig();
  const config = {
    ...loaded,
    schema: {
      ...loaded.schema,
      sha256: "pending-worktree-registry-schema-hash"
    }
  };

  const report = verifyH06WorktreeLifecycleConfig(config);

  assert.equal(report.status, "failed");
  assert(report.findings.some((finding) => finding.kind === "schema_hash_invalid_placeholder"));
});

test("fails when a worktree registry hash drifts", () => {
  const loaded = loadConfig();
  const [validRegistry] = loaded.registries;
  assert(validRegistry);
  const config = {
    ...loaded,
    registries: [
      {
        ...validRegistry,
        sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      }
    ]
  };

  const report = verifyH06WorktreeLifecycleConfig(config);

  assert.equal(report.status, "failed");
  assert(report.findings.some((finding) => finding.kind === "worktree_registry_hash_mismatch"));
});

test("fails when an expected worktree negative finding is not observed", () => {
  const loaded = loadConfig();
  const [validRegistry] = loaded.registries;
  assert(validRegistry);
  const config = {
    ...loaded,
    registries: [
      {
        ...validRegistry,
        expectedStatus: "failed" as const,
        expectedFindingKinds: ["branch_identity_mismatch"]
      }
    ]
  };

  const report = verifyH06WorktreeLifecycleConfig(config);

  assert.equal(report.status, "failed");
  assert(report.findings.some((finding) => finding.kind === "worktree_registry_status_unexpected"));
  assert(report.findings.some((finding) => finding.kind === "expected_negative_finding_missing"));
});
