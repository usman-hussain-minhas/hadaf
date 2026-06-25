import { createHash } from "node:crypto";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { readonly [key: string]: JsonValue };

export const QUALITY_PROFILE_COMPILER_VERSION = "0.2.0";

export type QualityAuthoritySourceKind =
  | "quality_constitution"
  | "stack_pack"
  | "stack_pack_template"
  | "project_pack"
  | "control_amendment";

export interface QualityAuthoritySource {
  readonly sourceId: string;
  readonly sourceKind: QualityAuthoritySourceKind;
  readonly sourceRef: string;
  readonly sha256: string;
  readonly concreteArtifactAvailable: boolean;
}

export interface QualityProfileAuthorityInput {
  readonly compilerVersion: string;
  readonly sources: readonly QualityAuthoritySource[];
  readonly expectedSourceBindingHash?: string;
}

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

export interface QualityProfileCompilerMetadata {
  readonly name: "hadaf.quality.compiler";
  readonly version: string;
}

export interface QualityProfileSourceBinding {
  readonly sources: readonly QualityAuthoritySource[];
  readonly sourceBindingHash: string;
  readonly concreteArtifactDebt: readonly string[];
}

export type QualityProfileOverrideDirection =
  | "stricter"
  | "unchanged"
  | "weakened_with_waiver";

export interface QualityProfileOverrideRecord {
  readonly path: string;
  readonly baseline: number | boolean;
  readonly value: number | boolean;
  readonly direction: QualityProfileOverrideDirection;
  readonly waiverRef?: string;
}

export interface QualityProfileWaiver {
  readonly waiverId: string;
  readonly paths: readonly string[];
  readonly reason: string;
  readonly approvedBy: string;
  readonly expiresAt: string;
  readonly cannotClaim: readonly string[];
}

export interface QualityProfileDebtRecord {
  readonly debtId: string;
  readonly path: string;
  readonly baseline: number | boolean;
  readonly value: number | boolean;
  readonly waiverRef: string;
  readonly reason: string;
  readonly owner: string;
  readonly expiresAt: string;
  readonly cannotClaim: readonly string[];
}

export interface QualityProfileSemanticRanges {
  readonly coverageRatio: { readonly min: 0; readonly max: 1 };
  readonly cls: { readonly min: 0; readonly max: 1 };
  readonly latencyMs: { readonly min: 0 };
  readonly percentage: { readonly min: 0; readonly max: 100 };
}

export interface CompiledQualityProfile extends QualityProfileInput {
  readonly profileHash: string;
  readonly compiledProfileHash: string;
  readonly compiler: QualityProfileCompilerMetadata;
  readonly sourceBinding: QualityProfileSourceBinding;
  readonly semanticRanges: QualityProfileSemanticRanges;
  readonly overrides: readonly QualityProfileOverrideRecord[];
  readonly waiverRefs: readonly string[];
  readonly qualityDebt: readonly QualityProfileDebtRecord[];
  readonly cannotClaim: readonly string[];
}

export interface QualityProfileOverride {
  readonly testing?: Partial<QualityProfileInput["testing"]>;
  readonly performance?: Partial<QualityProfileInput["performance"]>;
  readonly maintainability?: Partial<QualityProfileInput["maintainability"]>;
}

export interface QualityProfileCompileOptions {
  readonly authority?: QualityProfileAuthorityInput;
  readonly waivers?: readonly QualityProfileWaiver[];
  readonly expectedProfileHash?: string;
  readonly expectedCompiledProfileHash?: string;
}

export interface SourceBoundQualityProfileCompileOptions {
  readonly authority: QualityProfileAuthorityInput;
  readonly waivers: readonly QualityProfileWaiver[];
  readonly expectedProfileHash?: string;
  readonly expectedCompiledProfileHash?: string;
}

interface AppliedOverrideState {
  readonly records: QualityProfileOverrideRecord[];
  readonly qualityDebt: QualityProfileDebtRecord[];
  readonly cannotClaim: string[];
}

interface CompiledProfileEnvelope {
  readonly profile: QualityProfileInput;
  readonly profileHash: string;
  readonly compiler: QualityProfileCompilerMetadata;
  readonly sourceBinding: QualityProfileSourceBinding;
  readonly semanticRanges: QualityProfileSemanticRanges;
  readonly overrides: readonly QualityProfileOverrideRecord[];
  readonly waiverRefs: readonly string[];
  readonly qualityDebt: readonly QualityProfileDebtRecord[];
  readonly cannotClaim: readonly string[];
}

const DEFAULT_SEMANTIC_RANGES: QualityProfileSemanticRanges = {
  coverageRatio: { min: 0, max: 1 },
  cls: { min: 0, max: 1 },
  latencyMs: { min: 0 },
  percentage: { min: 0, max: 100 }
};

const HADAF_DOGFOOD_AUTHORITY: QualityProfileAuthorityInput = {
  compilerVersion: QUALITY_PROFILE_COMPILER_VERSION,
  expectedSourceBindingHash: "sha256:93f038f3555f1478934b2383a6770fd937ef2ac25d79ee4f97239cb13f6259bf",
  sources: [
    {
      sourceId: "hadaf_quality_constitution_v1",
      sourceKind: "quality_constitution",
      sourceRef: "hadaf-authority:quality-constitution-and-typescript-stack-quality-v1",
      sha256: "sha256:07fcc43ed3a7836892fb644656a3118f627b6944674c7bbcb9fc80f377e2af8d",
      concreteArtifactAvailable: true
    },
    {
      sourceId: "node_typescript_stack_quality_v1",
      sourceKind: "stack_pack",
      sourceRef: "hadaf-authority:stack-pack-doctrine-v1",
      sha256: "sha256:c35420422f38c54a58d5fd45dd09267a6bb6d982a196d7aa6824680ec2a6c9a2",
      concreteArtifactAvailable: false
    },
    {
      sourceId: "node_typescript_stack_pack_template_v1",
      sourceKind: "stack_pack_template",
      sourceRef: "hadaf-authority:stack-pack-template-v1",
      sha256: "sha256:d94566c3c5d30aa162a05aa5235dc1f2556ab8b91db6366fe2d577b2045c3ee2",
      concreteArtifactAvailable: true
    },
    {
      sourceId: "hadaf_v1_project_pack",
      sourceKind: "project_pack",
      sourceRef: "hadaf-authority:hadaf-v1-project-pack",
      sha256: "sha256:9b5283b07df5f96f2db75c7b32315814c7ec8d18647c7637b5a97092d873928c",
      concreteArtifactAvailable: true
    },
    {
      sourceId: "hadaf_bootstrap_audit_correction_amendment_v1",
      sourceKind: "control_amendment",
      sourceRef: "hadaf-authority:bootstrap-audit-correction-amendment-v1",
      sha256: "sha256:fde894f1dc40164f8976436c4b605ea040438d2ff9a1d5608b87fc8a4c4f1e57",
      concreteArtifactAvailable: true
    }
  ]
};

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

export function getHadafDogfoodQualityAuthorityInput(): QualityProfileAuthorityInput {
  return structuredClone(HADAF_DOGFOOD_AUTHORITY);
}

export function compileHadafDogfoodQualityProfile(
  override: QualityProfileOverride = {},
  options: QualityProfileCompileOptions = {}
): CompiledQualityProfile {
  const compileOptions: SourceBoundQualityProfileCompileOptions = {
    authority: options.authority ?? getHadafDogfoodQualityAuthorityInput(),
    waivers: options.waivers ?? [],
    ...(options.expectedProfileHash !== undefined
      ? { expectedProfileHash: options.expectedProfileHash }
      : {}),
    ...(options.expectedCompiledProfileHash !== undefined
      ? { expectedCompiledProfileHash: options.expectedCompiledProfileHash }
      : {})
  };

  return compileQualityProfile(
    getHadafDogfoodQualityProfileInput(),
    override,
    compileOptions
  );
}

export function compileQualityProfile(
  sourceProfile: QualityProfileInput,
  override: QualityProfileOverride,
  options: SourceBoundQualityProfileCompileOptions
): CompiledQualityProfile {
  const authority = normalizeAuthority(options.authority);
  const sourceBinding = compileSourceBinding(authority);
  const applied = applyOverride(structuredClone(sourceProfile), override, options.waivers);
  validateSemanticProfile(applied.profile);

  const profileHash = `sha256:${sha256(canonicalJson(applied.profile as unknown as JsonValue))}`;
  if (options.expectedProfileHash && options.expectedProfileHash !== profileHash) {
    throw new Error(
      `Quality profile hash drift: expected ${options.expectedProfileHash} but compiled ${profileHash}`
    );
  }

  const cannotClaim = uniqueStrings([
    ...sourceBinding.concreteArtifactDebt.map((debt) => debt),
    ...applied.cannotClaim
  ]);
  const waiverRefs = uniqueStrings(
    applied.records.flatMap((record) => record.waiverRef ? [record.waiverRef] : [])
  );
  const compiledProfileHash = compileProfileEnvelopeHash({
    profile: applied.profile,
    profileHash,
    compiler: compilerMetadata(authority.compilerVersion),
    sourceBinding,
    semanticRanges: DEFAULT_SEMANTIC_RANGES,
    overrides: applied.records,
    waiverRefs,
    qualityDebt: applied.qualityDebt,
    cannotClaim
  });
  if (
    options.expectedCompiledProfileHash &&
    options.expectedCompiledProfileHash !== compiledProfileHash
  ) {
    throw new Error(
      `Compiled quality profile hash drift: expected ${options.expectedCompiledProfileHash} but compiled ${compiledProfileHash}`
    );
  }

  return {
    ...applied.profile,
    profileHash,
    compiledProfileHash,
    compiler: compilerMetadata(authority.compilerVersion),
    sourceBinding,
    semanticRanges: DEFAULT_SEMANTIC_RANGES,
    overrides: applied.records,
    waiverRefs,
    qualityDebt: applied.qualityDebt,
    cannotClaim
  };
}

function normalizeAuthority(authority: QualityProfileAuthorityInput): QualityProfileAuthorityInput {
  if (authority.compilerVersion.length === 0) {
    throw new Error("Quality profile compiler version is required.");
  }
  if (authority.sources.length === 0) {
    throw new Error("Quality profile authority sources are required.");
  }

  const sourceIds = new Set<string>();
  for (const source of authority.sources) {
    if (source.sourceId.length === 0 || source.sourceRef.length === 0) {
      throw new Error("Quality profile authority sources require source id and ref.");
    }
    if (!/^sha256:[a-f0-9]{64}$/.test(source.sha256)) {
      throw new Error(`Quality profile source ${source.sourceId} must use a sha256 hash.`);
    }
    if (sourceIds.has(source.sourceId)) {
      throw new Error(`Duplicate quality profile authority source: ${source.sourceId}`);
    }
    sourceIds.add(source.sourceId);
  }

  for (const requiredKind of ["quality_constitution", "stack_pack", "project_pack"] as const) {
    if (!authority.sources.some((source) => source.sourceKind === requiredKind)) {
      throw new Error(`Missing required quality profile authority source: ${requiredKind}`);
    }
  }

  return structuredClone(authority);
}

function compileSourceBinding(authority: QualityProfileAuthorityInput): QualityProfileSourceBinding {
  const sources = [...authority.sources].sort((a, b) => a.sourceId.localeCompare(b.sourceId));
  const sourceBindingHash = `sha256:${sha256(canonicalJson({
    compiler_version: authority.compilerVersion,
    sources: sources.map((source) => ({
      concrete_artifact_available: source.concreteArtifactAvailable,
      sha256: source.sha256,
      source_id: source.sourceId,
      source_kind: source.sourceKind,
      source_ref: source.sourceRef
    }))
  }))}`;

  if (
    authority.expectedSourceBindingHash &&
    authority.expectedSourceBindingHash !== sourceBindingHash
  ) {
    throw new Error(
      `Quality source binding drift: expected ${authority.expectedSourceBindingHash} but compiled ${sourceBindingHash}`
    );
  }

  return {
    sources,
    sourceBindingHash,
    concreteArtifactDebt: sources
      .filter((source) => !source.concreteArtifactAvailable)
      .map((source) => `${source.sourceId}_concrete_artifact_pending`)
  };
}

function applyOverride(
  profile: QualityProfileInput,
  override: QualityProfileOverride,
  waivers: readonly QualityProfileWaiver[]
): { readonly profile: QualityProfileInput } & AppliedOverrideState {
  const state: AppliedOverrideState = {
    records: [],
    qualityDebt: [],
    cannotClaim: []
  };
  const testing = {
    ...profile.testing,
    projectLineCoverageMin: applyNumberOverride(
      "testing.projectLineCoverageMin",
      profile.testing.projectLineCoverageMin,
      override.testing?.projectLineCoverageMin,
      "min",
      waivers,
      state
    ),
    projectBranchCoverageMin: applyNumberOverride(
      "testing.projectBranchCoverageMin",
      profile.testing.projectBranchCoverageMin,
      override.testing?.projectBranchCoverageMin,
      "min",
      waivers,
      state
    ),
    changedLineCoverageMin: applyNumberOverride(
      "testing.changedLineCoverageMin",
      profile.testing.changedLineCoverageMin,
      override.testing?.changedLineCoverageMin,
      "min",
      waivers,
      state
    ),
    changedBranchCoverageMin: applyNumberOverride(
      "testing.changedBranchCoverageMin",
      profile.testing.changedBranchCoverageMin,
      override.testing?.changedBranchCoverageMin,
      "min",
      waivers,
      state
    ),
    criticalBoxLineCoverageMin: applyNumberOverride(
      "testing.criticalBoxLineCoverageMin",
      profile.testing.criticalBoxLineCoverageMin,
      override.testing?.criticalBoxLineCoverageMin,
      "min",
      waivers,
      state
    ),
    criticalBoxBranchCoverageMin: applyNumberOverride(
      "testing.criticalBoxBranchCoverageMin",
      profile.testing.criticalBoxBranchCoverageMin,
      override.testing?.criticalBoxBranchCoverageMin,
      "min",
      waivers,
      state
    ),
    flakyTestsForbidden: applyRequiredBoolean(
      "testing.flakyTestsForbidden",
      profile.testing.flakyTestsForbidden,
      override.testing?.flakyTestsForbidden,
      state
    ),
    testOrderDependencyForbidden: applyRequiredBoolean(
      "testing.testOrderDependencyForbidden",
      profile.testing.testOrderDependencyForbidden,
      override.testing?.testOrderDependencyForbidden,
      state
    ),
    criticalMutationOrFaultSamplingRequired: applyRequiredBoolean(
      "testing.criticalMutationOrFaultSamplingRequired",
      profile.testing.criticalMutationOrFaultSamplingRequired,
      override.testing?.criticalMutationOrFaultSamplingRequired,
      state
    )
  };

  const performance = {
    ...profile.performance,
    environmentContractRequired: applyRequiredBoolean(
      "performance.environmentContractRequired",
      profile.performance.environmentContractRequired,
      override.performance?.environmentContractRequired,
      state
    ),
    localApiReadP95Ms: applyNumberOverride(
      "performance.localApiReadP95Ms",
      profile.performance.localApiReadP95Ms,
      override.performance?.localApiReadP95Ms,
      "max",
      waivers,
      state
    ),
    localApiWriteP95Ms: applyNumberOverride(
      "performance.localApiWriteP95Ms",
      profile.performance.localApiWriteP95Ms,
      override.performance?.localApiWriteP95Ms,
      "max",
      waivers,
      state
    ),
    hmcLcpMs: applyNumberOverride(
      "performance.hmcLcpMs",
      profile.performance.hmcLcpMs,
      override.performance?.hmcLcpMs,
      "max",
      waivers,
      state
    ),
    hmcClsMax: applyNumberOverride(
      "performance.hmcClsMax",
      profile.performance.hmcClsMax,
      override.performance?.hmcClsMax,
      "max",
      waivers,
      state
    ),
    perRouteBundleBudgetRequired: applyRequiredBoolean(
      "performance.perRouteBundleBudgetRequired",
      profile.performance.perRouteBundleBudgetRequired,
      override.performance?.perRouteBundleBudgetRequired,
      state
    )
  };

  const maintainability = {
    ...profile.maintainability,
    complexityWarning: applyNumberOverride(
      "maintainability.complexityWarning",
      profile.maintainability.complexityWarning,
      override.maintainability?.complexityWarning,
      "max",
      waivers,
      state
    ),
    complexityHardReview: applyNumberOverride(
      "maintainability.complexityHardReview",
      profile.maintainability.complexityHardReview,
      override.maintainability?.complexityHardReview,
      "max",
      waivers,
      state
    ),
    functionSizeWarningLines: applyNumberOverride(
      "maintainability.functionSizeWarningLines",
      profile.maintainability.functionSizeWarningLines,
      override.maintainability?.functionSizeWarningLines,
      "max",
      waivers,
      state
    ),
    duplicationWarningPercent: applyNumberOverride(
      "maintainability.duplicationWarningPercent",
      profile.maintainability.duplicationWarningPercent,
      override.maintainability?.duplicationWarningPercent,
      "max",
      waivers,
      state
    ),
    noNewDuplicateBlockOverLines: applyNumberOverride(
      "maintainability.noNewDuplicateBlockOverLines",
      profile.maintainability.noNewDuplicateBlockOverLines,
      override.maintainability?.noNewDuplicateBlockOverLines,
      "max",
      waivers,
      state
    ),
    impactGraphReviewRequired: applyRequiredBoolean(
      "maintainability.impactGraphReviewRequired",
      profile.maintainability.impactGraphReviewRequired,
      override.maintainability?.impactGraphReviewRequired,
      state
    )
  };

  return {
    profile: {
      ...profile,
      testing,
      performance,
      maintainability
    },
    records: state.records,
    qualityDebt: state.qualityDebt,
    cannotClaim: uniqueStrings(state.cannotClaim)
  };
}

function applyRequiredBoolean(
  path: string,
  baseline: boolean,
  value: boolean | undefined,
  state: AppliedOverrideState
): boolean {
  if (value === undefined) {
    return baseline;
  }
  if (value !== true) {
    throw new Error(`Quality requirement ${path} cannot be weakened to false`);
  }
  state.records.push({
    path,
    baseline,
    value,
    direction: baseline === value ? "unchanged" : "stricter"
  });
  return value;
}

function applyNumberOverride(
  path: string,
  baseline: number,
  value: number | undefined,
  mode: "min" | "max",
  waivers: readonly QualityProfileWaiver[],
  state: AppliedOverrideState
): number {
  if (value === undefined) {
    return baseline;
  }
  assertFiniteNumber(path, value);
  const weakened = mode === "min" ? value < baseline : value > baseline;
  if (!weakened) {
    state.records.push({
      path,
      baseline,
      value,
      direction: value === baseline ? "unchanged" : "stricter"
    });
    return value;
  }

  const waiver = findWaiver(path, waivers);
  if (!waiver) {
    throw new Error(`Quality threshold ${path} weakened from ${baseline} to ${value} without waiver`);
  }
  validateWaiver(waiver);
  state.records.push({
    path,
    baseline,
    value,
    direction: "weakened_with_waiver",
    waiverRef: waiver.waiverId
  });
  state.qualityDebt.push({
    debtId: `quality-profile-waiver:${waiver.waiverId}:${path}`,
    path,
    baseline,
    value,
    waiverRef: waiver.waiverId,
    reason: waiver.reason,
    owner: waiver.approvedBy,
    expiresAt: waiver.expiresAt,
    cannotClaim: [...waiver.cannotClaim]
  });
  state.cannotClaim.push(...waiver.cannotClaim);
  return value;
}

function findWaiver(
  path: string,
  waivers: readonly QualityProfileWaiver[]
): QualityProfileWaiver | null {
  return waivers.find((waiver) => waiver.paths.includes(path)) ?? null;
}

function validateWaiver(waiver: QualityProfileWaiver): void {
  if (
    waiver.waiverId.length === 0 ||
    waiver.reason.length === 0 ||
    waiver.approvedBy.length === 0 ||
    waiver.cannotClaim.length === 0
  ) {
    throw new Error("Quality waiver must include id, reason, approver, and cannot_claim.");
  }
  if (!isRfc3339DateTime(waiver.expiresAt)) {
    throw new Error(`Quality waiver ${waiver.waiverId} must include an RFC3339 expiry.`);
  }
}

function validateSemanticProfile(profile: QualityProfileInput): void {
  assertRatio("testing.projectLineCoverageMin", profile.testing.projectLineCoverageMin);
  assertRatio("testing.projectBranchCoverageMin", profile.testing.projectBranchCoverageMin);
  assertRatio("testing.changedLineCoverageMin", profile.testing.changedLineCoverageMin);
  assertRatio("testing.changedBranchCoverageMin", profile.testing.changedBranchCoverageMin);
  assertRatio("testing.criticalBoxLineCoverageMin", profile.testing.criticalBoxLineCoverageMin);
  assertRatio("testing.criticalBoxBranchCoverageMin", profile.testing.criticalBoxBranchCoverageMin);
  assertOrdered(
    "testing.projectLineCoverageMin",
    profile.testing.projectLineCoverageMin,
    "testing.changedLineCoverageMin",
    profile.testing.changedLineCoverageMin
  );
  assertOrdered(
    "testing.changedLineCoverageMin",
    profile.testing.changedLineCoverageMin,
    "testing.criticalBoxLineCoverageMin",
    profile.testing.criticalBoxLineCoverageMin
  );
  assertOrdered(
    "testing.projectBranchCoverageMin",
    profile.testing.projectBranchCoverageMin,
    "testing.changedBranchCoverageMin",
    profile.testing.changedBranchCoverageMin
  );
  assertOrdered(
    "testing.changedBranchCoverageMin",
    profile.testing.changedBranchCoverageMin,
    "testing.criticalBoxBranchCoverageMin",
    profile.testing.criticalBoxBranchCoverageMin
  );

  assertPositive("performance.localApiReadP95Ms", profile.performance.localApiReadP95Ms);
  assertPositive("performance.localApiWriteP95Ms", profile.performance.localApiWriteP95Ms);
  assertPositive("performance.hmcLcpMs", profile.performance.hmcLcpMs);
  assertRatio("performance.hmcClsMax", profile.performance.hmcClsMax);
  assertOrdered(
    "performance.localApiReadP95Ms",
    profile.performance.localApiReadP95Ms,
    "performance.localApiWriteP95Ms",
    profile.performance.localApiWriteP95Ms
  );

  assertPositive("maintainability.complexityWarning", profile.maintainability.complexityWarning);
  assertPositive("maintainability.complexityHardReview", profile.maintainability.complexityHardReview);
  assertPositive(
    "maintainability.functionSizeWarningLines",
    profile.maintainability.functionSizeWarningLines,
    1
  );
  assertRange(
    "maintainability.duplicationWarningPercent",
    profile.maintainability.duplicationWarningPercent,
    0,
    100
  );
  assertPositive(
    "maintainability.noNewDuplicateBlockOverLines",
    profile.maintainability.noNewDuplicateBlockOverLines,
    1
  );
  assertOrdered(
    "maintainability.complexityWarning",
    profile.maintainability.complexityWarning,
    "maintainability.complexityHardReview",
    profile.maintainability.complexityHardReview
  );
  assertOrdered(
    "maintainability.noNewDuplicateBlockOverLines",
    profile.maintainability.noNewDuplicateBlockOverLines,
    "maintainability.functionSizeWarningLines",
    profile.maintainability.functionSizeWarningLines
  );
}

function compileProfileEnvelopeHash(input: CompiledProfileEnvelope): string {
  return `sha256:${sha256(canonicalJson(input as unknown as JsonValue))}`;
}

function compilerMetadata(version: string): QualityProfileCompilerMetadata {
  return {
    name: "hadaf.quality.compiler",
    version
  };
}

function assertFiniteNumber(path: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new Error(`Quality threshold ${path} must be a finite number.`);
  }
}

function assertPositive(path: string, value: number, minimum = 0): void {
  assertRange(path, value, minimum, Number.POSITIVE_INFINITY);
}

function assertRatio(path: string, value: number): void {
  assertRange(path, value, 0, 1);
}

function assertRange(path: string, value: number, min: number, max: number): void {
  assertFiniteNumber(path, value);
  if (value < min || value > max) {
    throw new Error(`Quality threshold ${path} must be within semantic range ${min}..${max}.`);
  }
}

function assertOrdered(
  lowerPath: string,
  lowerValue: number,
  upperPath: string,
  upperValue: number
): void {
  if (lowerValue > upperValue) {
    throw new Error(
      `Quality thresholds are inconsistent: ${lowerPath} (${lowerValue}) must be <= ${upperPath} (${upperValue}).`
    );
  }
}

function uniqueStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
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

function isRfc3339DateTime(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) {
    return false;
  }
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  if (
    month < 1 ||
    month > 12 ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    Number.isNaN(Date.parse(value))
  ) {
    return false;
  }
  const canonicalDate = new Date(Date.UTC(year, month - 1, day));
  return (
    canonicalDate.getUTCFullYear() === year &&
    canonicalDate.getUTCMonth() === month - 1 &&
    canonicalDate.getUTCDate() === day
  );
}
