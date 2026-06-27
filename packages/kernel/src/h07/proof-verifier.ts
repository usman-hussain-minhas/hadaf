import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, normalize, relative, resolve } from "node:path";
import {
  verifyH07EvidenceEligibilityConfig,
  type H07EvidenceEligibilityConfig,
  type H07EvidenceEligibilityReport
} from "./evidence-eligibility.js";
import {
  verifyH07ProofPackageConfig,
  type H07ProofPackageConfig,
  type H07ProofPackageReport
} from "./proof-package.js";

export type H07ProofVerifierStatus = "passed" | "failed";
export type H07ExpectedProofVerifierStatus = "passed" | "failed";

export interface H07ProofVerifierSuiteConfig {
  readonly logicalRoots: Record<string, string>;
  readonly scenarios: readonly H07ProofVerifierScenarioExpectation[];
  readonly cannotClaim?: readonly string[];
  readonly finalPostureRecommendation?: string;
}

export interface H07ProofVerifierScenarioExpectation {
  readonly scenarioId: string;
  readonly ref: string;
  readonly sha256: string;
  readonly expectedStatus: H07ExpectedProofVerifierStatus;
  readonly expectedFindingKinds?: readonly string[];
}

export interface H07ProofVerifierReport {
  readonly status: H07ProofVerifierStatus;
  readonly findings: readonly H07ProofVerifierFinding[];
  readonly scenario_results: readonly H07ProofVerifierScenarioResult[];
  readonly verified_refs: readonly H07ProofVerifierVerifiedRef[];
  readonly hash_failures: readonly H07ProofVerifierFinding[];
  readonly proof_summary: H07ProofVerifierSummary;
  readonly cannot_claim: readonly string[];
  readonly final_posture_recommendation: string | null;
}

export interface H07ProofVerifierScenarioResult {
  readonly scenarioId: string;
  readonly ref: string;
  readonly status: H07ProofVerifierStatus;
  readonly expectedStatus: H07ExpectedProofVerifierStatus;
  readonly findingKinds: readonly string[];
  readonly eligibilityStatus: H07ProofVerifierStatus | "not_run";
  readonly proofPackageStatus: H07ProofVerifierStatus | "not_run";
  readonly proofLevels: readonly string[];
}

export interface H07ProofVerifierVerifiedRef {
  readonly ref: string;
  readonly path: string;
  readonly sha256: string;
  readonly source: "aggregate_config" | "eligibility_config" | "proof_package_config";
}

export interface H07ProofVerifierFinding {
  readonly kind: string;
  readonly scenarioId?: string;
  readonly ref?: string;
  readonly path?: string;
  readonly expected?: string;
  readonly actual?: string;
  readonly detail?: string;
}

export interface H07ProofVerifierSummary {
  readonly verified_ref_count: number;
  readonly hash_failure_count: number;
  readonly observed_negative_proof_kinds: readonly string[];
  readonly observed_proof_levels: readonly string[];
}

interface H07AggregateProofConfig {
  readonly schema_version: string;
  readonly aggregate_id: string;
  readonly eligibility_config: H07ReferencedConfig;
  readonly proof_package_config: H07ReferencedConfig;
  readonly required_proof_levels: readonly string[];
  readonly required_negative_proof_kinds: readonly string[];
  readonly operational_claims: readonly string[];
  readonly cannot_claim: readonly string[];
}

interface H07ReferencedConfig {
  readonly ref: string;
  readonly sha256: string;
}

interface H07ProofPackageFile {
  readonly proof_level?: string;
}

const SHA256_PATTERN = /^(?:sha256:)?[a-f0-9]{64}$/u;
const PLACEHOLDER_PATTERN = /pending|placeholder|todo|TBD|FIXME/u;
const OPERATIONAL_CLAIM_PATTERN =
  /(?:^|[_-])(?:P8|P9|release|production|self[_-]?hosting|stable[_-]?agents)(?:$|[_-])/iu;

export function verifyH07ProofVerifierConfig(config: H07ProofVerifierSuiteConfig): H07ProofVerifierReport {
  const findings: H07ProofVerifierFinding[] = [];
  const verifiedRefs: H07ProofVerifierVerifiedRef[] = [];
  const scenarioResults = config.scenarios.map((scenario) =>
    verifyScenario(config, scenario, findings, verifiedRefs)
  );
  const hasUnexpectedFindings =
    scenarioResults.some((result) => result.status !== result.expectedStatus) ||
    findings.some(
      (finding) =>
        finding.kind === "scenario_status_unexpected" ||
        finding.kind === "expected_scenario_finding_missing"
    );
  const hashFailures = findings.filter(
    (finding) =>
      finding.kind.includes("hash") ||
      finding.kind.includes("sha") ||
      finding.kind.includes("placeholder")
  );
  const observedNegativeKinds = [...new Set(findings.map((finding) => finding.kind))].sort();
  const proofLevels = [...new Set(scenarioResults.flatMap((result) => result.proofLevels))].sort();

  return {
    status: hasUnexpectedFindings ? "failed" : "passed",
    findings,
    scenario_results: scenarioResults,
    verified_refs: verifiedRefs,
    hash_failures: hashFailures,
    proof_summary: {
      verified_ref_count: verifiedRefs.length,
      hash_failure_count: hashFailures.length,
      observed_negative_proof_kinds: observedNegativeKinds,
      observed_proof_levels: proofLevels
    },
    cannot_claim: [...(config.cannotClaim ?? [])],
    final_posture_recommendation: config.finalPostureRecommendation ?? null
  };
}

function verifyScenario(
  suiteConfig: H07ProofVerifierSuiteConfig,
  expectation: H07ProofVerifierScenarioExpectation,
  findings: H07ProofVerifierFinding[],
  verifiedRefs: H07ProofVerifierVerifiedRef[]
): H07ProofVerifierScenarioResult {
  const localFindings: H07ProofVerifierFinding[] = [];
  const hashFinding = validateSha256(expectation.sha256, "aggregate_config_hash_invalid");
  if (hashFinding) localFindings.push({ ...hashFinding, scenarioId: expectation.scenarioId, ref: expectation.ref });

  const aggregatePath = resolveLogicalRef(expectation.ref, suiteConfig.logicalRoots, localFindings);
  let aggregateConfig: H07AggregateProofConfig | null = null;
  if (aggregatePath && existsSync(aggregatePath) && localFindings.length === 0) {
    const text = readFileSync(aggregatePath, "utf8");
    const actualHash = sha256Text(text);
    const expectedHash = normalizeSha256(expectation.sha256);
    if (actualHash !== expectedHash) {
      localFindings.push({
        kind: "aggregate_config_hash_mismatch",
        scenarioId: expectation.scenarioId,
        ref: expectation.ref,
        path: aggregatePath,
        expected: expectedHash,
        actual: actualHash
      });
    } else {
      verifiedRefs.push({
        ref: expectation.ref,
        path: aggregatePath,
        sha256: actualHash,
        source: "aggregate_config"
      });
    }
    try {
      aggregateConfig = JSON.parse(text) as H07AggregateProofConfig;
    } catch (error) {
      localFindings.push({
        kind: "aggregate_config_json_invalid",
        scenarioId: expectation.scenarioId,
        detail: error instanceof Error ? error.message : String(error)
      });
    }
  } else if (aggregatePath && !existsSync(aggregatePath)) {
    localFindings.push({
      kind: "aggregate_config_missing",
      scenarioId: expectation.scenarioId,
      ref: expectation.ref,
      path: aggregatePath
    });
  }

  let eligibilityStatus: H07ProofVerifierStatus | "not_run" = "not_run";
  let proofPackageStatus: H07ProofVerifierStatus | "not_run" = "not_run";
  const proofLevels: string[] = [];
  if (aggregateConfig) {
    const aggregateResult = verifyAggregateConfig(suiteConfig, expectation, aggregateConfig, verifiedRefs);
    localFindings.push(...aggregateResult.findings);
    eligibilityStatus = aggregateResult.eligibilityReport?.status ?? "not_run";
    proofPackageStatus = aggregateResult.proofPackageReport?.status ?? "not_run";
    proofLevels.push(...aggregateResult.proofLevels);
  }

  const actualStatus: H07ProofVerifierStatus = localFindings.length === 0 ? "passed" : "failed";
  const findingKinds = localFindings.map((finding) => finding.kind);
  if (actualStatus !== expectation.expectedStatus) {
    localFindings.push({
      kind: "scenario_status_unexpected",
      scenarioId: expectation.scenarioId,
      expected: expectation.expectedStatus,
      actual: actualStatus
    });
  }
  for (const expectedKind of expectation.expectedFindingKinds ?? []) {
    if (!findingKinds.includes(expectedKind)) {
      localFindings.push({
        kind: "expected_scenario_finding_missing",
        scenarioId: expectation.scenarioId,
        expected: expectedKind
      });
    }
  }

  findings.push(...localFindings);
  return {
    scenarioId: expectation.scenarioId,
    ref: expectation.ref,
    status: actualStatus,
    expectedStatus: expectation.expectedStatus,
    findingKinds: localFindings.map((finding) => finding.kind),
    eligibilityStatus,
    proofPackageStatus,
    proofLevels
  };
}

function verifyAggregateConfig(
  suiteConfig: H07ProofVerifierSuiteConfig,
  expectation: H07ProofVerifierScenarioExpectation,
  aggregateConfig: H07AggregateProofConfig,
  verifiedRefs: H07ProofVerifierVerifiedRef[]
): {
  findings: H07ProofVerifierFinding[];
  eligibilityReport: H07EvidenceEligibilityReport | null;
  proofPackageReport: H07ProofPackageReport | null;
  proofLevels: string[];
} {
  const findings: H07ProofVerifierFinding[] = [];
  if (aggregateConfig.schema_version !== "1.0.0") {
    findings.push({ kind: "schema_version_invalid", scenarioId: expectation.scenarioId });
  }
  if (aggregateConfig.aggregate_id !== expectation.scenarioId) {
    findings.push({
      kind: "aggregate_id_mismatch",
      scenarioId: expectation.scenarioId,
      expected: expectation.scenarioId,
      actual: String(aggregateConfig.aggregate_id)
    });
  }

  const eligibilityConfig = readReferencedConfig<H07EvidenceEligibilityConfig>(
    suiteConfig,
    expectation.scenarioId,
    aggregateConfig.eligibility_config,
    "eligibility_config",
    verifiedRefs,
    findings
  );
  const proofPackageConfig = readReferencedConfig<H07ProofPackageConfig>(
    suiteConfig,
    expectation.scenarioId,
    aggregateConfig.proof_package_config,
    "proof_package_config",
    verifiedRefs,
    findings
  );

  const eligibilityReport = eligibilityConfig ? verifyH07EvidenceEligibilityConfig(eligibilityConfig) : null;
  if (eligibilityReport?.status === "failed") {
    findings.push({ kind: "eligibility_verifier_failed", scenarioId: expectation.scenarioId });
  }
  const proofPackageReport = proofPackageConfig ? verifyH07ProofPackageConfig(proofPackageConfig) : null;
  if (proofPackageReport?.status === "failed") {
    findings.push({ kind: "proof_package_verifier_failed", scenarioId: expectation.scenarioId });
  }

  const nestedFindingKinds = [
    ...(eligibilityReport?.findings.map((finding) => finding.kind) ?? []),
    ...(proofPackageReport?.findings.map((finding) => finding.kind) ?? [])
  ];
  for (const requiredKind of aggregateConfig.required_negative_proof_kinds) {
    if (!nestedFindingKinds.includes(requiredKind)) {
      findings.push({
        kind: "negative_proof_absent",
        scenarioId: expectation.scenarioId,
        expected: requiredKind
      });
    }
  }

  for (const claim of aggregateConfig.operational_claims) {
    if (OPERATIONAL_CLAIM_PATTERN.test(claim)) {
      findings.push({
        kind: "operational_claim_requested",
        scenarioId: expectation.scenarioId,
        detail: claim
      });
    }
  }

  const proofLevels = proofPackageConfig ? readProofLevels(proofPackageConfig, findings, expectation.scenarioId) : [];
  for (const requiredLevel of aggregateConfig.required_proof_levels) {
    if (!proofLevels.includes(requiredLevel)) {
      findings.push({
        kind: "required_proof_level_missing",
        scenarioId: expectation.scenarioId,
        expected: requiredLevel
      });
    }
  }

  return { findings, eligibilityReport, proofPackageReport, proofLevels };
}

function readReferencedConfig<T>(
  suiteConfig: H07ProofVerifierSuiteConfig,
  scenarioId: string,
  refConfig: H07ReferencedConfig,
  source: "eligibility_config" | "proof_package_config",
  verifiedRefs: H07ProofVerifierVerifiedRef[],
  findings: H07ProofVerifierFinding[]
): T | null {
  const hashFinding = validateSha256(refConfig.sha256, `${source}_hash_invalid`);
  if (hashFinding) findings.push({ ...hashFinding, scenarioId, ref: refConfig.ref });
  const path = resolveLogicalRef(refConfig.ref, suiteConfig.logicalRoots, findings);
  if (!path) return null;
  if (!existsSync(path)) {
    findings.push({ kind: `${source}_missing`, scenarioId, ref: refConfig.ref, path });
    return null;
  }
  const text = readFileSync(path, "utf8");
  const actualHash = sha256Text(text);
  const expectedHash = normalizeSha256(refConfig.sha256);
  if (actualHash !== expectedHash) {
    findings.push({
      kind: `${source}_hash_mismatch`,
      scenarioId,
      ref: refConfig.ref,
      path,
      expected: expectedHash,
      actual: actualHash
    });
    return null;
  }
  verifiedRefs.push({ ref: refConfig.ref, path, sha256: actualHash, source });
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    findings.push({
      kind: `${source}_json_invalid`,
      scenarioId,
      detail: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

function readProofLevels(
  config: H07ProofPackageConfig,
  findings: H07ProofVerifierFinding[],
  scenarioId: string
): string[] {
  const proofLevels: string[] = [];
  for (const proofPackage of config.packages) {
    const packagePath = resolveLogicalRef(proofPackage.ref, config.logicalRoots, findings);
    if (!packagePath || !existsSync(packagePath)) continue;
    try {
      const parsed = JSON.parse(readFileSync(packagePath, "utf8")) as H07ProofPackageFile;
      if (parsed.proof_level) proofLevels.push(parsed.proof_level);
    } catch {
      findings.push({ kind: "proof_level_read_failed", scenarioId, ref: proofPackage.ref });
    }
  }
  return [...new Set(proofLevels)];
}

function resolveLogicalRef(
  ref: string,
  logicalRoots: Record<string, string>,
  findings: H07ProofVerifierFinding[]
): string | null {
  const [scheme, rest] = ref.split("://");
  if (!scheme || rest === undefined) {
    findings.push({ kind: "logical_ref_invalid", ref });
    return null;
  }
  const root = logicalRoots[scheme];
  if (!root) {
    findings.push({ kind: "logical_root_unknown", ref });
    return null;
  }
  if (rest.includes("\0") || isAbsolute(rest)) {
    findings.push({ kind: "logical_path_escape", ref });
    return null;
  }
  const resolvedRoot = resolve(root);
  const resolvedPath = resolve(resolvedRoot, normalize(rest));
  const relativePath = relative(resolvedRoot, resolvedPath);
  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    findings.push({ kind: "logical_path_escape", ref, path: resolvedPath });
    return null;
  }
  return resolvedPath;
}

function validateSha256(value: string, invalidKind: string): H07ProofVerifierFinding | null {
  if (PLACEHOLDER_PATTERN.test(value) || !SHA256_PATTERN.test(value)) {
    return { kind: invalidKind, actual: value };
  }
  return null;
}

function normalizeSha256(value: string): string {
  return value.startsWith("sha256:") ? value.slice("sha256:".length) : value;
}

function sha256Text(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}
