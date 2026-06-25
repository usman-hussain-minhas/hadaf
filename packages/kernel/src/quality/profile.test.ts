import assert from "node:assert/strict";
import test from "node:test";

import {
  QUALITY_PROFILE_COMPILER_VERSION,
  compileHadafDogfoodQualityProfile,
  getHadafDogfoodQualityAuthorityInput,
  getHadafDogfoodQualityProfileInput
} from "./profile.js";

const PROFILE_HASH = "sha256:3501e4e3a179c37ef572bd1faca51808d1f1863a6b84b49e211bb1801e8d2688";

test("compiles the HADAF dogfood quality profile with source-bound authority", () => {
  const profile = compileHadafDogfoodQualityProfile();

  assert.equal(profile.qualityProfileId, "hadaf_dogfood_quality_v1");
  assert.equal(profile.version, "1.0.0");
  assert.equal(profile.scope, "hadaf_dogfood");
  assert.deepEqual(profile.inheritedFrom, [
    "hadaf_quality_constitution_v1",
    "node_typescript_stack_quality_v1",
    "hadaf_v1_project_pack"
  ]);
  assert.equal(profile.profileHash, PROFILE_HASH);
  assert.match(profile.compiledProfileHash, /^sha256:[a-f0-9]{64}$/);
  assert.notEqual(profile.compiledProfileHash, profile.profileHash);
  assert.equal(profile.compiler.name, "hadaf.quality.compiler");
  assert.equal(profile.compiler.version, QUALITY_PROFILE_COMPILER_VERSION);
  assert.equal(profile.testing.changedLineCoverageMin, 0.9);
  assert.equal(profile.testing.changedBranchCoverageMin, 0.8);
  assert.equal(profile.security.secretScanRequired, true);
  assert.equal(profile.review.implementingAgentSelfAttestationForbidden, true);
  assert.deepEqual(
    profile.sourceBinding.sources.map((source) => source.sourceKind).sort(),
    [
      "control_amendment",
      "project_pack",
      "quality_constitution",
      "stack_pack",
      "stack_pack_template"
    ]
  );
  assert.equal(
    profile.cannotClaim.includes("node_typescript_stack_quality_v1_concrete_artifact_pending"),
    true
  );
});

test("compiles stable profile and envelope hashes from identical input", () => {
  const first = compileHadafDogfoodQualityProfile();
  const second = compileHadafDogfoodQualityProfile();

  assert.equal(first.profileHash, second.profileHash);
  assert.equal(first.compiledProfileHash, second.compiledProfileHash);
  assert.equal(first.sourceBinding.sourceBindingHash, second.sourceBinding.sourceBindingHash);
});

test("returns defensive copies of source profile and authority input", () => {
  const input = getHadafDogfoodQualityProfileInput();
  const authority = getHadafDogfoodQualityAuthorityInput();

  (input.inheritedFrom as string[]).push("mutated_by_test");
  (authority.sources as unknown as Array<{ sourceId: string }>).push({ sourceId: "mutated" });

  assert.equal(
    compileHadafDogfoodQualityProfile().inheritedFrom.includes("mutated_by_test"),
    false
  );
  assert.equal(
    getHadafDogfoodQualityAuthorityInput().sources.some((source) => source.sourceId === "mutated"),
    false
  );
});

test("allows stricter coverage thresholds and records overrides", () => {
  const profile = compileHadafDogfoodQualityProfile({
    testing: {
      changedLineCoverageMin: 0.95,
      criticalBoxBranchCoverageMin: 0.92
    }
  });

  assert.equal(profile.testing.changedLineCoverageMin, 0.95);
  assert.equal(profile.testing.criticalBoxBranchCoverageMin, 0.92);
  assert.deepEqual(
    profile.overrides.map((override) => [override.path, override.direction]),
    [
      ["testing.changedLineCoverageMin", "stricter"],
      ["testing.criticalBoxBranchCoverageMin", "stricter"]
    ]
  );
});

test("rejects weakened coverage thresholds without waiver", () => {
  assert.throws(
    () =>
      compileHadafDogfoodQualityProfile({
        testing: {
          changedLineCoverageMin: 0.5
        }
      }),
    /changedLineCoverageMin.*without waiver/
  );
});

test("allows weakened numeric thresholds only with waiver debt and cannot_claim", () => {
  const profile = compileHadafDogfoodQualityProfile(
    {
      testing: {
        changedLineCoverageMin: 0.85
      }
    },
    {
      waivers: [
        {
          waiverId: "WAIVER-H00-example",
          paths: ["testing.changedLineCoverageMin"],
          reason: "bounded bootstrap calibration example",
          approvedBy: "human",
          expiresAt: "2026-07-01T00:00:00Z",
          cannotClaim: ["full_quality_gate_pass"]
        }
      ]
    }
  );

  assert.equal(profile.testing.changedLineCoverageMin, 0.85);
  assert.deepEqual(profile.waiverRefs, ["WAIVER-H00-example"]);
  assert.equal(profile.overrides[0]?.direction, "weakened_with_waiver");
  assert.equal(profile.qualityDebt[0]?.waiverRef, "WAIVER-H00-example");
  assert.equal(profile.cannotClaim.includes("full_quality_gate_pass"), true);
});

test("rejects source binding hash drift", () => {
  const authority = getHadafDogfoodQualityAuthorityInput();

  assert.throws(
    () =>
      compileHadafDogfoodQualityProfile(
        {},
        {
          authority: {
            ...authority,
            expectedSourceBindingHash:
              "sha256:0000000000000000000000000000000000000000000000000000000000000000"
          }
        }
      ),
    /source binding drift/
  );
});

test("rejects built-in source binding drift by default", () => {
  const authority = getHadafDogfoodQualityAuthorityInput();
  const [firstSource, ...remainingSources] = authority.sources;
  assert.ok(firstSource);

  assert.throws(
    () =>
      compileHadafDogfoodQualityProfile(
        {},
        {
          authority: {
            ...authority,
            sources: [
              {
                ...firstSource,
                sha256: "sha256:1111111111111111111111111111111111111111111111111111111111111111"
              },
              ...remainingSources
            ]
          }
        }
      ),
    /source binding drift/
  );
});

test("rejects compiled profile hash drift", () => {
  assert.throws(
    () =>
      compileHadafDogfoodQualityProfile(
        {},
        {
          expectedCompiledProfileHash:
            "sha256:0000000000000000000000000000000000000000000000000000000000000000"
        }
      ),
    /Compiled quality profile hash drift/
  );
});

test("uses canonical unique waiver refs when hashing the compiled envelope", () => {
  const waiver = {
    waiverId: "WAIVER-H00-shared",
    paths: ["testing.changedLineCoverageMin", "testing.changedBranchCoverageMin"],
    reason: "bounded bootstrap calibration example",
    approvedBy: "human",
    expiresAt: "2026-07-01T00:00:00Z",
    cannotClaim: ["full_quality_gate_pass"]
  };
  const first = compileHadafDogfoodQualityProfile(
    {
      testing: {
        changedLineCoverageMin: 0.85,
        changedBranchCoverageMin: 0.75
      }
    },
    { waivers: [waiver] }
  );
  const second = compileHadafDogfoodQualityProfile(
    {
      testing: {
        changedLineCoverageMin: 0.85,
        changedBranchCoverageMin: 0.75
      }
    },
    { waivers: [waiver] }
  );

  assert.deepEqual(first.waiverRefs, ["WAIVER-H00-shared"]);
  assert.equal(first.compiledProfileHash, second.compiledProfileHash);
});

test("rejects semantic ranges outside valid bounds", () => {
  assert.throws(
    () =>
      compileHadafDogfoodQualityProfile({
        testing: {
          changedLineCoverageMin: 1.1
        }
      }),
    /semantic range 0..1/
  );
});

test("rejects zero line-count thresholds before schema validation", () => {
  assert.throws(
    () =>
      compileHadafDogfoodQualityProfile({
        maintainability: {
          functionSizeWarningLines: 0
        }
      }),
    /functionSizeWarningLines/
  );

  assert.throws(
    () =>
      compileHadafDogfoodQualityProfile({
        maintainability: {
          noNewDuplicateBlockOverLines: 0
        }
      }),
    /noNewDuplicateBlockOverLines/
  );
});

test("rejects inconsistent cross-field thresholds", () => {
  assert.throws(
    () =>
      compileHadafDogfoodQualityProfile({
        maintainability: {
          complexityWarning: 5,
          complexityHardReview: 4
        }
      }),
    /must be <=/
  );
});

test("rejects weakened performance budgets and disabled required booleans", () => {
  assert.throws(
    () =>
      compileHadafDogfoodQualityProfile({
        performance: {
          hmcLcpMs: 3000
        }
      }),
    /hmcLcpMs.*without waiver/
  );

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
