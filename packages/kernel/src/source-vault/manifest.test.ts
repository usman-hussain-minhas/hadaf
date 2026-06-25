import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

import {
  fingerprintSource,
  verifySourceManifestConfig,
  type SourceManifestVerificationConfig
} from "./manifest.js";

test("verifies a valid read-only source manifest", () => {
  const fixture = buildFixture();
  const report = verifySourceManifestConfig(fixture.config);

  assert.equal(report.status, "passed");
  assert.deepEqual(report.findings, []);
  assert.equal(report.verified_refs.length, 2);
  assert.equal(report.source_fingerprints[0]?.sha256, fixture.fingerprint);
  assert.equal(report.final_posture_recommendation, "fixture_posture");
});

test("supports multiple source roots without private paths in product code", () => {
  const first = buildFixture("first");
  const second = buildFixture("second");
  const report = verifySourceManifestConfig({
    logicalRoots: {
      first: first.root,
      second: second.root
    },
    sources: [
      { ...first.source, rootRef: "first://" },
      { ...second.source, rootRef: "second://" }
    ],
    cannotClaim: ["real_h01_config_external_only"]
  });

  assert.equal(report.status, "passed");
  assert.equal(report.source_fingerprints.length, 2);
  assert.deepEqual(report.cannot_claim, ["real_h01_config_external_only"]);
});

test("fails on missing and changed source files", () => {
  const fixture = buildFixture();
  const report = verifySourceManifestConfig({
    ...fixture.config,
    sources: [
      {
        ...fixture.source,
        files: [
          {
            path: "README.md",
            sha256: sha256("changed\n")
          },
          {
            path: "missing.md",
            sha256: sha256("missing\n")
          }
        ]
      }
    ]
  });

  assert.equal(report.status, "failed");
  assertFinding(report, "source_file_hash_mismatch");
  assertFinding(report, "missing_source_file");
});

test("fails on source fingerprint drift and placeholder hashes", () => {
  const fixture = buildFixture();
  const report = verifySourceManifestConfig({
    ...fixture.config,
    sources: [
      {
        ...fixture.source,
        expectedFingerprintSha256: sha256("wrong"),
        files: [
          {
            path: "README.md",
            sha256: "sha256:pending-hash"
          }
        ]
      }
    ]
  });

  assert.equal(report.status, "failed");
  assertFinding(report, "placeholder_hash");
  assertFinding(report, "source_fingerprint_mismatch");
});

test("fails when source entries or logical refs escape the root", () => {
  const fixture = buildFixture();
  const report = verifySourceManifestConfig({
    logicalRoots: {
      source: fixture.root
    },
    sources: [
      {
        ...fixture.source,
        rootRef: "source://../outside",
        files: [
          {
            path: "../outside.txt",
            sha256: sha256("outside")
          }
        ]
      },
      {
        ...fixture.source,
        rootRef: "source://",
        files: [
          {
            path: "../outside.txt",
            sha256: sha256("outside")
          }
        ]
      }
    ]
  });

  assert.equal(report.status, "failed");
  assertFinding(report, "logical_ref_escapes_root");
  assertFinding(report, "source_entry_escapes_root");
});

test("fails when READ_ONLY_DIGEST write controls are not read-only", () => {
  const fixture = buildFixture();
  const report = verifySourceManifestConfig({
    ...fixture.config,
    sources: [
      {
        ...fixture.source,
        writePermission: "approved_target_only",
        mutationAllowed: true
      }
    ]
  });

  assert.equal(report.status, "failed");
  assertFinding(report, "write_permission_expected_for_read_only_source");
  assertFinding(report, "mutation_expected_forbidden_for_read_only_source");
});

function buildFixture(label = "fixture"): {
  readonly root: string;
  readonly source: SourceManifestVerificationConfig["sources"][number];
  readonly config: SourceManifestVerificationConfig;
  readonly fingerprint: string;
} {
  const root = mkdtempSync(join(tmpdir(), `hadaf-source-${label}-`));
  mkdirSync(join(root, "docs"), { recursive: true });
  writeFileSync(join(root, "README.md"), "source readme\n");
  writeFileSync(join(root, "docs/guide.md"), "source guide\n");
  const verified = [
    {
      ref: "source-file://source-fixture/README.md",
      path: join(root, "README.md"),
      sha256: sha256("source readme\n"),
      sourceId: "source-fixture"
    },
    {
      ref: "source-file://source-fixture/docs/guide.md",
      path: join(root, "docs/guide.md"),
      sha256: sha256("source guide\n"),
      sourceId: "source-fixture"
    }
  ];
  const fingerprint = fingerprintSource("source-fixture", verified).sha256;
  const source = {
    sourceId: "source-fixture",
    rootRef: "source://",
    sourceType: "READ_ONLY_DIGEST",
    writePermission: "forbidden",
    mutationAllowed: false,
    expectedFingerprintSha256: fingerprint,
    files: [
      {
        path: "README.md",
        sha256: sha256("source readme\n")
      },
      {
        path: "docs/guide.md",
        sha256: sha256("source guide\n")
      }
    ]
  };

  return {
    root,
    source,
    fingerprint,
    config: {
      logicalRoots: {
        source: root
      },
      sources: [source],
      finalPostureRecommendation: "fixture_posture",
      cannotClaim: ["fixture_claim"]
    }
  };
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function assertFinding(
  report: ReturnType<typeof verifySourceManifestConfig>,
  kind: string
): void {
  assert.equal(
    report.findings.some((finding) => finding.kind === kind),
    true
  );
}
