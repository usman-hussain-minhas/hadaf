import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  compileH03QuestionRegisterConfig,
  hashQuestionRegister,
  type H03QuestionCandidate,
  type H03QuestionRegisterConfig
} from "./question-register.js";
import { compileH03QuestionRegisterConfig as exportedCompiler } from "../index.js";

function loadValidConfig(): H03QuestionRegisterConfig {
  return JSON.parse(readFileSync("fixtures/h03-question-register/valid-config.json", "utf8"));
}

test("compiles a deterministic Question Register v1.1 with zero broad ambiguity", () => {
  const report = compileH03QuestionRegisterConfig(loadValidConfig());

  assert.equal(report.status, "passed");
  assert.equal(report.question_register.length, 2);
  assert.equal(report.zero_broad_ambiguity, true);
  assert.deepEqual(report.unresolved_broad_questions, []);
  assert.equal(report.question_register_hash, hashQuestionRegister(report.question_register));
  assert.equal(report.cannot_claim.includes("delivery_constitution_compiler_implemented"), true);
  assert.equal(report.final_posture_recommendation, "H03_F03_QUESTION_REGISTER_BOUNDARY_VERIFIED");

  const broad = report.question_register.find((record) => record.scope_class === "broad_systemic");
  assert.equal(broad?.status, "ratified");
  assert.equal(broad?.decision_deadline.kind, "before_affected_execution");
  assert.equal(broad?.decision_deadline.at, null);

  const local = report.question_register.find((record) => record.scope_class === "narrow_local");
  assert.equal(local?.status, "default_authorized");
  assert.equal(local?.safe_default_authority, "fixture://authority/h03-local-copy");
});

test("rejects stale normalized plan hash", () => {
  const config = loadValidConfig();
  const report = compileH03QuestionRegisterConfig({
    ...config,
    expectedNormalizedPlanHash: "0".repeat(64)
  });

  assert.equal(report.status, "failed");
  assert.equal(report.findings.some((finding) => finding.kind === "normalized_plan_hash_mismatch"), true);
});

test("rejects unknown question source sections", () => {
  const config = loadValidConfig();
  const report = compileH03QuestionRegisterConfig({
    ...config,
    questionCandidates: [
      {
        ...candidateAt(config, 0),
        sourceSectionId: "missing_section" as never
      }
    ]
  });

  assert.equal(report.status, "failed");
  assert.equal(report.findings.some((finding) => finding.kind === "unknown_question_source_section"), true);
});

test("rejects unresolved broad/systemic questions", () => {
  const config = loadValidConfig();
  const { humanAnswer: _humanAnswer, authorityRecord: _authorityRecord, ratifiedAt: _ratifiedAt, ...candidate } =
    candidateAt(config, 0);
  const report = compileH03QuestionRegisterConfig({
    ...config,
    questionCandidates: [
      {
        ...candidate,
        status: "awaiting_human"
      }
    ]
  });

  assert.equal(report.status, "failed");
  assert.equal(report.zero_broad_ambiguity, false);
  assert.equal(report.findings.some((finding) => finding.kind === "unresolved_broad_systemic_question"), true);
});

test("rejects broad/systemic safe defaults", () => {
  const config = loadValidConfig();
  const report = compileH03QuestionRegisterConfig({
    ...config,
    questionCandidates: [
      {
        ...candidateAt(config, 0),
        status: "default_authorized",
        recommendedDefault: "Use a default.",
        safeDefaultAuthority: "fixture://authority/not-allowed"
      }
    ]
  });

  assert.equal(report.status, "failed");
  assert.equal(report.findings.some((finding) => finding.kind === "broad_systemic_default_forbidden"), true);
});

test("rejects narrow/local defaults without safe default authority", () => {
  const config = loadValidConfig();
  const report = compileH03QuestionRegisterConfig({
    ...config,
    questionCandidates: [
      {
        ...candidateAt(config, 1),
        safeDefaultAuthority: null
      }
    ]
  });

  assert.equal(report.status, "failed");
  assert.equal(report.findings.some((finding) => finding.kind === "default_authority_missing"), true);
});

test("rejects unresolved authority conflicts", () => {
  const config = loadValidConfig();
  const report = compileH03QuestionRegisterConfig({
    ...config,
    authorityConflicts: [
      {
        conflictId: "target-mode-conflict",
        category: "source/target mode",
        question: "Which target mode governs this run?",
        claims: [
          {
            sourceReference: "fixture://inputs/plan.md#scope",
            summary: "Scope implies deterministic ingestion only."
          },
          {
            sourceReference: "fixture://inputs/plan.md#constraints",
            summary: "Constraints imply generated views cannot become authority."
          }
        ],
        sourceSectionIds: ["scope", "constraints"],
        affectedBoxes: ["H03"],
        cannotClaim: ["target_mode_conflict_resolved"]
      }
    ]
  });

  assert.equal(report.status, "failed");
  assert.equal(report.findings.some((finding) => finding.kind === "authority_conflict_unresolved"), true);
  assert.equal(report.zero_broad_ambiguity, false);
});

test("rejects invalid decision deadline schema", () => {
  const config = loadValidConfig();
  const report = compileH03QuestionRegisterConfig({
    ...config,
    questionCandidates: [
      {
        ...candidateAt(config, 0),
        decisionDeadline: {
          kind: "absolute_time",
          at: null,
          basis: "Absolute deadlines require an exact date-time."
        }
      }
    ]
  });

  assert.equal(report.status, "failed");
  assert.equal(report.findings.some((finding) => finding.kind === "question_schema_type"), true);
});

test("rejects expected question register hash drift", () => {
  const config = loadValidConfig();
  const report = compileH03QuestionRegisterConfig({
    ...config,
    expectedQuestionRegisterHash: "f".repeat(64)
  });

  assert.equal(report.status, "failed");
  assert.equal(report.findings.some((finding) => finding.kind === "question_register_hash_mismatch"), true);
});

test("rejects question register schema hash drift", () => {
  const config = loadValidConfig();
  const report = compileH03QuestionRegisterConfig({
    ...config,
    questionRegisterSchema: {
      ...config.questionRegisterSchema,
      sha256: "1".repeat(64)
    }
  });

  assert.equal(report.status, "failed");
  assert.equal(report.findings.some((finding) => finding.kind === "question_register_schema_hash_mismatch"), true);
});

test("exports H03 Question Register APIs from the kernel barrel", () => {
  assert.equal(exportedCompiler, compileH03QuestionRegisterConfig);
});

function candidateAt(config: H03QuestionRegisterConfig, index: number): H03QuestionCandidate {
  const candidate = config.questionCandidates[index];
  assert.ok(candidate);
  return candidate;
}
