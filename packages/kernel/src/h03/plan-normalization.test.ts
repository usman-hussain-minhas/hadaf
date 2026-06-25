import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  hashNormalizedPlan,
  normalizeH03PlanConfig,
  type H03PlanNormalizationConfig
} from "./plan-normalization.js";

test("normalizes an authority-verified structured plan deterministically", () => {
  const fixture = createFixture();
  const report = normalizeH03PlanConfig(fixture.config);

  assert.equal(report.status, "passed");
  assert.equal(report.findings.length, 0);
  assert.equal(report.normalized_plan?.sections.length, 10);
  assert.equal(report.normalized_plan_hash, hashNormalizedPlan(report.normalized_plan!));
  assert.equal(report.cannot_claim.includes("delivery_constitution_compiler_implemented"), true);
});

test("rejects stale source authority hash", () => {
  const fixture = createFixture();
  const report = normalizeH03PlanConfig({
    ...fixture.config,
    expectedSourceAuthoritySetHash: "b".repeat(64)
  });

  assert.equal(report.status, "failed");
  assertFinding(report, "source_authority_set_hash_mismatch");
});

test("rejects unsupported and duplicate sections", () => {
  const unsupported = createFixture({ body: `${validPlan()}\n## Surprise\n- no\n` });
  assertFinding(normalizeH03PlanConfig(unsupported.config), "unsupported_plan_section");

  const duplicate = createFixture({ body: `${validPlan()}\n## Scope\n- duplicate\n` });
  assertFinding(normalizeH03PlanConfig(duplicate.config), "duplicate_plan_section");
});

test("rejects missing required sections and text outside sections", () => {
  const missing = createFixture({
    body: validPlan().replace("## Human Gates\n- Human exact-hash approval before execution.\n", "")
  });
  assertFinding(normalizeH03PlanConfig(missing.config), "missing_required_plan_section");

  const outside = createFixture({ body: `loose text\n${validPlan()}` });
  assertFinding(normalizeH03PlanConfig(outside.config), "plan_text_outside_section");
});

test("rejects generated or unknown plan sources", () => {
  const fixture = createFixture();
  assertFinding(normalizeH03PlanConfig({
    ...fixture.config,
    planSourceInputIds: ["generated-summary"]
  }), "plan_source_not_authority_verified");

  assertFinding(normalizeH03PlanConfig({
    ...fixture.config,
    planSourceInputIds: ["missing"]
  }), "plan_source_not_authority_verified");
});

test("rejects expected normalized hash drift", () => {
  const fixture = createFixture();
  const report = normalizeH03PlanConfig({
    ...fixture.config,
    expectedNormalizedPlanHash: "c".repeat(64)
  });

  assert.equal(report.status, "failed");
  assertFinding(report, "normalized_plan_hash_mismatch");
});

test("exports H03 plan normalization APIs from the kernel barrel", async () => {
  const kernel = await import("../index.js");

  assert.equal(typeof kernel.normalizeH03PlanConfig, "function");
});

function createFixture(options: { readonly body?: string } = {}): {
  readonly config: H03PlanNormalizationConfig;
} {
  const root = mkdtempSync(join(tmpdir(), "hadaf-h03-plan-normalization-"));
  const plan = options.body ?? validPlan();
  const generatedSummary = "Generated summary. This is a derived view.\n";
  writeFileSync(join(root, "plan.md"), plan);
  writeFileSync(join(root, "generated-summary.md"), generatedSummary);
  const planHash = sha256(plan);
  const generatedHash = sha256(generatedSummary);
  const sourceAuthoritySetHash = hashAuthoritySet(planHash);

  return {
    config: {
      inputAuthority: {
        logicalRoots: { fixture: root },
        sourceMode: "READ_ONLY_DIGEST",
        inputs: [
          {
            inputId: "plan",
            form: "plain_language_plan",
            ref: "fixture://plan.md",
            sha256: planHash,
            documentKind: "human_authorization",
            expectedClassification: "ratified_human_authority"
          },
          {
            inputId: "generated-summary",
            form: "founder_notes",
            ref: "fixture://generated-summary.md",
            sha256: generatedHash,
            documentKind: "generated_view",
            expectedClassification: "generated_view"
          }
        ],
        authorityManifest: [
          { rank: 1, inputId: "plan", authority: "ratified_human_authority" }
        ]
      },
      planSourceInputIds: ["plan"],
      expectedSourceAuthoritySetHash: sourceAuthoritySetHash,
      cannotClaim: [
        "question_register_compiler_implemented",
        "delivery_constitution_compiler_implemented"
      ],
      finalPostureRecommendation: "H03_F02_PLAN_NORMALIZATION_VERIFIED"
    }
  };
}

function validPlan(): string {
  return [
    "## Objective",
    "- Compile ratified HADAF plans without inventing product intent.",
    "## Outcomes",
    "- Human can review normalized planning facts.",
    "## Scope",
    "- Deterministic ingestion.",
    "## Non-Scope",
    "- Human approval.",
    "## Constraints",
    "- Generated views are not authority.",
    "## Public Commitments",
    "- Product repository stays public-safe.",
    "## Internal Invariants",
    "- Control records remain outside Product Git.",
    "## Candidate Boxes",
    "- H03.",
    "## Human Gates",
    "- Human exact-hash approval before execution.",
    "## Cannot Claim",
    "- delivery_constitution_compiler_implemented.",
    ""
  ].join("\n");
}

function hashAuthoritySet(planHash: string): string {
  return sha256(JSON.stringify([
    {
      rank: 1,
      path_or_uri: "fixture://plan.md",
      sha256: planHash,
      authority: "ratified_human_authority",
      classification: "ratified_human_authority"
    }
  ]));
}

function assertFinding(
  report: ReturnType<typeof normalizeH03PlanConfig>,
  kind: string
): void {
  assert.equal(report.findings.some((finding) => finding.kind === kind), true);
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}
