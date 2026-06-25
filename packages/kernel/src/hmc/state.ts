export type HmcStateStatus = "passed" | "failed";
export type HmcMaturity =
  | "mocked"
  | "fixture_backed"
  | "api_backed"
  | "persistent"
  | "production_connected";

export interface HmcStateConfig {
  readonly project: HmcProjectInput;
  readonly boxes: readonly HmcBoxInput[];
  readonly ffets: readonly HmcFfetInput[];
  readonly quality: readonly HmcQualityInput[];
  readonly evidence: readonly HmcEvidenceInput[];
  readonly decisions: readonly HmcDecisionInput[];
  readonly git?: HmcGitTruthInput;
  readonly github?: HmcGitHubTruthInput;
  readonly generatedState?: readonly HmcGeneratedStateInput[];
  readonly classifiedMismatches?: readonly HmcClassifiedMismatchInput[];
  readonly productionConnectionVerified?: boolean;
  readonly cannotClaim?: readonly string[];
  readonly finalPostureRecommendation?: string;
}

export interface HmcProjectInput {
  readonly id: string;
  readonly name: string;
  readonly posture: string;
  readonly maturity: HmcMaturity;
}

export interface HmcBoxInput {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly maturity: HmcMaturity;
  readonly debt?: readonly string[];
}

export interface HmcFfetInput {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly maturity: HmcMaturity;
}

export interface HmcQualityInput {
  readonly id: string;
  readonly status: string;
  readonly maturity: HmcMaturity;
  readonly cannotClaim?: readonly string[];
}

export interface HmcEvidenceInput {
  readonly id: string;
  readonly status: "verified" | "missing" | "stale" | "conflict";
  readonly maturity: HmcMaturity;
  readonly required?: boolean;
}

export interface HmcDecisionInput {
  readonly id: string;
  readonly status: "ready" | "blocked" | "empty";
  readonly maturity: HmcMaturity;
}

export interface HmcGitTruthInput {
  readonly expectedMainSha?: string;
  readonly actualMainSha?: string;
  readonly originMainSha?: string;
}

export interface HmcGitHubTruthInput {
  readonly openPullRequests?: number;
  readonly currentHeadSha?: string;
  readonly expectedHeadSha?: string;
}

export interface HmcGeneratedStateInput {
  readonly id: string;
  readonly freshness: "fresh" | "stale" | "unknown";
  readonly claimsAuthority?: boolean;
  readonly maturity: HmcMaturity;
}

export interface HmcClassifiedMismatchInput {
  readonly kind: string;
  readonly ref: string;
  readonly classification: "stale" | "missing" | "incomplete" | "conflict";
  readonly detail: string;
}

export interface HmcStateReport {
  readonly status: HmcStateStatus;
  readonly findings: readonly HmcStateFinding[];
  readonly classified_mismatches: readonly HmcClassifiedMismatch[];
  readonly verified_refs: readonly HmcVerifiedRef[];
  readonly view: HmcDerivedView;
  readonly cannot_claim: readonly string[];
  readonly final_posture_recommendation: string | null;
}

export interface HmcStateFinding {
  readonly kind: string;
  readonly ref?: string;
  readonly expected?: string;
  readonly actual?: string;
  readonly detail?: string;
}

export interface HmcClassifiedMismatch {
  readonly kind: string;
  readonly ref: string;
  readonly classification: "stale" | "missing" | "incomplete" | "conflict";
  readonly detail: string;
}

export interface HmcVerifiedRef {
  readonly ref: string;
  readonly status: string;
  readonly maturity: HmcMaturity;
}

export interface HmcDerivedView {
  readonly project: HmcProjectInput;
  readonly boxes: readonly HmcBoxInput[];
  readonly ffets: readonly HmcFfetInput[];
  readonly quality: readonly HmcQualityInput[];
  readonly evidence: readonly HmcEvidenceInput[];
  readonly decisions: readonly HmcDecisionInput[];
  readonly truthPrecedence: readonly string[];
  readonly maturitySummary: Record<HmcMaturity, number>;
}

const MATURITY_VALUES: readonly HmcMaturity[] = [
  "mocked",
  "fixture_backed",
  "api_backed",
  "persistent",
  "production_connected"
];
const MATURITY_SET = new Set(MATURITY_VALUES);
const PRIVATE_PATH_PATTERNS: readonly RegExp[] = [
  /\/Volumes\/[^\s"'`<>)\]}]+/iu,
  /\/Users\/[^\s"'`<>)\]}]+/iu,
  /file:\/\/\/?(Users|Volumes)\//iu,
  /\binput:\/\/[^\s"'`<>)\]}]+/iu
];

export function deriveHmcStateConfig(config: HmcStateConfig): HmcStateReport {
  const findings: HmcStateFinding[] = [];
  const classified = [...(config.classifiedMismatches ?? [])];

  scanPrivateValues(config, findings);
  validateMaturity("project", config.project.maturity, config, findings);
  validateCollection("box", config.boxes, config, findings);
  validateCollection("ffet", config.ffets, config, findings);
  validateCollection("quality", config.quality, config, findings);
  validateCollection("evidence", config.evidence, config, findings);
  validateCollection("decision", config.decisions, config, findings);
  validateGitTruth(config, classified, findings);
  validateGitHubTruth(config, classified, findings);
  validateEvidence(config, classified, findings);
  validateGeneratedState(config, classified, findings);

  const verifiedRefs: HmcVerifiedRef[] = [
    ...config.boxes.map((box) => ({ ref: `box:${box.id}`, status: box.status, maturity: box.maturity })),
    ...config.ffets.map((ffet) => ({ ref: `ffet:${ffet.id}`, status: ffet.status, maturity: ffet.maturity })),
    ...config.evidence.map((evidence) => ({
      ref: `evidence:${evidence.id}`,
      status: evidence.status,
      maturity: evidence.maturity
    }))
  ];

  return {
    status: findings.length === 0 ? "passed" : "failed",
    findings,
    classified_mismatches: classified,
    verified_refs: verifiedRefs,
    view: {
      project: config.project,
      boxes: config.boxes,
      ffets: config.ffets,
      quality: config.quality,
      evidence: config.evidence,
      decisions: config.decisions,
      truthPrecedence: [
        "verified_git_github_truth",
        "verified_evidence_closeout_records",
        "accepted_control_authority",
        "fresh_runtime_state",
        "generated_ui_state",
        "fixtures_and_mocks"
      ],
      maturitySummary: summarizeMaturity(config)
    },
    cannot_claim: [...(config.cannotClaim ?? [])],
    final_posture_recommendation: config.finalPostureRecommendation ?? null
  };
}

function validateCollection(
  kind: string,
  values: readonly { readonly id: string; readonly maturity: HmcMaturity }[],
  config: HmcStateConfig,
  findings: HmcStateFinding[]
): void {
  for (const value of values) {
    validateMaturity(`${kind}:${value.id}`, value.maturity, config, findings);
  }
}

function validateMaturity(
  ref: string,
  maturity: HmcMaturity,
  config: HmcStateConfig,
  findings: HmcStateFinding[]
): void {
  if (!MATURITY_SET.has(maturity)) {
    findings.push({ kind: "invalid_maturity", ref, actual: maturity });
    return;
  }
  if (maturity === "production_connected" && config.productionConnectionVerified !== true) {
    findings.push({
      kind: "production_connected_without_proof",
      ref,
      expected: "productionConnectionVerified=true",
      actual: "missing"
    });
  }
}

function validateGitTruth(
  config: HmcStateConfig,
  classified: readonly HmcClassifiedMismatchInput[],
  findings: HmcStateFinding[]
): void {
  const git = config.git;
  if (!git?.expectedMainSha) return;
  if (git.actualMainSha && git.actualMainSha !== git.expectedMainSha) {
    requireClassification("git_main_sha_mismatch", "git:main", classified, findings, {
      expected: git.expectedMainSha,
      actual: git.actualMainSha
    });
  }
  if (git.originMainSha && git.originMainSha !== git.expectedMainSha) {
    requireClassification("git_origin_main_sha_mismatch", "git:origin/main", classified, findings, {
      expected: git.expectedMainSha,
      actual: git.originMainSha
    });
  }
}

function validateGitHubTruth(
  config: HmcStateConfig,
  classified: readonly HmcClassifiedMismatchInput[],
  findings: HmcStateFinding[]
): void {
  const github = config.github;
  if (!github?.expectedHeadSha || !github.currentHeadSha) return;
  if (github.currentHeadSha !== github.expectedHeadSha) {
    requireClassification("github_head_sha_mismatch", "github:head", classified, findings, {
      expected: github.expectedHeadSha,
      actual: github.currentHeadSha
    });
  }
}

function validateEvidence(
  config: HmcStateConfig,
  classified: readonly HmcClassifiedMismatchInput[],
  findings: HmcStateFinding[]
): void {
  for (const evidence of config.evidence) {
    if (evidence.required !== true || evidence.status === "verified") continue;
    requireClassification("required_evidence_not_verified", `evidence:${evidence.id}`, classified, findings, {
      expected: "verified",
      actual: evidence.status
    });
  }
}

function validateGeneratedState(
  config: HmcStateConfig,
  classified: readonly HmcClassifiedMismatchInput[],
  findings: HmcStateFinding[]
): void {
  for (const state of config.generatedState ?? []) {
    validateMaturity(`generated:${state.id}`, state.maturity, config, findings);
    if (state.claimsAuthority === true) {
      findings.push({
        kind: "generated_state_claims_authority",
        ref: `generated:${state.id}`,
        detail: "Generated state cannot override verified Git/GitHub/Control/Evidence truth."
      });
    }
    if (state.freshness !== "fresh") {
      requireClassification(
        "generated_state_not_fresh",
        `generated:${state.id}`,
        classified,
        findings,
        { expected: "fresh", actual: state.freshness }
      );
    }
  }
}

function requireClassification(
  kind: string,
  ref: string,
  classified: readonly HmcClassifiedMismatchInput[],
  findings: HmcStateFinding[],
  detail: Pick<HmcStateFinding, "expected" | "actual">
): void {
  if (classified.some((mismatch) => mismatch.kind === kind && mismatch.ref === ref)) return;
  findings.push({
    kind: "unclassified_state_mismatch",
    ref,
    detail: kind,
    ...detail
  });
}

function scanPrivateValues(value: unknown, findings: HmcStateFinding[], path = "config"): void {
  if (typeof value === "string") {
    for (const pattern of PRIVATE_PATH_PATTERNS) {
      if (pattern.test(value)) {
        findings.push({
          kind: "private_or_forbidden_path_in_state_config",
          ref: path,
          detail: String(pattern)
        });
      }
    }
    return;
  }
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanPrivateValues(item, findings, `${path}[${index}]`));
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    scanPrivateValues(nested, findings, `${path}.${key}`);
  }
}

function summarizeMaturity(config: HmcStateConfig): Record<HmcMaturity, number> {
  const summary = Object.fromEntries(MATURITY_VALUES.map((maturity) => [maturity, 0])) as Record<HmcMaturity, number>;
  for (const maturity of [
    config.project.maturity,
    ...config.boxes.map((box) => box.maturity),
    ...config.ffets.map((ffet) => ffet.maturity),
    ...config.quality.map((quality) => quality.maturity),
    ...config.evidence.map((evidence) => evidence.maturity),
    ...config.decisions.map((decision) => decision.maturity),
    ...(config.generatedState ?? []).map((state) => state.maturity)
  ]) {
    summary[maturity] += 1;
  }
  return summary;
}
