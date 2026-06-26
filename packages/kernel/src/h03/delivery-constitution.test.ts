import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  compileH03DeliveryConstitutionConfig,
  hashDeliveryConstitutionCandidate,
  type H03DeliveryConstitutionConfig
} from "./delivery-constitution.js";
import { compileH03DeliveryConstitutionConfig as exportedCompiler } from "../index.js";

type MutableConfig = Record<string, any>;

function loadValidConfig(): H03DeliveryConstitutionConfig {
  return JSON.parse(readFileSync("fixtures/h03-delivery-constitution/valid-config.json", "utf8"));
}

function loadMutableConfig(): MutableConfig {
  return JSON.parse(readFileSync("fixtures/h03-delivery-constitution/valid-config.json", "utf8"));
}

function compileMutableConfig(config: MutableConfig) {
  return compileH03DeliveryConstitutionConfig(config as H03DeliveryConstitutionConfig);
}

test("compiles a Delivery Constitution v1.1 candidate for human review only", () => {
  const config = loadValidConfig();
  const report = compileMutableConfig(config);

  assert.equal(report.status, "passed");
  assert.equal(report.findings.length, 0);
  assert.equal(report.constitution?.approval.status, "for_human_review");
  assert.equal(report.constitution?.approval.approved_by, null);
  assert.equal(report.constitution?.approval.approved_at, null);
  assert.equal(report.constitution?.approval.approval_record_ref, null);
  assert.equal(report.constitution?.approval.approval_record_hash, null);
  assert.equal(report.constitution?.question_register_hash, "539e4f78ef7729ad3cce4992a9f7782e48baa90c2789115e2cf08f48ef96bd62");
  assert.equal(report.constitution_candidate_hash, config.expectedConstitutionCandidateHash);
  assert.equal(report.constitution_candidate_hash, hashDeliveryConstitutionCandidate(report.constitution!));
  assert.equal("execution_authorized" in (report.constitution as unknown as Record<string, unknown>), false);
  assert.equal(report.zero_broad_ambiguity, true);
  assert.equal(report.verified_companions.length, 7);
  assert.equal(report.cannot_claim.includes("execution_authorization_boundary_implemented"), true);
  assert.equal(report.final_posture_recommendation, "H03_F04_DELIVERY_CONSTITUTION_COMPILER_VERIFIED");
});

test("rejects missing companion bindings", () => {
  const config = loadMutableConfig();
  delete config.companionArtifacts.agent_topology;

  const report = compileMutableConfig(config);

  assert.equal(report.status, "failed");
  assert.equal(report.findings.some((finding) => finding.kind === "missing_companion_artifact_binding"), true);
});

test("rejects companion artifact hash drift", () => {
  const config = loadMutableConfig();
  config.companionArtifacts.agent_topology.sha256 = "0".repeat(64);

  const report = compileMutableConfig(config);

  assert.equal(report.status, "failed");
  assert.equal(report.findings.some((finding) => finding.kind === "companion_binding_mismatch"), true);
  assert.equal(report.findings.some((finding) => finding.kind === "ref_hash_mismatch"), true);
});

test("rejects companion schema hash drift", () => {
  const config = loadMutableConfig();
  config.companionArtifacts.agent_topology.schemaSha256 = "0".repeat(64);

  const report = compileMutableConfig(config);

  assert.equal(report.status, "failed");
  assert.equal(report.findings.some((finding) => finding.kind === "companion_binding_mismatch"), true);
  assert.equal(report.findings.some((finding) => finding.kind === "ref_hash_mismatch"), true);
});

test("rejects companion artifacts that fail their schema", () => {
  const config = loadMutableConfig();
  config.structuredContracts.proof_matrix.ref = "fixture://artifacts/invalid-companion.json";
  config.structuredContracts.proof_matrix.sha256 = "1fbee974c92c76cf7ecbd3cd593f4a311aceb0783e9bb0ca73261afe0d8b27cc";
  config.companionArtifacts.proof_matrix.ref = "fixture://artifacts/invalid-companion.json";
  config.companionArtifacts.proof_matrix.sha256 = "1fbee974c92c76cf7ecbd3cd593f4a311aceb0783e9bb0ca73261afe0d8b27cc";

  const report = compileMutableConfig(config);

  assert.equal(report.status, "failed");
  assert.equal(report.findings.some((finding) => finding.kind === "invalid_companion_artifact"), true);
});

test("rejects unresolved broad/systemic questions", () => {
  const config = loadMutableConfig();
  delete config.questionRegister.questionCandidates[0].humanAnswer;
  delete config.questionRegister.questionCandidates[0].authorityRecord;
  delete config.questionRegister.questionCandidates[0].ratifiedAt;
  config.questionRegister.questionCandidates[0].status = "awaiting_human";

  const report = compileMutableConfig(config);

  assert.equal(report.status, "failed");
  assert.equal(report.zero_broad_ambiguity, false);
  assert.equal(report.findings.some((finding) => finding.kind === "question_register_compilation_failed"), true);
});

test("rejects Question Register hash drift", () => {
  const config = loadMutableConfig();
  config.questionRegisterArtifact.sha256 = "0".repeat(64);

  const report = compileMutableConfig(config);

  assert.equal(report.status, "failed");
  assert.equal(report.findings.some((finding) => finding.kind === "question_register_hash_mismatch"), true);
});

test("rejects approval overclaims", () => {
  const config = loadMutableConfig();
  config.constitution.approvalStatus = "approved";

  const report = compileMutableConfig(config);

  assert.equal(report.status, "failed");
  assert.equal(report.findings.some((finding) => finding.kind === "approval_status_overclaim"), true);
});

test("rejects execution authorization inside constitution config", () => {
  const config = loadMutableConfig();
  config.constitution.execution_authorized = false;

  const report = compileMutableConfig(config);

  assert.equal(report.status, "failed");
  assert.equal(report.findings.some((finding) => finding.kind === "execution_authorization_inside_constitution_forbidden"), true);
});

test("rejects Box graph and constitution Box drift", () => {
  const config = loadMutableConfig();
  config.constitution.boxes = ["H03", "H04"];

  const report = compileMutableConfig(config);

  assert.equal(report.status, "failed");
  assert.equal(report.findings.some((finding) => finding.kind === "box_graph_constitution_boxes_mismatch"), true);
});

test("rejects private local paths in constitution output", () => {
  const config = loadMutableConfig();
  config.constitution.target.location = ["", "Users", "example", "private-target"].join("/");

  const report = compileMutableConfig(config);

  assert.equal(report.status, "failed");
  assert.equal(report.findings.some((finding) => finding.kind === "private_path_in_delivery_constitution"), true);
});

test("rejects expected constitution candidate hash drift", () => {
  const config = loadMutableConfig();
  config.expectedConstitutionCandidateHash = "f".repeat(64);

  const report = compileMutableConfig(config);

  assert.equal(report.status, "failed");
  assert.equal(report.findings.some((finding) => finding.kind === "constitution_candidate_hash_mismatch"), true);
});

test("exports H03 Delivery Constitution APIs from the kernel barrel", () => {
  assert.equal(exportedCompiler, compileH03DeliveryConstitutionConfig);
});
