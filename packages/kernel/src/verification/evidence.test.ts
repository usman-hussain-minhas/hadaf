import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import test from "node:test";

import {
  verifyEvidenceConfig,
  type EvidenceVerificationConfig
} from "./evidence.js";

test("verifies manifest refs, required refs, and product file hashes", () => {
  const fixture = buildFixture();
  const report = verifyEvidenceConfig(fixture.config);

  assert.equal(report.status, "passed");
  assert.deepEqual(report.findings, []);
  assert.equal(
    report.verified_refs.some((item) => item.ref === "evidence://sample/artifact.json"),
    true
  );
  assert.equal(
    report.verified_refs.some((item) => item.ref === "product://README.md"),
    true
  );
  assert.equal(report.final_posture_recommendation, "fixture_posture");
});

test("rejects hash mismatches and placeholder hashes", () => {
  const fixture = buildFixture();
  const report = verifyEvidenceConfig({
    ...fixture.config,
    expectedArtifacts: [
      {
        ref: "evidence://sample/artifact.json",
        sha256: "sha256:pending-artifact"
      },
      {
        ref: "evidence://sample/other.json",
        sha256: sha256("missing")
      }
    ]
  });

  assert.equal(report.status, "failed");
  assertFinding(report, "placeholder_hash");
  assertFinding(report, "missing_ref");
});

test("rejects required refs not bound by manifests or expectations", () => {
  const fixture = buildFixture();
  const report = verifyEvidenceConfig({
    ...fixture.config,
    requiredRefs: [
      "evidence://sample/artifact.json",
      "evidence://sample/unbound.json"
    ]
  });

  assert.equal(report.status, "failed");
  assertFinding(report, "unbound_required_ref");
});

test("rejects stale product git sha", () => {
  const fixture = buildFixture();
  const report = verifyEvidenceConfig({
    ...fixture.config,
    productFiles: [
      {
        path: "README.md",
        sha256: fixture.readmeHash,
        gitSha: "0000000000000000000000000000000000000000"
      }
    ]
  });

  assert.equal(report.status, "failed");
  assertFinding(report, "stale_product_sha");
});

test("rejects product file hash mismatch at exact git sha", () => {
  const fixture = buildFixture();
  const report = verifyEvidenceConfig({
    ...fixture.config,
    productFiles: [
      {
        path: "README.md",
        sha256: sha256("wrong"),
        gitSha: fixture.gitSha
      }
    ]
  });

  assert.equal(report.status, "failed");
  assertFinding(report, "product_file_hash_mismatch");
});

test("classifies logical references and product paths that escape configured roots", () => {
  const fixture = buildFixture();
  const report = verifyEvidenceConfig({
    ...fixture.config,
    manifestRefs: [[[..."control://"].join(""), "../outside.json"].join("")],
    productFiles: [
      {
        path: "../outside.txt",
        sha256: sha256("outside")
      }
    ]
  });

  assert.equal(report.status, "failed");
  assertFinding(report, "logical_ref_escapes_root");
  assertFinding(report, "product_file_escapes_root");
});

function buildFixture(): {
  readonly config: EvidenceVerificationConfig;
  readonly gitSha: string;
  readonly readmeHash: string;
} {
  const root = mkdtempSync(join(tmpdir(), "hadaf-evidence-fixture-"));
  const controlRoot = join(root, "control");
  const evidenceRoot = join(root, "evidence");
  const productRoot = join(root, "product");
  mkdirSync(join(controlRoot, "sample"), { recursive: true });
  mkdirSync(join(evidenceRoot, "sample"), { recursive: true });
  mkdirSync(productRoot, { recursive: true });

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

  const readmeText = "fixture product\n";
  const readmeHash = sha256(readmeText);
  writeFileSync(join(productRoot, "README.md"), readmeText);
  git(productRoot, ["init"]);
  git(productRoot, ["config", "user.email", "fixture@example.test"]);
  git(productRoot, ["config", "user.name", "Fixture"]);
  git(productRoot, ["add", "README.md"]);
  git(productRoot, ["commit", "-m", "fixture"]);
  const gitSha = git(productRoot, ["rev-parse", "HEAD"]);

  return {
    gitSha,
    readmeHash,
    config: {
      logicalRoots: {
        control: controlRoot,
        evidence: evidenceRoot,
        product: productRoot
      },
      manifestRefs: ["control://sample/manifest.json"],
      requiredRefs: ["evidence://sample/artifact.json"],
      expectedProductGitSha: gitSha,
      productFiles: [
        {
          path: "README.md",
          sha256: readmeHash,
          gitSha
        }
      ],
      finalPostureRecommendation: "fixture_posture",
      cannotClaim: ["fixture_claim"]
    }
  };
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
  report: ReturnType<typeof verifyEvidenceConfig>,
  kind: string
): void {
  assert.equal(
    report.findings.some((finding) => finding.kind === kind),
    true
  );
}
