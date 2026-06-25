import { createHash } from "node:crypto";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { readonly [key: string]: JsonValue };

export interface QualityProfileInput {
  readonly qualityProfileId: string;
  readonly version: string;
  readonly scope: string;
  readonly inheritedFrom: readonly string[];
  readonly coding: {
    readonly formatterRequired: boolean;
    readonly lintErrorsMax: number;
    readonly newWarningsMax: number;
    readonly strictTypes: boolean;
    readonly noImplicitAny: boolean;
    readonly noUnused: boolean;
    readonly unjustifiedAnyForbidden: boolean;
    readonly uncheckedSuppressionsForbidden: boolean;
    readonly placeholderReleaseCodeForbidden: boolean;
  };
  readonly testing: {
    readonly projectLineCoverageMin: number;
    readonly projectBranchCoverageMin: number;
    readonly changedLineCoverageMin: number;
    readonly changedBranchCoverageMin: number;
    readonly criticalBoxLineCoverageMin: number;
    readonly criticalBoxBranchCoverageMin: number;
    readonly flakyTestsForbidden: boolean;
    readonly testOrderDependencyForbidden: boolean;
    readonly criticalMutationOrFaultSamplingRequired: boolean;
  };
  readonly documentation: {
    readonly rootReadmeRequired: boolean;
    readonly developerSetupRequired: boolean;
    readonly apiDocsWhenPublicApi: boolean;
    readonly adrForArchitectureDecision: boolean;
    readonly commentsForNonObviousInvariants: boolean;
    readonly ffetChangelogInProductRepo: boolean;
    readonly boxDocsInControlPlane: boolean;
  };
  readonly accessibility: {
    readonly automatedChecksRequired: boolean;
    readonly keyboardProofForCriticalFlows: boolean;
    readonly responsiveStateProofRequired: boolean;
  };
  readonly security: {
    readonly secretScanRequired: boolean;
    readonly dependencyScanRequired: boolean;
    readonly sastRequired: boolean;
    readonly highCriticalFindingsBlock: boolean;
    readonly logRedactionRequired: boolean;
  };
  readonly performance: {
    readonly environmentContractRequired: boolean;
    readonly localApiReadP95Ms: number;
    readonly localApiWriteP95Ms: number;
    readonly hmcLcpMs: number;
    readonly hmcClsMax: number;
    readonly perRouteBundleBudgetRequired: boolean;
  };
  readonly maintainability: {
    readonly complexityWarning: number;
    readonly complexityHardReview: number;
    readonly functionSizeWarningLines: number;
    readonly duplicationWarningPercent: number;
    readonly noNewDuplicateBlockOverLines: number;
    readonly impactGraphReviewRequired: boolean;
  };
  readonly reliabilityObservability: {
    readonly boundedTimeoutsRetriesRequired: boolean;
    readonly idempotencyWhereRelevant: boolean;
    readonly structuredLogsRequired: boolean;
    readonly healthReadinessRequiredForServices: boolean;
    readonly resourceCleanupRequired: boolean;
  };
  readonly dataCompatibilityRollback: {
    readonly semanticRollbackRequiredWhenStateful: boolean;
    readonly migrationCompensationRequired: boolean;
    readonly apiSchemaCompatibilityRequired: boolean;
  };
  readonly supplyChain: {
    readonly sbomRequired: boolean;
    readonly provenanceRequired: boolean;
    readonly lockfileIntegrityRequired: boolean;
  };
  readonly review: {
    readonly independentAgentReviewRequired: boolean;
    readonly implementingAgentSelfAttestationForbidden: boolean;
    readonly humanReviewRiskLevels: readonly string[];
  };
  readonly debt: {
    readonly ownerRequired: boolean;
    readonly expiryRequired: boolean;
    readonly remediationFfetRequired: boolean;
    readonly cannotClaimRequired: boolean;
    readonly prohibitedWaiverClasses: readonly string[];
  };
  readonly dependencyLicensePolicy: {
    readonly permissive: string;
    readonly weakCopyleft: string;
    readonly strongCopyleft: string;
    readonly noncommercialSourceAvailableCustomUnknown: string;
    readonly unlicensedExternalCode: string;
  };
}

export interface CompiledQualityProfile extends QualityProfileInput {
  readonly profileHash: string;
}

export interface QualityProfileOverride {
  readonly testing?: Partial<QualityProfileInput["testing"]>;
  readonly performance?: Partial<QualityProfileInput["performance"]>;
  readonly maintainability?: Partial<QualityProfileInput["maintainability"]>;
}

const HADAF_DOGFOOD_QUALITY_PROFILE: QualityProfileInput = {
  qualityProfileId: "hadaf_dogfood_quality_v1",
  version: "1.0.0",
  scope: "hadaf_dogfood",
  inheritedFrom: [
    "hadaf_quality_constitution_v1",
    "node_typescript_stack_quality_v1",
    "hadaf_v1_project_pack"
  ],
  coding: {
    formatterRequired: true,
    lintErrorsMax: 0,
    newWarningsMax: 0,
    strictTypes: true,
    noImplicitAny: true,
    noUnused: true,
    unjustifiedAnyForbidden: true,
    uncheckedSuppressionsForbidden: true,
    placeholderReleaseCodeForbidden: true
  },
  testing: {
    projectLineCoverageMin: 0.8,
    projectBranchCoverageMin: 0.75,
    changedLineCoverageMin: 0.9,
    changedBranchCoverageMin: 0.8,
    criticalBoxLineCoverageMin: 0.95,
    criticalBoxBranchCoverageMin: 0.9,
    flakyTestsForbidden: true,
    testOrderDependencyForbidden: true,
    criticalMutationOrFaultSamplingRequired: true
  },
  documentation: {
    rootReadmeRequired: true,
    developerSetupRequired: true,
    apiDocsWhenPublicApi: true,
    adrForArchitectureDecision: true,
    commentsForNonObviousInvariants: true,
    ffetChangelogInProductRepo: false,
    boxDocsInControlPlane: true
  },
  accessibility: {
    automatedChecksRequired: true,
    keyboardProofForCriticalFlows: true,
    responsiveStateProofRequired: true
  },
  security: {
    secretScanRequired: true,
    dependencyScanRequired: true,
    sastRequired: true,
    highCriticalFindingsBlock: true,
    logRedactionRequired: true
  },
  performance: {
    environmentContractRequired: true,
    localApiReadP95Ms: 200,
    localApiWriteP95Ms: 500,
    hmcLcpMs: 2500,
    hmcClsMax: 0.1,
    perRouteBundleBudgetRequired: true
  },
  maintainability: {
    complexityWarning: 10,
    complexityHardReview: 15,
    functionSizeWarningLines: 60,
    duplicationWarningPercent: 5,
    noNewDuplicateBlockOverLines: 12,
    impactGraphReviewRequired: true
  },
  reliabilityObservability: {
    boundedTimeoutsRetriesRequired: true,
    idempotencyWhereRelevant: true,
    structuredLogsRequired: true,
    healthReadinessRequiredForServices: true,
    resourceCleanupRequired: true
  },
  dataCompatibilityRollback: {
    semanticRollbackRequiredWhenStateful: true,
    migrationCompensationRequired: true,
    apiSchemaCompatibilityRequired: true
  },
  supplyChain: {
    sbomRequired: true,
    provenanceRequired: true,
    lockfileIntegrityRequired: true
  },
  review: {
    independentAgentReviewRequired: true,
    implementingAgentSelfAttestationForbidden: true,
    humanReviewRiskLevels: ["critical", "irreversible", "authority_change", "licence_change"]
  },
  debt: {
    ownerRequired: true,
    expiryRequired: true,
    remediationFfetRequired: true,
    cannotClaimRequired: true,
    prohibitedWaiverClasses: [
      "source_mutation",
      "evidence_falsification",
      "secret_exposure",
      "critical_exploitable_vulnerability",
      "data_isolation_failure",
      "unauthorized_money_or_provider_action",
      "zero_residue_breach"
    ]
  },
  dependencyLicensePolicy: {
    permissive: "allowed_after_notice_and_sbom",
    weakCopyleft: "human_review_required",
    strongCopyleft: "blocked_unless_explicitly_approved",
    noncommercialSourceAvailableCustomUnknown: "human_review_required",
    unlicensedExternalCode: "prohibited"
  }
};

export function getHadafDogfoodQualityProfileInput(): QualityProfileInput {
  return structuredClone(HADAF_DOGFOOD_QUALITY_PROFILE);
}

export function compileHadafDogfoodQualityProfile(
  override: QualityProfileOverride = {}
): CompiledQualityProfile {
  const profile = applyOverride(getHadafDogfoodQualityProfileInput(), override);
  const profileHash = `sha256:${sha256(canonicalJson(profile as unknown as JsonValue))}`;
  return { ...profile, profileHash };
}

function applyOverride(
  profile: QualityProfileInput,
  override: QualityProfileOverride
): QualityProfileInput {
  const testing = { ...profile.testing, ...override.testing };
  const performance = { ...profile.performance, ...override.performance };
  const maintainability = { ...profile.maintainability, ...override.maintainability };

  assertNotWeakened("testing.projectLineCoverageMin", testing.projectLineCoverageMin, profile.testing.projectLineCoverageMin, "min");
  assertNotWeakened("testing.projectBranchCoverageMin", testing.projectBranchCoverageMin, profile.testing.projectBranchCoverageMin, "min");
  assertNotWeakened("testing.changedLineCoverageMin", testing.changedLineCoverageMin, profile.testing.changedLineCoverageMin, "min");
  assertNotWeakened("testing.changedBranchCoverageMin", testing.changedBranchCoverageMin, profile.testing.changedBranchCoverageMin, "min");
  assertNotWeakened("testing.criticalBoxLineCoverageMin", testing.criticalBoxLineCoverageMin, profile.testing.criticalBoxLineCoverageMin, "min");
  assertNotWeakened("testing.criticalBoxBranchCoverageMin", testing.criticalBoxBranchCoverageMin, profile.testing.criticalBoxBranchCoverageMin, "min");
  assertRequiredBoolean("testing.flakyTestsForbidden", testing.flakyTestsForbidden);
  assertRequiredBoolean("testing.testOrderDependencyForbidden", testing.testOrderDependencyForbidden);
  assertRequiredBoolean("testing.criticalMutationOrFaultSamplingRequired", testing.criticalMutationOrFaultSamplingRequired);

  assertNotWeakened("performance.localApiReadP95Ms", performance.localApiReadP95Ms, profile.performance.localApiReadP95Ms, "max");
  assertNotWeakened("performance.localApiWriteP95Ms", performance.localApiWriteP95Ms, profile.performance.localApiWriteP95Ms, "max");
  assertNotWeakened("performance.hmcLcpMs", performance.hmcLcpMs, profile.performance.hmcLcpMs, "max");
  assertNotWeakened("performance.hmcClsMax", performance.hmcClsMax, profile.performance.hmcClsMax, "max");
  assertRequiredBoolean("performance.environmentContractRequired", performance.environmentContractRequired);
  assertRequiredBoolean("performance.perRouteBundleBudgetRequired", performance.perRouteBundleBudgetRequired);

  assertNotWeakened("maintainability.complexityWarning", maintainability.complexityWarning, profile.maintainability.complexityWarning, "max");
  assertNotWeakened("maintainability.complexityHardReview", maintainability.complexityHardReview, profile.maintainability.complexityHardReview, "max");
  assertNotWeakened("maintainability.functionSizeWarningLines", maintainability.functionSizeWarningLines, profile.maintainability.functionSizeWarningLines, "max");
  assertNotWeakened("maintainability.duplicationWarningPercent", maintainability.duplicationWarningPercent, profile.maintainability.duplicationWarningPercent, "max");
  assertNotWeakened("maintainability.noNewDuplicateBlockOverLines", maintainability.noNewDuplicateBlockOverLines, profile.maintainability.noNewDuplicateBlockOverLines, "max");
  assertRequiredBoolean("maintainability.impactGraphReviewRequired", maintainability.impactGraphReviewRequired);

  return {
    ...profile,
    testing,
    performance,
    maintainability
  };
}

function assertRequiredBoolean(path: string, value: boolean): void {
  if (value !== true) {
    throw new Error(`Quality requirement ${path} cannot be weakened to false`);
  }
}

function assertNotWeakened(path: string, value: number, baseline: number, mode: "min" | "max"): void {
  const weakened = mode === "min" ? value < baseline : value > baseline;
  if (weakened) {
    throw new Error(`Quality threshold ${path} weakened from ${baseline} to ${value}`);
  }
}

function canonicalJson(value: JsonValue): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }

  const entries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(",")}}`;
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}
