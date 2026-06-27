import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { verifyH07ProofVerifierConfig, type H07ProofVerifierSuiteConfig } from "./proof-verifier.js";

const configPath = "fixtures/h07-proof-verifier/valid-config.json";

function loadConfig(): H07ProofVerifierSuiteConfig {
  return JSON.parse(readFileSync(configPath, "utf8")) as H07ProofVerifierSuiteConfig;
}

test("aggregates H07 eligibility and proof package verification", () => {
  const report = verifyH07ProofVerifierConfig(loadConfig());

  assert.equal(report.status, "passed");
  assert.equal(report.scenario_results.length, 5);
  assert(report.verified_refs.some((ref) => ref.source === "eligibility_config"));
  assert(report.verified_refs.some((ref) => ref.source === "proof_package_config"));
  assert(report.cannot_claim.includes("H12_box_assurance_engine_implemented"));
});

test("calibrates proof verifier negative scenarios", () => {
  const report = verifyH07ProofVerifierConfig(loadConfig());
  const results = new Map(report.scenario_results.map((result) => [result.scenarioId, result]));

  assert.equal(results.get("valid-proof-verifier")?.status, "passed");
  assert.equal(results.get("eligibility-pass-proof-fail")?.status, "failed");
  assert.equal(results.get("proof-pass-eligibility-fail")?.status, "failed");
  assert.equal(results.get("missing-required-proof-level")?.status, "failed");
  assert.equal(results.get("operational-claim-requested")?.status, "failed");

  assert(report.findings.some((finding) => finding.kind === "proof_package_verifier_failed"));
  assert(report.findings.some((finding) => finding.kind === "eligibility_verifier_failed"));
  assert(report.findings.some((finding) => finding.kind === "required_proof_level_missing"));
  assert(report.findings.some((finding) => finding.kind === "negative_proof_absent"));
  assert(report.findings.some((finding) => finding.kind === "operational_claim_requested"));
});

test("fails when an aggregate config hash is a placeholder", () => {
  const config = loadConfig();
  const firstScenario = config.scenarios[0];
  assert(firstScenario);
  const report = verifyH07ProofVerifierConfig({
    ...config,
    scenarios: [
      {
        ...firstScenario,
        sha256: "pending-h07-proof-verifier-hash"
      }
    ]
  });

  assert.equal(report.status, "failed");
  assert(report.findings.some((finding) => finding.kind === "aggregate_config_hash_invalid"));
});

test("fails when expected aggregate finding is absent", () => {
  const config = loadConfig();
  const firstScenario = config.scenarios[0];
  assert(firstScenario);
  const report = verifyH07ProofVerifierConfig({
    ...config,
    scenarios: [
      {
        ...firstScenario,
        expectedFindingKinds: ["operational_claim_requested"]
      }
    ]
  });

  assert.equal(report.status, "failed");
  assert(report.findings.some((finding) => finding.kind === "expected_scenario_finding_missing"));
});
