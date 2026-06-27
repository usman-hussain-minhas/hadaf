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
  assert.equal(report.final_posture_recommendation, "H08_GIT_CI_PR_CONDUCTOR_PROJECTION_ACTIVE_FIXTURE_BACKED");
  assert.equal(report.view.h03Projection?.authority, "derived_view_only");
  assert.equal(report.view.h03Projection?.deliveryConstitution.approvalStatus, "for_human_review");
  assert.equal(report.view.h03Projection?.deliveryConstitution.executionAuthorized, false);
  assert.equal(report.view.h04Projection?.authority, "derived_view_only");
  assert.equal(report.view.h04Projection?.finalizer.successorGate, "conditional_go");
  assert.equal(report.view.h05Projection?.authority, "derived_view_only");
  assert.equal(report.view.h05Projection?.box.assuranceStatus, "complete");
  assert.equal(report.view.h06Projection?.authority, "derived_view_only");
  assert.equal(report.view.h06Projection?.runtime.layoutStatus, "verified");
  assert.equal(report.view.h06Projection?.runner.liveProviderStatus, "not_claimed");
  assert.equal(report.view.h07Projection?.authority, "derived_view_only");
  assert.equal(report.view.h07Projection?.proofLevels.some((proof) => proof.level === "P5" && proof.status === "verified"), true);
  assert.equal(report.view.h07Projection?.proofLevels.some((proof) => proof.level === "P9" && proof.status === "non_operational"), true);
  assert.equal(report.view.h08Projection?.authority, "derived_view_only");
  assert.equal(report.view.h08Projection?.conductor.boundedEnvelopeVerified, true);
  assert.equal(report.view.h08Projection?.dogfood.liveGithubAdapterImplemented, false);
  assert.equal(report.verified_refs.some((ref) => ref.ref === "h03_stage:H03-F05" && ref.status === "closeout_complete"), true);
  assert.equal(report.verified_refs.some((ref) => ref.ref === "h03_stage:H03-F06" && ref.status === "closeout_complete"), true);
  assert.equal(report.verified_refs.some((ref) => ref.ref === "h04_ffet:H04-F05" && ref.status === "closeout_complete"), true);
  assert.equal(report.verified_refs.some((ref) => ref.ref === "h04_ffet:H04-F06" && ref.status === "closeout_complete"), true);
  assert.equal(report.verified_refs.some((ref) => ref.ref === "h05_agent:codex.bootstrap" && ref.status === "fixture_projected"), true);
  assert.equal(report.verified_refs.some((ref) => ref.ref === "h06_runtime:worktree-registry" && ref.status === "verified"), true);
  assert.equal(report.verified_refs.some((ref) => ref.ref === "h06_runtime:pod-scheduler" && ref.status === "verified"), true);
  assert.equal(report.verified_refs.some((ref) => ref.ref === "h07_proof:P5" && ref.status === "verified"), true);
  assert.equal(report.verified_refs.some((ref) => ref.ref === "h07_prerequisite:H07-F03" && ref.status === "closeout_complete"), true);
  assert.equal(report.verified_refs.some((ref) => ref.ref === "h08_component:conductor" && ref.status === "bounded_envelope_verified"), true);
  assert.equal(report.verified_refs.some((ref) => ref.ref === "h08_prerequisite:H08-F05" && ref.status === "closeout_complete"), true);
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
    classifiedMismatches: [...(validConfig().classifiedMismatches ?? [])]
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

test("fails H06 projection authority, maturity, live, persistent, and conductor overclaims", () => {
  const report = deriveHmcStateConfig({
    ...validConfig(),
    h06Projection: {
      ...validConfig().h06Projection!,
      claimsAuthority: true,
      claimLiveRuntime: true,
      claimPersistence: true,
      claimH08Conductor: true,
      claimMechanicalIndependence: true,
      claimProductionOrchestration: true,
      maturity: "persistent",
      runner: {
        ...validConfig().h06Projection!.runner,
        liveProviderStatus: "claimed",
        productionActivationStatus: "claimed"
      }
    }
  });

  assert.equal(report.status, "failed");
  assertFinding(report, "h06_projection_claims_authority");
  assertFinding(report, "h06_projection_maturity_overclaim");
  assertFinding(report, "h06_live_runtime_overclaim");
  assertFinding(report, "h06_persistence_overclaim");
  assertFinding(report, "h06_h08_conductor_overclaim");
  assertFinding(report, "h06_mechanical_independence_overclaim");
  assertFinding(report, "h06_production_orchestration_overclaim");
  assertFinding(report, "h06_live_provider_overclaim");
  assertFinding(report, "h06_production_activation_overclaim");
});

test("fails stale or missing H06 runtime refs without visible classification", () => {
  const report = deriveHmcStateConfig({
    ...validConfig(),
    h06Projection: {
      ...validConfig().h06Projection!,
      worktrees: [
        {
          ...validConfig().h06Projection!.worktrees[0]!,
          evidenceStatus: "missing",
          freshness: "missing"
        }
      ],
      checkpoints: [
        {
          ...validConfig().h06Projection!.checkpoints[0]!,
          freshness: "stale"
        }
      ]
    },
    classifiedMismatches: [...(validConfig().classifiedMismatches ?? [])]
  });

  assert.equal(report.status, "failed");
  assert.equal(findings(report, "unclassified_state_mismatch"), 3);
});

test("passes H06 stale or missing runtime refs when visibly classified", () => {
  const report = deriveHmcStateConfig({
    ...validConfig(),
    h06Projection: {
      ...validConfig().h06Projection!,
      worktrees: [
        {
          ...validConfig().h06Projection!.worktrees[0]!,
          evidenceStatus: "missing",
          freshness: "missing"
        }
      ]
    },
    classifiedMismatches: [
      ...(validConfig().classifiedMismatches ?? []),
      {
        kind: "h06_runtime_ref_not_verified",
        ref: "h06_runtime:worktree-registry",
        classification: "missing",
        detail: "Fixture intentionally projects a missing worktree ref."
      },
      {
        kind: "h06_runtime_ref_not_fresh",
        ref: "h06_runtime:worktree-registry",
        classification: "missing",
        detail: "Fixture intentionally projects a missing worktree ref."
      }
    ]
  });

  assert.equal(report.status, "passed");
  assert.equal(report.classified_mismatches.some((mismatch) => mismatch.ref === "h06_runtime:worktree-registry"), true);
});

test("fails H06 projection when precise cannot_claim entries are missing", () => {
  const report = deriveHmcStateConfig({
    ...validConfig(),
    cannotClaim: ["live_github_adapter_implemented", "HMC_authoritative_state"]
  });

  assert.equal(report.status, "failed");
  assertFinding(report, "missing_h06_projection_cannot_claim");
});

test("fails H07 projection authority, maturity, future proof, and claim overclaims", () => {
  const report = deriveHmcStateConfig({
    ...validConfig(),
    h07Projection: {
      ...validConfig().h07Projection!,
      claimsAuthority: true,
      claimP8Operational: true,
      claimP9Operational: true,
      claimReleaseReady: true,
      claimProductionReady: true,
      claimMechanicalIndependence: true,
      claimH12Assurance: true,
      maturity: "persistent",
      proofLevels: validConfig().h07Projection!.proofLevels.map((proof) =>
        proof.level === "P8" || proof.level === "P9" ? { ...proof, status: "operational" } : proof
      )
    }
  });

  assert.equal(report.status, "failed");
  assertFinding(report, "h07_projection_claims_authority");
  assertFinding(report, "h07_projection_maturity_overclaim");
  assertFinding(report, "h07_future_proof_level_operational_overclaim");
  assertFinding(report, "h07_p8_operational_overclaim");
  assertFinding(report, "h07_p9_operational_overclaim");
  assertFinding(report, "h07_release_ready_overclaim");
  assertFinding(report, "h07_production_ready_overclaim");
  assertFinding(report, "h07_mechanical_independence_overclaim");
  assertFinding(report, "h07_h12_assurance_overclaim");
});

test("fails stale H07 proof state without visible classification", () => {
  const config = validConfig();
  const report = deriveHmcStateConfig({
    ...config,
    h07Projection: {
      ...config.h07Projection!,
      freshness: "stale",
      proofLevels: [
        {
          ...config.h07Projection!.proofLevels[0]!,
          evidenceStatus: "missing",
          negativeProofStatus: "missing",
          freshness: "stale"
        },
        ...config.h07Projection!.proofLevels.slice(1)
      ]
    },
    classifiedMismatches: [...(config.classifiedMismatches ?? [])]
  });

  assert.equal(report.status, "failed");
  assert.equal(findings(report, "unclassified_state_mismatch"), 4);
});

test("fails H07 projection when precise cannot_claim entries are missing", () => {
  const report = deriveHmcStateConfig({
    ...validConfig(),
    cannotClaim: ["live_github_adapter_implemented", "HMC_authoritative_state"]
  });

  assert.equal(report.status, "failed");
  assertFinding(report, "missing_h07_projection_cannot_claim");
  assertFinding(report, "h07_blocked_claim_missing_cannot_claim");
});

test("fails H08 projection authority, mutation, live, persistence, and H13 overclaims", () => {
  const report = deriveHmcStateConfig({
    ...validConfig(),
    h08Projection: {
      ...validConfig().h08Projection!,
      claimsAuthority: true,
      claimFullConductor: true,
      claimSettingsMutation: true,
      claimBranchProtectionMutation: true,
      claimLiveAdapter: true,
      claimPersistence: true,
      claimProductionConnected: true,
      claimH13SystemAssurance: true,
      maturity: "persistent",
      githubSettings: {
        ...validConfig().h08Projection!.githubSettings,
        settingsMutationAuthorized: true,
        branchProtectionMutationAuthorized: true,
        platformShaPinningRequiredClaimed: true
      },
      conductor: {
        ...validConfig().h08Projection!.conductor,
        fullConductorImplemented: true,
        liveMutationPermitted: true
      },
      dogfood: {
        ...validConfig().h08Projection!.dogfood,
        mode: "live",
        liveGithubAdapterImplemented: true,
        persistentStateStoreImplemented: true,
        productionConnected: true
      }
    }
  });

  assert.equal(report.status, "failed");
  assertFinding(report, "h08_projection_claims_authority");
  assertFinding(report, "h08_projection_maturity_overclaim");
  assertFinding(report, "h08_settings_mutation_overclaim");
  assertFinding(report, "h08_branch_protection_mutation_overclaim");
  assertFinding(report, "h08_platform_sha_pinning_overclaim");
  assertFinding(report, "h08_full_conductor_overclaim");
  assertFinding(report, "h08_live_adapter_overclaim");
  assertFinding(report, "h08_persistence_overclaim");
  assertFinding(report, "h08_production_connected_overclaim");
  assertFinding(report, "h08_h13_system_assurance_overclaim");
});

test("fails stale H08 projection and missing H08 component evidence without classification", () => {
  const report = deriveHmcStateConfig({
    ...validConfig(),
    h08Projection: {
      ...validConfig().h08Projection!,
      freshness: "stale",
      components: [
        {
          ...validConfig().h08Projection!.components[0]!,
          evidenceStatus: "missing",
          freshness: "missing"
        }
      ]
    },
    classifiedMismatches: [...(validConfig().classifiedMismatches ?? [])]
  });

  assert.equal(report.status, "failed");
  assert.equal(findings(report, "unclassified_state_mismatch"), 3);
});

test("fails H08 projection when precise cannot_claim entries are missing", () => {
  const report = deriveHmcStateConfig({
    ...validConfig(),
    cannotClaim: ["live_github_adapter_implemented", "HMC_authoritative_state"]
  });

  assert.equal(report.status, "failed");
  assertFinding(report, "missing_h08_projection_cannot_claim");
  assertFinding(report, "h08_blocked_claim_missing_cannot_claim");
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
      posture: "H08_GIT_CI_PR_CONDUCTOR_PROJECTION_ACTIVE_FIXTURE_BACKED",
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
        debt: ["successor_debt_classified"]
      },
      {
        id: "H05",
        name: "Agent Registry and Circuit Breakers",
        status: "conditional_go_to_h06",
        maturity: "fixture_backed",
        debt: ["runtime_agent_execution_not_implemented"]
      },
      {
        id: "H06",
        name: "Worktree, Lock, Checkpoint, and Pod Scheduler",
        status: "product_pipeline_active",
        maturity: "fixture_backed",
        debt: ["box_assurance_pending", "live_runtime_execution_not_implemented"]
      },
      {
        id: "H07",
        name: "Proof and Evidence Engine",
        status: "product_pipeline_complete_pending_box_assurance",
        maturity: "fixture_backed",
        debt: ["box_assurance_pending", "P8_P9_non_operational"]
      },
      {
        id: "H08",
        name: "Git, CI, PR, and Merge Conductor",
        status: "product_pipeline_active",
        maturity: "fixture_backed",
        debt: ["box_assurance_pending", "full_conductor_gate_pending"]
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
        status: "closeout_complete",
        maturity: "fixture_backed"
      },
      {
        id: "H06-F00",
        title: "Resource limits and quota controller",
        status: "closeout_complete",
        maturity: "fixture_backed"
      },
      {
        id: "H06-F01",
        title: "Worktree lifecycle and absolute cwd enforcement",
        status: "closeout_complete",
        maturity: "fixture_backed"
      },
      {
        id: "H06-F02",
        title: "Locks, checkpoints, and quarantine",
        status: "closeout_complete",
        maturity: "fixture_backed"
      },
      {
        id: "H06-F03",
        title: "Pod scheduler and serial fallback",
        status: "closeout_complete",
        maturity: "fixture_backed"
      },
      {
        id: "H06-F04",
        title: "Local lifecycle runner foundation",
        status: "closeout_complete",
        maturity: "fixture_backed"
      },
      {
        id: "H06-F05",
        title: "HMC runtime projection",
        status: "closeout_complete",
        maturity: "fixture_backed"
      },
      {
        id: "H07-F00",
        title: "H07 plan and FFET graph",
        status: "closeout_complete",
        maturity: "fixture_backed"
      },
      {
        id: "H07-F01",
        title: "Evidence eligibility verifier",
        status: "closeout_complete",
        maturity: "fixture_backed"
      },
      {
        id: "H07-F02",
        title: "Proof package verifier",
        status: "closeout_complete",
        maturity: "fixture_backed"
      },
      {
        id: "H07-F03",
        title: "Proof verifier aggregation",
        status: "closeout_complete",
        maturity: "fixture_backed"
      },
      {
        id: "H07-F04",
        title: "HMC proof projection",
        status: "active",
        maturity: "fixture_backed"
      },
      {
        id: "H08-F00",
        title: "Git/GitHub truth adapter",
        status: "closeout_complete",
        maturity: "fixture_backed"
      },
      {
        id: "H08-F01",
        title: "PR lifecycle state model",
        status: "closeout_complete",
        maturity: "fixture_backed"
      },
      {
        id: "H08-F02",
        title: "CI watcher",
        status: "closeout_complete",
        maturity: "fixture_backed"
      },
      {
        id: "H08-F03",
        title: "Merge readiness verifier",
        status: "closeout_complete",
        maturity: "fixture_backed"
      },
      {
        id: "H08-F04",
        title: "Limited dogfood merge readiness",
        status: "closeout_complete",
        maturity: "fixture_backed"
      },
      {
        id: "H08-F05",
        title: "Bounded dogfood conductor envelope",
        status: "closeout_complete",
        maturity: "fixture_backed"
      },
      {
        id: "H08-F06",
        title: "HMC Git/CI/PR conductor projection",
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
      },
      {
        id: "h06_hmc_runtime_projection",
        status: "passed",
        maturity: "fixture_backed",
        cannotClaim: [
          "HMC_authoritative_state",
          "live_autonomous_worktree_orchestration",
          "live_parallel_pod_execution",
          "live_lifecycle_runner_execution",
          "persistent_state_store_implemented"
        ]
      },
      {
        id: "h07_hmc_proof_projection",
        status: "passed",
        maturity: "fixture_backed",
        cannotClaim: [
          "HMC_authoritative_state",
          "release_candidate",
          "production_ready",
          "release_proof_complete",
          "production_proof_complete",
          "H12_box_assurance_engine_implemented"
        ]
      },
      {
        id: "h08_hmc_git_projection",
        status: "passed",
        maturity: "fixture_backed",
        cannotClaim: [
          "HMC_authoritative_state",
          "H08_git_ci_pr_merge_conductor_implemented",
          "github_settings_mutation_authorized",
          "branch_protection_mutation_authorized",
          "live_github_adapter_implemented",
          "persistent_state_store_implemented",
          "H13_system_assurance_engine_implemented"
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
      },
      {
        id: "H06-F04",
        status: "verified",
        maturity: "fixture_backed",
        required: true
      },
      {
        id: "H07-F03",
        status: "verified",
        maturity: "fixture_backed",
        required: true
      },
      {
        id: "H08-F05",
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
      status: "conditional_go_to_h06",
      maturity: "fixture_backed",
      authority: "derived_view_only",
      freshness: "fresh",
      box: {
        id: "H05",
        status: "conditional_go_to_h06",
        maturity: "fixture_backed",
        assuranceStatus: "complete"
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
        h05Prerequisite("H05-F03"),
        h05Prerequisite("H05-F04")
      ]
    },
    h06Projection: {
      id: "H06",
      status: "product_pipeline_active",
      maturity: "fixture_backed",
      authority: "derived_view_only",
      freshness: "fresh",
      box: {
        id: "H06",
        status: "product_pipeline_active",
        maturity: "fixture_backed",
        assuranceStatus: "pending"
      },
      runtime: {
        status: "fixture_projected",
        maturity: "fixture_backed",
        layoutStatus: "verified",
        recordStatus: "verified",
        cleanupStatus: "verified",
        freshness: "fresh"
      },
      worktrees: [h06RuntimeRef("worktree-registry", "Worktree registry")],
      locks: [h06RuntimeRef("write-locks", "Write locks")],
      checkpoints: [h06RuntimeRef("checkpoint-chain", "Checkpoint chain")],
      quarantines: [h06RuntimeRef("quarantine-records", "Quarantine records")],
      pods: [h06RuntimeRef("pod-scheduler", "Pod scheduler")],
      runner: {
        status: "fixture_projected",
        maturity: "fixture_backed",
        emissionStatus: "verified",
        restartReconcileStatus: "verified",
        liveProviderStatus: "not_claimed",
        productionActivationStatus: "not_claimed",
        freshness: "fresh"
      },
      prerequisiteCloseouts: [
        h06Prerequisite("H06-F00"),
        h06Prerequisite("H06-F01"),
        h06Prerequisite("H06-F02"),
        h06Prerequisite("H06-F03"),
        h06Prerequisite("H06-F04")
      ]
    },
    h07Projection: {
      id: "H07",
      status: "product_pipeline_complete_pending_box_assurance",
      maturity: "fixture_backed",
      authority: "derived_view_only",
      freshness: "fresh",
      box: {
        id: "H07",
        status: "product_pipeline_complete_pending_box_assurance",
        maturity: "fixture_backed",
        assuranceStatus: "pending"
      },
      proofLevels: [
        h07Proof("P0", "Authority proof", "verified", true),
        h07Proof("P1", "Static/source-target proof", "verified", true),
        h07Proof("P2", "Domain/schema proof", "verified", true),
        h07Proof("P3", "HMC projection proof", "verified", true),
        h07Proof("P4", "Agent execution evidence requirement", "blocked", false),
        h07Proof("P5", "Proof engine claim verification", "verified", true),
        h07Proof("P8", "Release proof", "non_operational", false),
        h07Proof("P9", "Production proof", "non_operational", false)
      ],
      blockedClaims: [
        {
          claimId: "release_candidate",
          reason: "P8 release proof is non-operational in H07-H12.",
          cannotClaim: "release_candidate"
        },
        {
          claimId: "production_ready",
          reason: "P9 production proof is non-operational in H07-H12.",
          cannotClaim: "production_ready"
        },
        {
          claimId: "mechanically_independent_audit",
          reason: "H07 projection is self/advisory only.",
          cannotClaim: "mechanically_independent_audit"
        }
      ],
      prerequisiteCloseouts: [
        h07Prerequisite("H07-F00"),
        h07Prerequisite("H07-F01"),
        h07Prerequisite("H07-F02"),
        h07Prerequisite("H07-F03")
      ]
    },
    h08Projection: {
      id: "H08",
      status: "product_pipeline_active",
      maturity: "fixture_backed",
      authority: "derived_view_only",
      freshness: "fresh",
      box: {
        id: "H08",
        status: "product_pipeline_active",
        maturity: "fixture_backed",
        assuranceStatus: "pending"
      },
      components: [
        h08Component("git_truth", "Git and GitHub truth", "verified"),
        h08Component("pr_lifecycle", "PR lifecycle", "verified"),
        h08Component("ci_watcher", "CI watcher", "verified"),
        h08Component("merge_readiness", "Merge readiness", "verified"),
        h08Component("conductor", "Bounded dogfood conductor envelope", "bounded_envelope_verified")
      ],
      githubSettings: {
        inspectionStatus: "verified",
        settingsMutationAuthorized: false,
        branchProtectionMutationAuthorized: false,
        platformShaPinningRequiredClaimed: false
      },
      conductor: {
        status: "bounded_envelope_verified",
        maturity: "fixture_backed",
        boundedEnvelopeVerified: true,
        dryRunDefault: true,
        fullConductorImplemented: false,
        liveMutationPermitted: false,
        freshness: "fresh"
      },
      dogfood: {
        mode: "limited_current_repo",
        limitedCurrentRepoMergeAllowed: true,
        liveGithubAdapterImplemented: false,
        persistentStateStoreImplemented: false,
        productionConnected: false
      },
      blockedClaims: [
        {
          claimId: "H08_git_ci_pr_merge_conductor_implemented",
          reason: "H08-F06 projects a bounded fixture-backed conductor state only.",
          cannotClaim: "H08_git_ci_pr_merge_conductor_implemented"
        },
        {
          claimId: "github_settings_mutation_authorized",
          reason: "H08 may inspect and report GitHub settings only.",
          cannotClaim: "github_settings_mutation_authorized"
        },
        {
          claimId: "branch_protection_mutation_authorized",
          reason: "Branch-protection mutation requires separate approval.",
          cannotClaim: "branch_protection_mutation_authorized"
        }
      ],
      prerequisiteCloseouts: [
        h08Prerequisite("H08-F00"),
        h08Prerequisite("H08-F01"),
        h08Prerequisite("H08-F02"),
        h08Prerequisite("H08-F03"),
        h08Prerequisite("H08-F04"),
        h08Prerequisite("H08-F05")
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
      "runtime_upskill_enforcement",
      "live_autonomous_worktree_orchestration",
    "live_parallel_pod_execution",
    "live_lifecycle_runner_execution",
    "H08_git_ci_pr_merge_conductor_implemented",
    "github_settings_mutation_authorized",
    "branch_protection_mutation_authorized",
    "H13_system_assurance_engine_implemented",
    "production_resource_orchestration",
      "h06_box_assurance_complete",
      "H07_proof_engine_implemented",
      "release_candidate",
      "production_ready",
      "self_hosting_ready",
      "release_proof_complete",
      "production_proof_complete",
      "mechanically_independent_audit",
      "H12_box_assurance_engine_implemented"
    ],
    finalPostureRecommendation: "H08_GIT_CI_PR_CONDUCTOR_PROJECTION_ACTIVE_FIXTURE_BACKED"
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

function h06RuntimeRef(id: string, title: string): NonNullable<HmcStateConfig["h06Projection"]>["worktrees"][number] {
  return {
    id,
    title,
    status: "fixture_projected",
    maturity: "fixture_backed",
    evidenceStatus: "verified",
    truthSource: "fixture",
    freshness: "fresh",
    required: true
  };
}

function h06Prerequisite(id: string): NonNullable<HmcStateConfig["h06Projection"]>["prerequisiteCloseouts"][number] {
  return {
    id,
    status: "closeout_complete",
    closeoutStatus: "closeout_complete",
    evidenceStatus: "verified",
    terminalLearningStatus: "complete"
  };
}

function h07Proof(
  level: NonNullable<HmcStateConfig["h07Projection"]>["proofLevels"][number]["level"],
  title: string,
  status: NonNullable<HmcStateConfig["h07Projection"]>["proofLevels"][number]["status"],
  required: boolean
): NonNullable<HmcStateConfig["h07Projection"]>["proofLevels"][number] {
  return {
    level,
    title,
    status,
    maturity: "fixture_backed",
    evidenceStatus: required ? "verified" : "not_applicable",
    negativeProofStatus: "verified",
    freshness: "fresh",
    required
  };
}

function h07Prerequisite(id: string): NonNullable<HmcStateConfig["h07Projection"]>["prerequisiteCloseouts"][number] {
  return {
    id,
    status: "closeout_complete",
    closeoutStatus: "closeout_complete",
    evidenceStatus: "verified",
    terminalLearningStatus: "complete"
  };
}

function h08Component(
  id: NonNullable<HmcStateConfig["h08Projection"]>["components"][number]["id"],
  title: string,
  status: string
): NonNullable<HmcStateConfig["h08Projection"]>["components"][number] {
  return {
    id,
    title,
    status,
    maturity: "fixture_backed",
    evidenceStatus: "verified",
    truthSource: "fixture",
    freshness: "fresh",
    required: true
  };
}

function h08Prerequisite(id: string): NonNullable<HmcStateConfig["h08Projection"]>["prerequisiteCloseouts"][number] {
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
