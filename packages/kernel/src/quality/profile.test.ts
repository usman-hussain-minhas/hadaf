import assert from "node:assert/strict";
import test from "node:test";

import {
  compileHadafDogfoodQualityProfile,
  getHadafDogfoodQualityProfileInput
} from "./profile.js";

test("compiles the HADAF dogfood quality profile with required inheritance", () => {
  const profile = compileHadafDogfoodQualityProfile();

  assert.equal(profile.qualityProfileId, "hadaf_dogfood_quality_v1");
  assert.equal(profile.version, "1.0.0");
  assert.equal(profile.scope, "hadaf_dogfood");
  assert.deepEqual(profile.inheritedFrom, [
    "hadaf_quality_constitution_v1",
    "node_typescript_stack_quality_v1",
    "hadaf_v1_project_pack"
  ]);
  assert.equal(profile.testing.changedLineCoverageMin, 0.9);
  assert.equal(profile.testing.changedBranchCoverageMin, 0.8);
  assert.equal(profile.security.secretScanRequired, true);
  assert.equal(profile.review.implementingAgentSelfAttestationForbidden, true);
  assert.match(profile.profileHash, /^sha256:[a-f0-9]{64}$/);
});

test("compiles a stable profile hash from identical input", () => {
  const first = compileHadafDogfoodQualityProfile();
  const second = compileHadafDogfoodQualityProfile();

  assert.equal(first.profileHash, second.profileHash);
});

test("returns a defensive copy of the source profile input", () => {
  const input = getHadafDogfoodQualityProfileInput();

  (input.inheritedFrom as string[]).push("mutated_by_test");

  assert.equal(
    compileHadafDogfoodQualityProfile().inheritedFrom.includes("mutated_by_test"),
    false
  );
});

test("allows stricter coverage thresholds", () => {
  const profile = compileHadafDogfoodQualityProfile({
    testing: {
      changedLineCoverageMin: 0.95,
      criticalBoxBranchCoverageMin: 0.92
    }
  });

  assert.equal(profile.testing.changedLineCoverageMin, 0.95);
  assert.equal(profile.testing.criticalBoxBranchCoverageMin, 0.92);
});

test("rejects weakened coverage thresholds", () => {
  assert.throws(
    () =>
      compileHadafDogfoodQualityProfile({
        testing: {
          changedLineCoverageMin: 0.5
        }
      }),
    /changedLineCoverageMin/
  );
});

test("rejects weakened performance budgets", () => {
  assert.throws(
    () =>
      compileHadafDogfoodQualityProfile({
        performance: {
          hmcLcpMs: 3000
        }
      }),
    /hmcLcpMs/
  );
});

test("rejects disabled required boolean checks", () => {
  assert.throws(
    () =>
      compileHadafDogfoodQualityProfile({
        testing: {
          flakyTestsForbidden: false
        }
      }),
    /flakyTestsForbidden/
  );
});
