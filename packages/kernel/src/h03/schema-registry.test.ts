import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  verifyH03SchemaRegistryConfig,
  type H03SchemaRegistryConfig
} from "./schema-registry.js";

interface TestAuthorityRef {
  readonly artifact_id: string;
  readonly artifact_version: string;
  readonly ref: string;
  readonly sha256: string;
  readonly schema_ref: string;
  readonly schema_sha256: string;
}

test("loads explicit historical and active schemas and validates configured instances", () => {
  const fixture = createFixture();
  const report = verifyH03SchemaRegistryConfig(fixture.config);

  assert.equal(report.status, "passed");
  assert.equal(report.findings.length, 0);
  assert.equal(report.verifiedSchemas.length, 3);
  assert.equal(report.instanceResults.length, 4);
  assert.equal(report.semanticResults.length, 5);
  assert.equal(report.cannot_claim.includes("h03_implemented"), true);
});

test("rejects a schema hash mismatch", () => {
  const fixture = createFixture();
  const report = verifyH03SchemaRegistryConfig({
    ...fixture.config,
    schemas: fixture.config.schemas.map((schema) =>
      schema.schemaId === "delivery_constitution" && schema.schemaVersion === "1.1.0"
        ? { ...schema, sha256: "b".repeat(64) }
        : schema
    )
  });

  assert.equal(report.status, "failed");
  assertFinding(report, "schema_hash_mismatch");
});

test("rejects unsupported required schema versions", () => {
  const fixture = createFixture();
  const report = verifyH03SchemaRegistryConfig({
    ...fixture.config,
    requiredSchemas: [
      ...(fixture.config.requiredSchemas ?? []),
      { schemaId: "delivery_constitution", schemaVersion: "9.9.9" }
    ]
  });

  assert.equal(report.status, "failed");
  assertFinding(report, "required_schema_version_missing");
});

test("rejects placeholder schema hashes", () => {
  const fixture = createFixture();
  const report = verifyH03SchemaRegistryConfig({
    ...fixture.config,
    schemas: fixture.config.schemas.map((schema) =>
      schema.schemaId === "authority_artifact_ref"
        ? { ...schema, sha256: "pending" }
        : schema
    )
  });

  assert.equal(report.status, "failed");
  assertFinding(report, "placeholder_hash");
});

test("fails when a semantic check unexpectedly passes or fails", () => {
  const fixture = createFixture();
  const report = verifyH03SchemaRegistryConfig({
    ...fixture.config,
    semanticValidations: [
      {
        validationId: "expect-bad-question-hash-to-pass",
        kind: "question_register_hash_matches_structured_ref",
        instanceRef: "fixture://instances/constitution-question-hash-mismatch.json",
        expectedStatus: "passed"
      }
    ]
  });

  assert.equal(report.status, "failed");
  assertFinding(report, "semantic_validation_unexpected_status");
});

test("exports H03 schema registry APIs from the kernel barrel", async () => {
  const kernel = await import("../index.js");

  assert.equal(typeof kernel.verifyH03SchemaRegistryConfig, "function");
});

function createFixture(): { readonly config: H03SchemaRegistryConfig } {
  const root = mkdtempSync(join(tmpdir(), "hadaf-h03-schema-registry-"));
  const schemaRoot = join(root, "schemas");
  const instanceRoot = join(root, "instances");
  mkdirSync(schemaRoot, { recursive: true });
  mkdirSync(instanceRoot, { recursive: true });

  writeJson(join(schemaRoot, "authority-ref.json"), authorityRefSchema());
  writeJson(join(schemaRoot, "constitution-v1.json"), historicalConstitutionSchema());
  writeJson(join(schemaRoot, "constitution-v1-1.json"), activeConstitutionSchema());

  writeJson(join(instanceRoot, "constitution-v1-valid.json"), historicalConstitution());
  writeJson(join(instanceRoot, "constitution-v1-1-valid.json"), activeConstitution());
  writeJson(join(instanceRoot, "constitution-v1-1-missing-contracts.json"), {
    ...activeConstitution(),
    structured_contracts: undefined
  });
  writeJson(join(instanceRoot, "constitution-v1-1-approval-overclaim.json"), {
    ...activeConstitution(),
    approval: {
      ...activeConstitution().approval,
      approved_by: "Codex"
    }
  });
  writeJson(join(instanceRoot, "constitution-v1-1-status-approved.json"), {
    ...activeConstitution(),
    approval: {
      ...activeConstitution().approval,
      status: "approved"
    }
  });
  writeJson(join(instanceRoot, "constitution-question-hash-mismatch.json"), {
    ...activeConstitution(),
    question_register_hash: "b".repeat(64)
  });

  const schemas = [
    {
      schemaId: "authority_artifact_ref",
      schemaVersion: "1.0.0",
      ref: "fixture://schemas/authority-ref.json",
      sha256: sha256Json(authorityRefSchema()),
      role: "companion" as const
    },
    {
      schemaId: "delivery_constitution",
      schemaVersion: "1.0",
      ref: "fixture://schemas/constitution-v1.json",
      sha256: sha256Json(historicalConstitutionSchema()),
      role: "historical" as const
    },
    {
      schemaId: "delivery_constitution",
      schemaVersion: "1.1.0",
      ref: "fixture://schemas/constitution-v1-1.json",
      sha256: sha256Json(activeConstitutionSchema()),
      role: "active" as const
    }
  ];

  return {
    config: {
      logicalRoots: { fixture: root },
      schemas,
      requiredSchemas: [
        { schemaId: "delivery_constitution", schemaVersion: "1.0" },
        { schemaId: "delivery_constitution", schemaVersion: "1.1.0" },
        { schemaId: "authority_artifact_ref", schemaVersion: "1.0.0" }
      ],
      instanceValidations: [
        {
          validationId: "historical-v1-valid",
          schemaId: "delivery_constitution",
          schemaVersion: "1.0",
          instanceRef: "fixture://instances/constitution-v1-valid.json",
          expectedStatus: "passed"
        },
        {
          validationId: "active-v1-1-valid",
          schemaId: "delivery_constitution",
          schemaVersion: "1.1.0",
          instanceRef: "fixture://instances/constitution-v1-1-valid.json",
          expectedStatus: "passed"
        },
        {
          validationId: "active-v1-1-missing-contracts",
          schemaId: "delivery_constitution",
          schemaVersion: "1.1.0",
          instanceRef: "fixture://instances/constitution-v1-1-missing-contracts.json",
          expectedStatus: "failed"
        },
        {
          validationId: "active-v1-1-approval-overclaim",
          schemaId: "delivery_constitution",
          schemaVersion: "1.1.0",
          instanceRef: "fixture://instances/constitution-v1-1-approval-overclaim.json",
          expectedStatus: "failed"
        }
      ],
      semanticValidations: [
        {
          validationId: "question-hash-valid",
          kind: "question_register_hash_matches_structured_ref",
          instanceRef: "fixture://instances/constitution-v1-1-valid.json",
          expectedStatus: "passed"
        },
        {
          validationId: "question-hash-mismatch",
          kind: "question_register_hash_matches_structured_ref",
          instanceRef: "fixture://instances/constitution-question-hash-mismatch.json",
          expectedStatus: "failed"
        },
        {
          validationId: "for-review-unapproved",
          kind: "approval_for_review_is_unapproved",
          instanceRef: "fixture://instances/constitution-v1-1-valid.json",
          expectedStatus: "passed"
        },
        {
          validationId: "approval-status-overclaim",
          kind: "approval_for_review_is_unapproved",
          instanceRef: "fixture://instances/constitution-v1-1-status-approved.json",
          expectedStatus: "failed"
        },
        {
          validationId: "execution-authorization-absent",
          kind: "execution_authorization_absent",
          instanceRef: "fixture://instances/constitution-v1-1-valid.json",
          expectedStatus: "passed"
        }
      ],
      cannotClaim: ["h03_implemented"],
      finalPostureRecommendation: "H03_F00_SCHEMA_REGISTRY_BOUNDARY_VERIFIED"
    }
  };
}

function assertFinding(
  report: ReturnType<typeof verifyH03SchemaRegistryConfig>,
  kind: string
): void {
  assert.equal(report.findings.some((finding) => finding.kind === kind), true);
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function sha256Json(value: unknown): string {
  return createHash("sha256").update(`${JSON.stringify(value, null, 2)}\n`).digest("hex");
}

function authorityRefSchema(): unknown {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "fixture://schemas/authority-ref.json",
    type: "object",
    additionalProperties: false,
    required: ["artifact_id", "artifact_version", "ref", "sha256", "schema_ref", "schema_sha256"],
    properties: {
      artifact_id: { type: "string" },
      artifact_version: { type: "string" },
      ref: { type: "string" },
      sha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
      schema_ref: { type: "string" },
      schema_sha256: { type: "string", pattern: "^[a-f0-9]{64}$" }
    }
  };
}

function historicalConstitutionSchema(): unknown {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "fixture://schemas/constitution-v1.json",
    type: "object",
    additionalProperties: false,
    required: ["constitution_id", "version", "approval", "question_register_hash"],
    properties: {
      constitution_id: { type: "string" },
      version: { type: "string" },
      approval: {
        type: "object",
        additionalProperties: false,
        required: ["status", "constitution_hash"],
        properties: {
          status: { enum: ["draft", "for_human_review", "approved", "rejected", "superseded"] },
          constitution_hash: { type: "string" }
        }
      },
      question_register_hash: { type: "string" }
    }
  };
}

function activeConstitutionSchema(): unknown {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "fixture://schemas/constitution-v1-1.json",
    type: "object",
    additionalProperties: false,
    required: [
      "schema_version",
      "constitution_id",
      "version",
      "structured_contracts",
      "question_resolution",
      "question_register_hash",
      "approval"
    ],
    properties: {
      schema_version: { const: "1.1.0" },
      constitution_id: { type: "string" },
      version: { type: "string" },
      structured_contracts: {
        type: "object",
        additionalProperties: false,
        required: ["box_dependency_graph"],
        properties: {
          box_dependency_graph: { $ref: "fixture://schemas/authority-ref.json" }
        }
      },
      question_resolution: {
        type: "object",
        additionalProperties: false,
        required: ["question_register", "zero_broad_ambiguity", "unresolved_broad_question_ids"],
        properties: {
          question_register: { $ref: "fixture://schemas/authority-ref.json" },
          zero_broad_ambiguity: { const: true },
          unresolved_broad_question_ids: { type: "array", maxItems: 0 }
        }
      },
      question_register_hash: { type: "string", pattern: "^[a-f0-9]{64}$" },
      approval: {
        type: "object",
        additionalProperties: false,
        required: ["status", "constitution_hash", "approved_by", "approved_at", "approval_record_ref", "approval_record_hash"],
        properties: {
          status: { const: "for_human_review" },
          constitution_hash: { type: "string", pattern: "^[a-f0-9]{64}$" },
          approved_by: { type: "null" },
          approved_at: { type: "null" },
          approval_record_ref: { type: "null" },
          approval_record_hash: { type: "null" }
        }
      }
    }
  };
}

function historicalConstitution(): unknown {
  return {
    constitution_id: "C-v1",
    version: "1.0",
    approval: {
      status: "for_human_review",
      constitution_hash: "not-sha-constrained-in-fixture-v1"
    },
    question_register_hash: "legacy-hash"
  };
}

function activeConstitution(): {
  readonly schema_version: "1.1.0";
  readonly constitution_id: string;
  readonly version: string;
  readonly structured_contracts: { readonly box_dependency_graph: TestAuthorityRef };
  readonly question_resolution: { readonly question_register: TestAuthorityRef; readonly zero_broad_ambiguity: true; readonly unresolved_broad_question_ids: readonly [] };
  readonly question_register_hash: string;
  readonly approval: Record<string, unknown>;
} {
  const questionRegisterRef = authorityRef("question-register", "a".repeat(64));
  return {
    schema_version: "1.1.0",
    constitution_id: "C-v1-1",
    version: "1.1.0",
    structured_contracts: {
      box_dependency_graph: authorityRef("graph", "b".repeat(64))
    },
    question_resolution: {
      question_register: questionRegisterRef,
      zero_broad_ambiguity: true,
      unresolved_broad_question_ids: []
    },
    question_register_hash: questionRegisterRef.sha256,
    approval: {
      status: "for_human_review",
      constitution_hash: "c".repeat(64),
      approved_by: null,
      approved_at: null,
      approval_record_ref: null,
      approval_record_hash: null
    }
  };
}

function authorityRef(id: string, hash: string): TestAuthorityRef {
  return {
    artifact_id: id,
    artifact_version: "1.0.0",
    ref: `fixture://${id}.json`,
    sha256: hash,
    schema_ref: "fixture://schemas/authority-ref.json",
    schema_sha256: "d".repeat(64)
  };
}
