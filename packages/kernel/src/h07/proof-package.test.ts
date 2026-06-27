import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { verifyH07ProofPackageConfig, type H07ProofPackageConfig } from "./proof-package.js";

const configPath = "fixtures/h07-proof-package/valid-config.json";

function loadConfig(): H07ProofPackageConfig {
  return JSON.parse(readFileSync(configPath, "utf8")) as H07ProofPackageConfig;
}

test("verifies H07 proof package and calibration fixtures", () => {
  const report = verifyH07ProofPackageConfig(loadConfig());

  assert.equal(report.status, "passed");
  assert.equal(report.package_results.length, 9);
  assert(report.verified_refs.some((ref) => ref.ref === "fixture://packages/valid-proof-package.json"));
  assert(report.verified_refs.some((ref) => ref.ref === "fixture://proof-artifacts/authority.json"));
  assert(report.cannot_claim.includes("release_candidate"));
});

test("calibrates proof package negative fixtures", () => {
  const report = verifyH07ProofPackageConfig(loadConfig());
  const results = new Map(report.package_results.map((result) => [result.packageId, result]));

  assert.equal(results.get("valid-proof-package")?.status, "passed");
  assert.equal(results.get("stale-product-sha")?.status, "failed");
  assert.equal(results.get("tree-hash-mismatch")?.status, "failed");
  assert.equal(results.get("missing-evidence-ref")?.status, "failed");
  assert.equal(results.get("hash-mismatch")?.status, "failed");
  assert.equal(results.get("placeholder-hash")?.status, "failed");
  assert.equal(results.get("unsupported-claim-supported")?.status, "failed");
  assert.equal(results.get("private-path-evidence")?.status, "failed");
  assert.equal(results.get("redaction-failure")?.status, "failed");

  assert(report.findings.some((finding) => finding.kind === "stale_product_sha"));
  assert(report.findings.some((finding) => finding.kind === "tree_hash_mismatch"));
  assert(report.findings.some((finding) => finding.kind === "claim_evidence_ref_missing"));
  assert(report.findings.some((finding) => finding.kind === "evidence_hash_mismatch"));
  assert(report.findings.some((finding) => finding.kind === "evidence_hash_invalid"));
  assert(report.findings.some((finding) => finding.kind === "unsupported_claim_supported"));
  assert(report.findings.some((finding) => finding.kind === "private_path_in_evidence"));
  assert(report.findings.some((finding) => finding.kind === "redaction_not_public_safe"));
});

test("fails when a proof package hash is a placeholder", () => {
  const config = loadConfig();
  const firstPackage = config.packages[0];
  assert(firstPackage);
  const report = verifyH07ProofPackageConfig({
    ...config,
    packages: [
      {
        ...firstPackage,
        sha256: "pending-h07-proof-package-hash"
      }
    ]
  });

  assert.equal(report.status, "failed");
  assert(report.findings.some((finding) => finding.kind === "package_hash_invalid"));
});

test("fails when expected negative proof finding is absent", () => {
  const config = loadConfig();
  const firstPackage = config.packages[0];
  assert(firstPackage);
  const report = verifyH07ProofPackageConfig({
    ...config,
    packages: [
      {
        ...firstPackage,
        expectedFindingKinds: ["unsupported_claim_supported"]
      }
    ]
  });

  assert.equal(report.status, "failed");
  assert(report.findings.some((finding) => finding.kind === "expected_package_finding_missing"));
});
