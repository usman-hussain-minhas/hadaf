import assert from "node:assert/strict";
import test from "node:test";

import { deriveHmcStateConfig, type HmcStateConfig } from "./state.js";

test("derives a valid HMC fixture state with classified stale generated state", () => {
  const report = deriveHmcStateConfig(validConfig());

  assert.equal(report.status, "passed");
  assert.equal(report.findings.length, 0);
  assert.equal(report.classified_mismatches.length, 1);
  assert.equal(report.view.project.name, "HADAF v1");
  assert.equal(report.view.maturitySummary.fixture_backed > 0, true);
  assert.equal(report.final_posture_recommendation, "H05_AGENT_FOUNDATION_ACTIVE_FIXTURE_BACKED");
  assert.equal(report.view.h03Projection?.authority, "derived_view_only");
  assert.equal(report.view.h03Projection?.deliveryConstitution.approvalStatus, "for_human_review");
  assert.equal(report.view.h03Projection?.deliveryConstitution.executionAuthorized, false);
  assert.equal(report.view.h04Projection?.authority, "derived_view_only");
  assert.equal(report.view.h04Projection?.finalizer.successorGate, "conditional_go");
  assert.equal(report.view.h05Projection?.authority, "derived_view_only");
  assert.equal(report.view.h05Projection?.box.assuranceStatus, "pending");
  assert.equal(report.verified_refs.some((ref) => ref.ref === "h03_stage:H03-F05" && ref.status === "closeout_complete"), true);
  assert.equal(report.verified_refs.some((ref) => ref.ref === "h03_stage:H03-F06" && ref.status === "closeout_complete"), true);
  assert.equal(report.verified_refs.some((ref) => ref.ref === "h04_ffet:H04-F05" && ref.status === "closeout_complete"), true);
  assert.equal(report.verified_refs.some((ref) => ref.ref === "h04_ffet:H04-F06" && ref.status === "closeout_complete"), true);
  assert.equal(report.verified_refs.some((ref) => ref.ref === "h05_agent:codex.bootstrap" && ref.status === "fixture_projected"), true);
  assert.equal(report.view.ffets.some((ffet) => ffet.id === "H02-F04" && ffet.status === "active"), false);
  assert.equal(report.view.ffets.some((ffet) => ffet.id === "H02-F04-R1" && ffet.status === "verified"), true);
});

test("fails unclassified Git and GitHub truth mismatches", () => {
  const report = deriveHmcStateConfig({
    ...validConfig(),
    git: {
      expectedMainSha: sha(),
      actualMainSha: sha("a"),
      originMainSha: sha("b")
    },
    github: {
      expectedHeadSha: sha(),
      currentHeadSha: sha("c")
    },
    classifiedMismatches: []
  });

  assert.equal(report.status, "failed");
  assert.equal(findings(report, "unclassified_state_mismatch"), 4);
});

test("fails generated state authority overclaims", () => {
  const report = deriveHmcStateConfig({
    ...validConfig(),
    generatedState: [
      {
        id: "bad-summary",
        freshness: "fresh",
        claimsAuthority: true,
        maturity: "mocked"
      }
    ],
    classifiedMismatches: []
  });

  assert.equal(report.status, "failed");
  assertFinding(report, "generated_state_claims_authority");
});

test("fails missing required evidence unless classified", () => {
  const report = deriveHmcStateConfig({
    ...validConfig(),
    evidence: [
      {
        id: "required-missing",
        status: "missing",
        maturity: "fixture_backed",
        required: true
      }
    ],
    classifiedMismatches: []
  });

  assert.equal(report.status, "failed");
  assertFinding(report, "unclassified_state_mismatch");
});

test("fails production connected maturity without proof", () => {
  const report = deriveHmcStateConfig({
    ...validConfig(),
    project: {
      id: "hadaf",
      name: "HADAF v1",
      posture: "fixture",
      maturity: "production_connected"
    }
  });

  assert.equal(report.status, "failed");
  assertFinding(report, "production_connected_without_proof");
});

test("fails H03 projection authority creation", () => {
  const report = deriveHmcStateConfig({
    ...validConfig(),
    h03Projection: {
      ...validConfig().h03Projection!,
      claimsAuthority: true
    }
  });

  assert.equal(report.status, "failed");
  assertFinding(report, "h03_projection_claims_authority");
});

test("fails H03 constitution approval and execution overclaims", () => {
  const report = deriveHmcStateConfig({
    ...validConfig(),
    h03Projection: {
      ...validConfig().h03Projection!,
      deliveryConstitution: {
        ...validConfig().h03Projection!.deliveryConstitution,
        approvalStatus: "approved",
        executionAuthorized: true
      },
      continuation: {
        ...validConfig().h03Projection!.continuation,
        h04H05H06ExecutionAuthorized: true
      }
    }
  });

  assert.equal(report.status, "failed");
  assertFinding(report, "h03_constitution_approval_overclaim");
  assertFinding(report, "h03_execution_authorization_overclaim");
  assertFinding(report, "h04_h06_execution_authorization_overclaim");
});

test("fails stale H03 projection without classification", () => {
  const report = deriveHmcStateConfig({
    ...validConfig(),
    h03Projection: {
      ...validConfig().h03Projection!,
      freshness: "stale"
    },
    classifiedMismatches: []
  });

  assert.equal(report.status, "failed");
  assertFinding(report, "unclassified_state_mismatch");
});

test("fails H03 ready-for-ratification claim without evidence", () => {
  const report = deriveHmcStateConfig({
    ...validConfig(),
    h03Projection: {
      ...validConfig().h03Projection!,
      deliveryConstitution: {
        ...validConfig().h03Projection!.deliveryConstitution,
        readinessStatus: "ready_for_human_ratification",
        readinessEvidenceVerified: false
      }
    }
  });

  assert.equal(report.status, "failed");
  assertFinding(report, "h03_readiness_claim_without_evidence");
});

test("fails H03 projection when precise cannot_claim entries are missing", () => {
  const report = deriveHmcStateConfig({
    ...validConfig(),
    cannotClaim: ["live_github_adapter_implemented"]
  });

  assert.equal(report.status, "failed");
  assertFinding(report, "missing_h03_projection_cannot_claim");
});

test("fails H04 projection authority and maturity overclaims", () => {
  const report = deriveHmcStateConfig({
    ...validConfig(),
    h04Projection: {
      ...validConfig().h04Projection!,
      claimsAuthority: true,
      maturity: "persistent"
    }
  });

  assert.equal(report.status, "failed");
  assertFinding(report, "h04_projection_claims_authority");
  assertFinding(report, "h04_projection_maturity_overclaim");
});

test("fails stale H04 projection and stale FFET entries without classification", () => {
  const report = deriveHmcStateConfig({
    ...validConfig(),
    h04Projection: {
      ...validConfig().h04Projection!,
      freshness: "stale",
      ffets: [
        {
          id: "H04-F06",
          title: "HMC lifecycle projection",
          status: "active",
          maturity: "fixture_backed",
          truthSource: "fixture",
          freshness: "conflict"
        }
      ]
    },
    classifiedMismatches: []
  });

  assert.equal(report.status, "failed");
  assert.equal(findings(report, "unclassified_state_mismatch"), 3);
});

test("fails H04 projection when precise cannot_claim entries are missing", () => {
  const report = deriveHmcStateConfig({
    ...validConfig(),
    cannotClaim: ["live_github_adapter_implemented", "HMC_authoritative_state"]
  });

  assert.equal(report.status, "failed");
  assertFinding(report, "missing_h04_projection_cannot_claim");
});

test("fails H05 projection authority, maturity, and live/persistent overclaims", () => {
  const report = deriveHmcStateConfig({
    ...validConfig(),
    h05Projection: {
      ...validConfig().h05Projection!,
      claimsAuthority: true,
      claimLiveAdapter: true,
      claimPersistence: true,
      maturity: "persistent"
    }
  });

  assert.equal(report.status, "failed");
  assertFinding(report, "h05_projection_claims_authority");
  assertFinding(report, "h05_projection_maturity_overclaim");
  assertFinding(report, "h05_live_adapter_overclaim");
  assertFinding(report, "h05_persistence_overclaim");
});

test("fails H05 stable, mechanical-independence, and runtime-enforcement overclaims", () => {
  const report = deriveHmcStateConfig({
    ...validConfig(),
    h05Projection: {
      ...validConfig().h05Projection!,
      claimStableAgents: true,
      claimMechanicalIndependence: true,
      claimRuntimeEnforcement: true,
      agents: [
        {
          ...validConfig().h05Projection!.agents[0]!,
          status: "stable_agent",
          qualificationStatus: "mechanically_independent",
          circuitBreakerStatus: "runtime_enforced",
          upskillStatus: "runtime_enforced"
        }
      ]
    }
  });

  assert.equal(report.status, "failed");
  assertFinding(report, "h05_stable_agent_projection_overclaim");
  assertFinding(report, "h05_mechanical_independence_projection_overclaim");
  assertFinding(report, "h05_runtime_enforcement_projection_overclaim");
  assertFinding(report, "h05_runtime_circuit_breaker_enforcement_overclaim");
  assertFinding(report, "h05_runtime_upskill_enforcement_overclaim");
});

test("fails H05 stale agent projection and missing prerequisite closeout", () => {
  const report = deriveHmcStateConfig({
    ...validConfig(),
    h05Projection: {
      ...validConfig().h05Projection!,
      prerequisiteCloseouts: [
        {
          id: "H05-F03",
          status: "closeout_complete",
          closeoutStatus: "closeout_complete",
          evidenceStatus: "missing",
          terminalLearningStatus: "missing"
        }
      ],
      agents: [
        {
          ...validConfig().h05Projection!.agents[0]!,
          freshness: "stale"
        }
      ]
    },
    classifiedMismatches: []
  });

  assert.equal(report.status, "failed");
  assertFinding(report, "h05_prerequisite_not_closeout_complete");
  assertFinding(report, "unclassified_state_mismatch");
});

test("fails H05 projection when precise cannot_claim entries are missing", () => {
  const report = deriveHmcStateConfig({
    ...validConfig(),
    cannotClaim: ["live_github_adapter_implemented", "HMC_authoritative_state"]
  });

  assert.equal(report.status, "failed");
  assertFinding(report, "missing_h05_projection_cannot_claim");
});

test("fails private paths in state config", () => {
  const report = deriveHmcStateConfig({
    ...validConfig(),
    project: {
      id: "hadaf",
      name: ["", "Users", "example", "private"].join("/"),
      posture: "fixture",
      maturity: "fixture_backed"
    }
  });

  assert.equal(report.status, "failed");
  assertFinding(report, "private_or_forbidden_path_in_state_config");
});

test("exports HMC state APIs from the kernel barrel", async () => {
  const kernel = await import("../index.js");

  assert.equal(typeof kernel.deriveHmcStateConfig, "function");
});

function validConfig(): HmcStateConfig {
  return {
    project: {
      id: "hadaf",
      name: "HADAF v1",
      posture: "HADAF_H01_H02_FOUNDATION_IMPLEMENTED_AND_BOUNDEDLY_VERIFIED",
      maturity: "fixture_backed"
    },
    boxes: [
      {
        id: "H01",
        name: "Source Vault and Target Guard",
        status: "complete",
        maturity: "fixture_backed",
        debt: ["historical_manifest_nested_product_refs"]
      },
      {
        id: "H02",
        name: "Mission Control and Product Preview",
        status: "boundedly_verified",
        maturity: "fixture_backed"
      },
      {
        id: "H03",
        name: "Plan Compiler and Delivery Constitution",
        status: "product_pipeline_complete_pending_box_assurance",
        maturity: "fixture_backed",
        debt: ["human_ratification_pending", "h04_h06_execution_not_authorized"]
      },
      {
        id: "H04",
        name: "Lifecycle State and Run Ledger",
        status: "conditional_go_to_h05",
        maturity: "fixture_backed",
        debt: ["h05_box_assurance_pending", "h06_not_implemented"]
      },
      {
        id: "H05",
        name: "Agent Registry and Circuit Breakers",
        status: "product_pipeline_active",
        maturity: "fixture_backed",
        debt: ["box_assurance_pending", "runtime_agent_execution_not_implemented"]
      }
    ],
    ffets: [
      {
        id: "H02-F00",
        title: "Architecture contract",
        status: "merged",
        maturity: "fixture_backed"
      },
      {
        id: "H02-F02",
        title: "Read adapters",
        status: "merged",
        maturity: "fixture_backed"
      },
      {
        id: "H02-F04",
        title: "Static assurance and closeout",
        status: "merged",
        maturity: "fixture_backed"
      },
      {
        id: "H02-F04-R1",
        title: "Quality claim precision correction",
        status: "verified",
        maturity: "fixture_backed"
      },
      {
        id: "H03-F00",
        title: "Schema registry boundary",
        status: "closeout_complete",
        maturity: "fixture_backed"
      },
      {
        id: "H03-F01",
        title: "Input authority boundary",
        status: "closeout_complete",
        maturity: "fixture_backed"
      },
      {
        id: "H03-F02",
        title: "Plan normalization boundary",
        status: "closeout_complete",
        maturity: "fixture_backed"
      },
      {
        id: "H03-F03",
        title: "Question Register boundary",
        status: "closeout_complete",
        maturity: "fixture_backed"
      },
      {
        id: "H03-F04",
        title: "Delivery Constitution compiler boundary",
        status: "closeout_complete",
        maturity: "fixture_backed"
      },
      {
        id: "H03-F05",
        title: "Constitution readiness boundary",
        status: "closeout_complete",
        maturity: "fixture_backed"
      },
      {
        id: "H03-F06",
        title: "HMC derived projection",
        status: "closeout_complete",
        maturity: "fixture_backed"
      },
      {
        id: "H04-F00",
        title: "Truth Ledger schema boundary",
        status: "closeout_complete",
        maturity: "fixture_backed"
      },
      {
        id: "H04-F01",
        title: "Box lifecycle state verifier",
        status: "closeout_complete",
        maturity: "fixture_backed"
      },
      {
        id: "H04-F02",
        title: "FFET lifecycle verifier",
        status: "closeout_complete",
        maturity: "fixture_backed"
      },
      {
        id: "H04-F03",
        title: "Closeout chain verifier",
        status: "closeout_complete",
        maturity: "fixture_backed"
      },
      {
        id: "H04-F05",
        title: "Finalize Box verifier",
        status: "closeout_complete",
        maturity: "fixture_backed"
      },
      {
        id: "H04-F06",
        title: "HMC lifecycle projection",
        status: "closeout_complete",
        maturity: "fixture_backed"
      },
      {
        id: "H05-F00",
        title: "Agent registry state model",
        status: "closeout_complete",
        maturity: "fixture_backed"
      },
      {
        id: "H05-F01",
        title: "Agent cards and capability contracts",
        status: "closeout_complete",
        maturity: "fixture_backed"
      },
      {
        id: "H05-F02",
        title: "Circuit breakers and no-rogue controls",
        status: "closeout_complete",
        maturity: "fixture_backed"
      },
      {
        id: "H05-F03",
        title: "Upskill and decision learning records",
        status: "closeout_complete",
        maturity: "fixture_backed"
      },
      {
        id: "H05-F04",
        title: "HMC agent projection",
        status: "active",
        maturity: "fixture_backed"
      }
    ],
    quality: [
      {
        id: "hmc_static_smoke",
        status: "passed",
        maturity: "fixture_backed",
        cannotClaim: ["browser_accessibility_complete"]
      },
      {
        id: "h05_hmc_agent_projection",
        status: "passed",
        maturity: "fixture_backed",
        cannotClaim: [
          "stable_agents",
          "mechanically_independent_agents",
          "runtime_circuit_breaker_enforcement",
          "runtime_upskill_enforcement",
          "HMC_authoritative_state"
        ]
      }
    ],
    evidence: [
      {
        id: "H02-F01",
        status: "verified",
        maturity: "fixture_backed",
        required: true
      },
      {
        id: "H05-F03",
        status: "verified",
        maturity: "fixture_backed",
        required: true
      }
    ],
    decisions: [
      {
        id: "h03-human-ratification",
        status: "blocked",
        maturity: "fixture_backed"
      }
    ],
    h03Projection: {
      id: "H03",
      status: "product_pipeline_complete_pending_box_assurance",
      maturity: "fixture_backed",
      authority: "derived_view_only",
      freshness: "fresh",
      compilerStages: [
        {
          id: "H03-F00",
          title: "Schema registry boundary",
          status: "closeout_complete",
          maturity: "fixture_backed",
          closeoutStatus: "closeout_complete"
        },
        {
          id: "H03-F01",
          title: "Input authority boundary",
          status: "closeout_complete",
          maturity: "fixture_backed",
          closeoutStatus: "closeout_complete"
        },
        {
          id: "H03-F02",
          title: "Plan normalization boundary",
          status: "closeout_complete",
          maturity: "fixture_backed",
          closeoutStatus: "closeout_complete"
        },
        {
          id: "H03-F03",
          title: "Question Register boundary",
          status: "closeout_complete",
          maturity: "fixture_backed",
          closeoutStatus: "closeout_complete"
        },
        {
          id: "H03-F04",
          title: "Delivery Constitution compiler boundary",
          status: "closeout_complete",
          maturity: "fixture_backed",
          closeoutStatus: "closeout_complete"
        },
        {
          id: "H03-F05",
          title: "Constitution readiness boundary",
          status: "closeout_complete",
          maturity: "fixture_backed",
          closeoutStatus: "closeout_complete"
        },
        {
          id: "H03-F06",
          title: "HMC derived projection",
          status: "closeout_complete",
          maturity: "fixture_backed",
          closeoutStatus: "closeout_complete"
        }
      ],
      deliveryConstitution: {
        readinessStatus: "boundary_verified",
        approvalStatus: "for_human_review",
        executionAuthorized: false,
        humanRatificationRequired: true,
        maturity: "fixture_backed",
        constitutionHash: sha("d")
      },
      continuation: {
        status: "not_authorized",
        h04H05H06ExecutionAuthorized: false,
        maturity: "fixture_backed"
      }
    },
    h04Projection: {
      id: "H04",
      status: "conditional_go_to_h05",
      maturity: "fixture_backed",
      authority: "derived_view_only",
      freshness: "fresh",
      box: {
        id: "H04",
        status: "conditional_go_to_h05",
        maturity: "fixture_backed",
        assuranceStatus: "complete"
      },
      ffets: [
        h04Ffet("H04-F00", "Truth Ledger schema boundary", "closeout_complete"),
        h04Ffet("H04-F01", "Box lifecycle state verifier", "closeout_complete"),
        h04Ffet("H04-F02", "FFET lifecycle verifier", "closeout_complete"),
        h04Ffet("H04-F03", "Closeout chain verifier", "closeout_complete"),
        h04Ffet("H04-F05", "Finalize Box verifier", "closeout_complete"),
        h04Ffet("H04-F06", "HMC lifecycle projection", "closeout_complete")
      ],
      truthLedger: {
        status: "fixture_projected",
        maturity: "fixture_backed",
        authority: "derived_view_only",
        eventCount: 6,
        freshness: "fresh"
      },
      finalizer: {
        status: "implemented",
        maturity: "fixture_backed",
        successorGate: "conditional_go",
        blockingDebt: []
      }
    },
    h05Projection: {
      id: "H05",
      status: "product_pipeline_active",
      maturity: "fixture_backed",
      authority: "derived_view_only",
      freshness: "fresh",
      box: {
        id: "H05",
        status: "product_pipeline_active",
        maturity: "fixture_backed",
        assuranceStatus: "pending"
      },
      agents: [
        h05Agent("codex.bootstrap", "Bootstrap Execution Adapter"),
        h05Agent("quality.auditor", "Quality Auditor"),
        h05Agent("git.conductor", "Git Conductor")
      ],
      prerequisiteCloseouts: [
        h05Prerequisite("H05-F00"),
        h05Prerequisite("H05-F01"),
        h05Prerequisite("H05-F02"),
        h05Prerequisite("H05-F03")
      ]
    },
    git: {
      expectedMainSha: sha(),
      actualMainSha: sha(),
      originMainSha: sha()
    },
    github: {
      expectedHeadSha: sha("head"),
      currentHeadSha: sha("head"),
      openPullRequests: 0
    },
    generatedState: [
      {
        id: "runtime-checkpoint",
        freshness: "stale",
        maturity: "mocked"
      }
    ],
    classifiedMismatches: [
      {
        kind: "generated_state_not_fresh",
        ref: "generated:runtime-checkpoint",
        classification: "stale",
        detail: "Runtime checkpoint freshness remains debt."
      }
    ],
    cannotClaim: [
      "live_github_adapter_implemented",
      "persistent_state_store_implemented",
      "HMC_authoritative_state",
      "live_h03_control_adapter_implemented",
      "constitution_approved_by_human",
      "execution_authorization_granted",
      "h04_h05_h06_execution_authorized",
      "h04_assurance_complete",
      "h04_fully_implemented",
      "stable_agents",
      "mechanically_independent_agents",
      "independent_quality_auditor_qualified",
      "runtime_circuit_breaker_enforcement",
      "runtime_upskill_enforcement"
    ],
    finalPostureRecommendation: "H05_AGENT_FOUNDATION_ACTIVE_FIXTURE_BACKED"
  };
}

function h04Ffet(id: string, title: string, status: string): NonNullable<HmcStateConfig["h04Projection"]>["ffets"][number] {
  return {
    id,
    title,
    status,
    maturity: "fixture_backed",
    truthSource: "fixture",
    closeoutStatus: status === "closeout_complete" ? "closeout_complete" : "pending",
    freshness: "fresh"
  };
}

function h05Agent(agentId: string, title: string): NonNullable<HmcStateConfig["h05Projection"]>["agents"][number] {
  return {
    agentId,
    title,
    status: "fixture_projected",
    maturity: "fixture_backed",
    qualificationStatus: "fixture_tested",
    boundedUseStatus: "bounded_for_h05",
    registryStatus: "verified",
    capabilityStatus: "verified",
    circuitBreakerStatus: "verified",
    upskillStatus: "verified",
    truthSource: "fixture",
    freshness: "fresh"
  };
}

function h05Prerequisite(id: string): NonNullable<HmcStateConfig["h05Projection"]>["prerequisiteCloseouts"][number] {
  return {
    id,
    status: "closeout_complete",
    closeoutStatus: "closeout_complete",
    evidenceStatus: "verified",
    terminalLearningStatus: "complete"
  };
}

function sha(seed = "0"): string {
  return seed.repeat(64).slice(0, 64);
}

function findings(report: ReturnType<typeof deriveHmcStateConfig>, kind: string): number {
  return report.findings.filter((finding) => finding.kind === kind).length;
}

function assertFinding(report: ReturnType<typeof deriveHmcStateConfig>, kind: string): void {
  assert.equal(findings(report, kind) > 0, true);
}
