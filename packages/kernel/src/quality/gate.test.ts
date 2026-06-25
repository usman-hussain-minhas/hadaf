import assert from "node:assert/strict";
import test from "node:test";

import { validateQualityGateResultRecord } from "./schemas.js";
import {
  compileQualityGateResult,
  type CompileQualityGateInput
} from "./gate.js";

const PROFILE_HASH = "sha256:3501e4e3a179c37ef572bd1faca51808d1f1863a6b84b49e211bb1801e8d2688";
const CREATED_AT = "2026-06-25T00:00:00Z";
const H00_Q02_REQUIRED_CHECK_IDS = [
  "format",
  "gate_negative_tests",
  "typecheck",
  "unit_tests"
] as const;

test("compiles a passing deterministic FFET quality gate result", () => {
  const first = compileQualityGateResult(validGateInput());
  const second = compileQualityGateResult(validGateInput());

  assert.deepEqual(first, second);
  assert.equal(first.result, "passed");
  assert.equal(first.scope_type, "ffet");
  assert.equal(first.scope_id, "H00-Q02");
  assert.equal(first.quality_profile_hash, PROFILE_HASH);
  assert.equal(first.independent_attestation_ref, "quality-attestation-H00-Q02");
  assert.deepEqual(first.checks.map((check) => check.check_id), [
    "format",
    "gate_negative_tests",
    "typecheck",
    "unit_tests"
  ]);
  assert.deepEqual(validateQualityGateResultRecord(first).issues, []);
});

test("fails when a required check fails", () => {
  const result = compileQualityGateResult(
    validGateInput({
      checks: [
        check("format", "passed"),
        check("gate_negative_tests", "passed"),
        check("typecheck", "failed"),
        check("unit_tests", "passed")
      ]
    })
  );

  assert.equal(result.result, "failed");
});

test("blocks when independent attestation is missing", () => {
  const result = compileQualityGateResult(
    validGateInput({
      independentAttestationRef: null
    })
  );

  assert.equal(result.result, "blocked");
  assert.equal(result.independent_attestation_ref, "missing-independent-attestation");
  assert.equal(
    result.checks.some((item) => item.check_id === "independent_attestation_required"),
    true
  );
  assert.deepEqual(validateQualityGateResultRecord(result).issues, []);
});

test("blocks when a required check is not reported", () => {
  const result = compileQualityGateResult(
    validGateInput({
      requiredCheckIds: ["format", "typecheck", "unit_tests", "gate_negative_tests"],
      checks: [
        check("format", "passed"),
        check("typecheck", "passed"),
        check("unit_tests", "passed")
      ]
    })
  );

  assert.equal(result.result, "blocked");
  assert.equal(
    result.checks.some(
      (item) => item.check_id === "required_check_missing:gate_negative_tests"
    ),
    true
  );
});

test("blocks when approved quality debt is expired", () => {
  const result = compileQualityGateResult(
    validGateInput({
      qualityDebt: [
        {
          ref: "quality-debt-expired",
          status: "approved",
          expiresAt: "2026-06-24T23:59:59Z"
        }
      ]
    })
  );

  assert.equal(result.result, "blocked");
  assert.deepEqual(result.quality_debt_refs, ["quality-debt-expired"]);
  assert.equal(
    result.checks.some(
      (item) => item.check_id === "quality_debt_blocking:quality-debt-expired"
    ),
    true
  );
});

test("passes with approved non-expired quality debt disclosed", () => {
  const result = compileQualityGateResult(
    validGateInput({
      qualityDebt: [
        {
          ref: "quality-debt-approved",
          status: "approved",
          expiresAt: "2026-06-26T00:00:00Z"
        }
      ],
      cannotClaim: ["full_quality_gate_pass"]
    })
  );

  assert.equal(result.result, "passed_with_approved_debt");
  assert.deepEqual(result.quality_debt_refs, ["quality-debt-approved"]);
  assert.deepEqual(result.cannot_claim, ["full_quality_gate_pass"]);
});

test("blocks proposed, rejected, and explicitly expired debt", () => {
  for (const status of ["proposed", "rejected", "expired"] as const) {
    const result = compileQualityGateResult(
      validGateInput({
        qualityDebt: [
          {
            ref: `quality-debt-${status}`,
            status,
            expiresAt: "2026-06-26T00:00:00Z"
          }
        ]
      })
    );

    assert.equal(result.result, "blocked");
  }
});

test("surfaces inconclusive required checks as inconclusive", () => {
  const result = compileQualityGateResult(
    validGateInput({
      checks: [
        check("format", "passed"),
        check("gate_negative_tests", "passed"),
        check("typecheck", "passed"),
        check("unit_tests", "inconclusive")
      ]
    })
  );

  assert.equal(result.result, "inconclusive");
});

test("throws when the compiled gate result violates the canonical schema", () => {
  assert.throws(
    () =>
      compileQualityGateResult(
        validGateInput({
          createdAt: "2026-06-25"
        })
      ),
    /quality_gate_result validation failed/
  );
});

function validGateInput(
  override: Partial<CompileQualityGateInput> = {}
): CompileQualityGateInput {
  return {
    qualityGateResultId: "QGR-H00-Q02-example",
    scopeType: "ffet",
    scopeId: "H00-Q02",
    sourceSha: "source-sha",
    qualityProfileHash: PROFILE_HASH,
    toolVersions: {
      typescript: "6.0.3",
      node: "local"
    },
    checks: [
      check("format", "passed"),
      check("gate_negative_tests", "passed"),
      check("typecheck", "passed"),
      check("unit_tests", "passed")
    ],
    requiredCheckIds: H00_Q02_REQUIRED_CHECK_IDS,
    independentAttestationRef: "quality-attestation-H00-Q02",
    evidenceHashes: ["sha256:replace"],
    qualityDebt: [],
    createdAt: CREATED_AT,
    cannotClaim: [],
    ...override
  };
}

function check(
  checkId: string,
  result: "passed" | "failed" | "blocked" | "inconclusive" | "waived"
) {
  return {
    checkId,
    result,
    command: `run ${checkId}`,
    evidenceRefs: [`quality-${checkId}`],
    detail: `${checkId} ${result}`
  };
}
