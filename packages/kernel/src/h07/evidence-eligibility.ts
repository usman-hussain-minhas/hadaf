import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, normalize, relative, resolve } from "node:path";

export type H07EligibilityStatus = "passed" | "failed";
export type H07ExpectedEligibilityStatus = "passed" | "failed";

export interface H07EvidenceEligibilityConfig {
  readonly logicalRoots: Record<string, string>;
  readonly policies: readonly H07EligibilityPolicyExpectation[];
  readonly requiredCannotClaim?: readonly string[];
  readonly cannotClaim?: readonly string[];
  readonly finalPostureRecommendation?: string;
}

export interface H07EligibilityPolicyExpectation {
  readonly policyId: string;
  readonly ref: string;
  readonly sha256: string;
  readonly expectedStatus: H07ExpectedEligibilityStatus;
  readonly expectedFindingKinds?: readonly string[];
}

export interface H07EvidenceEligibilityReport {
  readonly status: H07EligibilityStatus;
  readonly findings: readonly H07EligibilityFinding[];
  readonly verified_refs: readonly H07VerifiedEligibilityRef[];
  readonly hash_failures: readonly H07EligibilityFinding[];
  readonly policy_results: readonly H07EligibilityPolicyResult[];
  readonly cannot_claim: readonly string[];
  readonly final_posture_recommendation: string | null;
}

export interface H07EligibilityPolicyResult {
  readonly policyId: string;
  readonly ref: string;
  readonly status: H07EligibilityStatus;
  readonly expectedStatus: H07ExpectedEligibilityStatus;
  readonly findingKinds: readonly string[];
}

export interface H07VerifiedEligibilityRef {
  readonly ref: string;
  readonly path: string;
  readonly sha256: string;
  readonly source: "policy";
}

export interface H07EligibilityFinding {
  readonly kind: string;
  readonly policyId?: string;
  readonly ref?: string;
  readonly path?: string;
  readonly expected?: string;
  readonly actual?: string;
  readonly detail?: string;
}

interface H07EligibilityPolicy {
  readonly schema_version: string;
  readonly policy_id: string;
  readonly claim_classes: readonly string[];
  readonly evidence_classes: readonly string[];
  readonly eligibility_rules: readonly H07EligibilityRule[];
  readonly freshness_policy: {
    readonly product_sha_required: boolean;
    readonly tree_hash_required: boolean;
    readonly evidence_manifest_hash_required: boolean;
  };
  readonly cannot_claim: readonly string[];
}

interface H07EligibilityRule {
  readonly claim_class: string;
  readonly minimum_evidence_classes: readonly string[];
  readonly exact_sha_required: boolean;
  readonly negative_fixture_required: boolean;
  readonly allowed_status: "supported" | "unsupported" | "blocked" | "not_claimed";
}

const SHA256_PATTERN = /^(?:sha256:)?[a-f0-9]{64}$/u;
const PLACEHOLDER_PATTERN = /pending|placeholder|todo|TBD|FIXME/u;
const PRIVATE_PATH_PATTERN = /(?:^|["'\s])(?:\/Users\/|\/Volumes\/|file:\/\/)/u;
export function verifyH07EvidenceEligibilityConfig(
  config: H07EvidenceEligibilityConfig
): H07EvidenceEligibilityReport {
  const findings: H07EligibilityFinding[] = [];
  const verifiedRefs: H07VerifiedEligibilityRef[] = [];
  const policyResults = config.policies.map((policyExpectation) =>
    verifyPolicyExpectation(config, policyExpectation, findings, verifiedRefs)
  );
  const hasUnexpectedFindings =
    policyResults.some((result) => result.status !== result.expectedStatus) ||
    findings.some(
      (finding) =>
        finding.kind === "policy_status_unexpected" ||
        finding.kind === "expected_policy_finding_missing"
    );
  const hashFailures = findings.filter(
    (finding) =>
      finding.kind.includes("hash") ||
      finding.kind.includes("sha") ||
      finding.kind.includes("placeholder")
  );

  return {
    status: hasUnexpectedFindings ? "failed" : "passed",
    findings,
    verified_refs: verifiedRefs,
    hash_failures: hashFailures,
    policy_results: policyResults,
    cannot_claim: [...(config.cannotClaim ?? [])],
    final_posture_recommendation: config.finalPostureRecommendation ?? null
  };
}

function verifyPolicyExpectation(
  config: H07EvidenceEligibilityConfig,
  expectation: H07EligibilityPolicyExpectation,
  findings: H07EligibilityFinding[],
  verifiedRefs: H07VerifiedEligibilityRef[]
): H07EligibilityPolicyResult {
  const localFindings: H07EligibilityFinding[] = [];
  const hashFinding = validateSha256(expectation.sha256, "policy_hash_invalid");
  if (hashFinding) localFindings.push({ ...hashFinding, policyId: expectation.policyId, ref: expectation.ref });

  const policyPath = resolveLogicalRef(expectation.ref, config.logicalRoots, localFindings);
  let policy: H07EligibilityPolicy | null = null;

  if (policyPath && existsSync(policyPath) && localFindings.length === 0) {
    const text = readFileSync(policyPath, "utf8");
    if (PRIVATE_PATH_PATTERN.test(text)) {
      localFindings.push({
        kind: "private_path_in_policy",
        policyId: expectation.policyId,
        ref: expectation.ref,
        path: policyPath
      });
    }

    const actualHash = sha256Text(text);
    const expectedHash = normalizeSha256(expectation.sha256);
    if (actualHash !== expectedHash) {
      localFindings.push({
        kind: "policy_hash_mismatch",
        policyId: expectation.policyId,
        ref: expectation.ref,
        path: policyPath,
        expected: expectedHash,
        actual: actualHash
      });
    } else {
      verifiedRefs.push({ ref: expectation.ref, path: policyPath, sha256: actualHash, source: "policy" });
    }

    try {
      policy = JSON.parse(text) as H07EligibilityPolicy;
    } catch (error) {
      localFindings.push({
        kind: "policy_json_invalid",
        policyId: expectation.policyId,
        ref: expectation.ref,
        detail: error instanceof Error ? error.message : String(error)
      });
    }
  } else if (policyPath && !existsSync(policyPath)) {
    localFindings.push({
      kind: "policy_missing",
      policyId: expectation.policyId,
      ref: expectation.ref,
      path: policyPath
    });
  }

  if (policy) {
    localFindings.push(...semanticFindings(config, expectation, policy));
  }

  const actualStatus: H07EligibilityStatus = localFindings.length === 0 ? "passed" : "failed";
  const findingKinds = localFindings.map((finding) => finding.kind);
  if (actualStatus !== expectation.expectedStatus) {
    localFindings.push({
      kind: "policy_status_unexpected",
      policyId: expectation.policyId,
      expected: expectation.expectedStatus,
      actual: actualStatus
    });
  }

  for (const expectedKind of expectation.expectedFindingKinds ?? []) {
    if (!findingKinds.includes(expectedKind)) {
      localFindings.push({
        kind: "expected_policy_finding_missing",
        policyId: expectation.policyId,
        expected: expectedKind
      });
    }
  }

  findings.push(...localFindings);
  return {
    policyId: expectation.policyId,
    ref: expectation.ref,
    status: localFindings.length === 0 ? "passed" : "failed",
    expectedStatus: expectation.expectedStatus,
    findingKinds: localFindings.map((finding) => finding.kind)
  };
}

function semanticFindings(
  config: H07EvidenceEligibilityConfig,
  expectation: H07EligibilityPolicyExpectation,
  policy: H07EligibilityPolicy
): H07EligibilityFinding[] {
  const findings: H07EligibilityFinding[] = [];
  const requiredCannotClaim = config.requiredCannotClaim ?? [];

  if (policy.schema_version !== "1.0.0") {
    findings.push({ kind: "schema_version_invalid", policyId: expectation.policyId });
  }

  if (policy.policy_id !== expectation.policyId) {
    findings.push({
      kind: "policy_id_mismatch",
      policyId: expectation.policyId,
      expected: expectation.policyId,
      actual: String(policy.policy_id)
    });
  }

  if (!policy.freshness_policy?.product_sha_required) {
    findings.push({ kind: "product_sha_requirement_missing", policyId: expectation.policyId });
  }
  if (!policy.freshness_policy?.tree_hash_required) {
    findings.push({ kind: "tree_hash_requirement_missing", policyId: expectation.policyId });
  }
  if (!policy.freshness_policy?.evidence_manifest_hash_required) {
    findings.push({ kind: "evidence_manifest_hash_requirement_missing", policyId: expectation.policyId });
  }

  for (const cannotClaim of requiredCannotClaim) {
    if (!policy.cannot_claim.includes(cannotClaim)) {
      findings.push({
        kind: "required_cannot_claim_missing",
        policyId: expectation.policyId,
        expected: cannotClaim
      });
    }
  }

  const claimClasses = new Set(policy.claim_classes);
  const evidenceClasses = new Set(policy.evidence_classes);
  for (const rule of policy.eligibility_rules) {
    if (!claimClasses.has(rule.claim_class)) {
      findings.push({
        kind: "rule_claim_class_unknown",
        policyId: expectation.policyId,
        detail: rule.claim_class
      });
    }
    for (const evidenceClass of rule.minimum_evidence_classes) {
      if (!evidenceClasses.has(evidenceClass)) {
        findings.push({
          kind: "rule_evidence_class_unknown",
          policyId: expectation.policyId,
          detail: evidenceClass
        });
      }
    }
    if (!rule.exact_sha_required) {
      findings.push({ kind: "exact_sha_requirement_missing", policyId: expectation.policyId, detail: rule.claim_class });
    }
    if (!rule.negative_fixture_required) {
      findings.push({
        kind: "negative_fixture_requirement_missing",
        policyId: expectation.policyId,
        detail: rule.claim_class
      });
    }
    if (isFutureOperationalClaim(rule.claim_class) && rule.allowed_status === "supported") {
      findings.push({
        kind: "future_operational_claim_supported",
        policyId: expectation.policyId,
        detail: rule.claim_class
      });
    }
  }

  return findings;
}

function isFutureOperationalClaim(claimClass: string): boolean {
  const normalized = claimClass.toLowerCase();
  return (
    normalized.includes("self_hosting") ||
    normalized.includes("self-hosting") ||
    normalized.includes("release_candidate") ||
    normalized.includes("release-candidate") ||
    normalized.includes("production") ||
    normalized.includes("stable_agent") ||
    normalized.includes("mechanically_independent") ||
    normalized === "p8" ||
    normalized === "p9"
  );
}

function validateSha256(value: string, kind: string): H07EligibilityFinding | null {
  if (!SHA256_PATTERN.test(value)) return { kind, actual: value };
  const normalized = normalizeSha256(value);
  if (PLACEHOLDER_PATTERN.test(value) || PLACEHOLDER_PATTERN.test(normalized)) {
    return { kind: `${kind}_placeholder`, actual: value };
  }
  if (
    normalized === "0000000000000000000000000000000000000000000000000000000000000000" ||
    normalized === "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
  ) {
    return { kind: `${kind}_stale`, actual: value };
  }
  return null;
}

function resolveLogicalRef(
  ref: string,
  logicalRoots: Record<string, string>,
  findings: H07EligibilityFinding[]
): string | null {
  const separatorIndex = ref.indexOf("://");
  if (separatorIndex < 1) {
    findings.push({ kind: "logical_root_unknown", ref });
    return null;
  }
  const scheme = ref.slice(0, separatorIndex);
  const rest = ref.slice(separatorIndex + "://".length);
  const root = logicalRoots[scheme];
  if (!rest || !root) {
    findings.push({ kind: "logical_root_unknown", ref });
    return null;
  }
  if (isAbsolute(rest)) {
    findings.push({ kind: "logical_ref_absolute_path", ref });
    return null;
  }
  const resolved = resolve(root, rest);
  const relativePath = relative(resolve(root), resolved);
  if (relativePath.startsWith("..") || isAbsolute(relativePath) || normalize(relativePath) !== relativePath) {
    findings.push({ kind: "logical_ref_path_escape", ref, path: resolved });
    return null;
  }
  return resolved;
}

function normalizeSha256(value: string): string {
  return value.startsWith("sha256:") ? value.slice("sha256:".length) : value;
}

function sha256Text(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}
