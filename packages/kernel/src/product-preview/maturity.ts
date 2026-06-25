export type ProductPreviewStatus = "passed" | "failed";
export type ProductPreviewMaturity =
  | "mocked"
  | "fixture_backed"
  | "api_backed"
  | "persistent"
  | "production_connected";

export interface ProductPreviewConfig {
  readonly preview: ProductPreviewInput;
  readonly stateSources: readonly ProductPreviewStateSourceInput[];
  readonly claims?: readonly string[];
  readonly productionConnectionVerified?: boolean;
  readonly publicDeploymentAuthorized?: boolean;
  readonly cannotClaim?: readonly string[];
  readonly finalPostureRecommendation?: string;
}

export interface ProductPreviewInput {
  readonly id: string;
  readonly name: string;
  readonly route: string;
  readonly maturity: ProductPreviewMaturity;
  readonly publicationStatus: "not_published" | "local_only" | "public_deployed";
  readonly targetBox?: string;
  readonly targetFfet?: string;
}

export interface ProductPreviewStateSourceInput {
  readonly id: string;
  readonly label: string;
  readonly status: "mocked" | "fixture" | "api" | "persistent" | "production";
  readonly maturity: ProductPreviewMaturity;
}

export interface ProductPreviewReport {
  readonly status: ProductPreviewStatus;
  readonly findings: readonly ProductPreviewFinding[];
  readonly verified_refs: readonly ProductPreviewVerifiedRef[];
  readonly view: ProductPreviewView;
  readonly cannot_claim: readonly string[];
  readonly final_posture_recommendation: string | null;
}

export interface ProductPreviewFinding {
  readonly kind: string;
  readonly ref?: string;
  readonly expected?: string;
  readonly actual?: string;
  readonly detail?: string;
}

export interface ProductPreviewVerifiedRef {
  readonly ref: string;
  readonly status: string;
  readonly maturity: ProductPreviewMaturity;
}

export interface ProductPreviewView {
  readonly preview: ProductPreviewInput;
  readonly stateSources: readonly ProductPreviewStateSourceInput[];
  readonly maturitySummary: Record<ProductPreviewMaturity, number>;
  readonly blockedClaims: readonly string[];
}

const MATURITY_VALUES: readonly ProductPreviewMaturity[] = [
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
const FORBIDDEN_UNPROVED_CLAIMS = new Set([
  "self_hosting_ready",
  "release_candidate",
  "production_ready",
  "stable_agents"
]);

export function verifyProductPreviewConfig(config: ProductPreviewConfig): ProductPreviewReport {
  const findings: ProductPreviewFinding[] = [];

  scanPrivateValues(config, findings);
  validateMaturity("preview", config.preview.maturity, config, findings);
  for (const source of config.stateSources) {
    validateMaturity(`state_source:${source.id}`, source.maturity, config, findings);
  }
  validateRoute(config.preview, findings);
  validatePublication(config, findings);
  validateClaims(config, findings);
  validateCannotClaim(config, findings);

  return {
    status: findings.length === 0 ? "passed" : "failed",
    findings,
    verified_refs: [
      {
        ref: `preview:${config.preview.id}`,
        status: config.preview.publicationStatus,
        maturity: config.preview.maturity
      },
      ...config.stateSources.map((source) => ({
        ref: `preview_state:${source.id}`,
        status: source.status,
        maturity: source.maturity
      }))
    ],
    view: {
      preview: config.preview,
      stateSources: config.stateSources,
      maturitySummary: summarizeMaturity(config),
      blockedClaims: requiredCannotClaims(config)
    },
    cannot_claim: [...(config.cannotClaim ?? [])],
    final_posture_recommendation: config.finalPostureRecommendation ?? null
  };
}

function validateMaturity(
  ref: string,
  maturity: ProductPreviewMaturity,
  config: ProductPreviewConfig,
  findings: ProductPreviewFinding[]
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

function validateRoute(preview: ProductPreviewInput, findings: ProductPreviewFinding[]): void {
  if (!preview.route.startsWith("/")) {
    findings.push({
      kind: "invalid_preview_route",
      ref: `preview:${preview.id}`,
      expected: "absolute local route beginning with /",
      actual: preview.route
    });
  }
}

function validatePublication(config: ProductPreviewConfig, findings: ProductPreviewFinding[]): void {
  if (config.preview.publicationStatus === "public_deployed" && config.publicDeploymentAuthorized !== true) {
    findings.push({
      kind: "public_deployment_without_authorization",
      ref: `preview:${config.preview.id}`,
      expected: "publicDeploymentAuthorized=true",
      actual: "missing"
    });
  }
}

function validateClaims(config: ProductPreviewConfig, findings: ProductPreviewFinding[]): void {
  for (const claim of config.claims ?? []) {
    if (FORBIDDEN_UNPROVED_CLAIMS.has(claim)) {
      findings.push({
        kind: "forbidden_preview_claim",
        ref: `claim:${claim}`,
        detail: "Product Preview cannot promote HADAF posture in H02."
      });
    }
    if (claim === "production_connected_preview" && config.productionConnectionVerified !== true) {
      findings.push({
        kind: "production_connected_claim_without_proof",
        ref: "claim:production_connected_preview"
      });
    }
    if (claim === "public_preview_deployed" && config.publicDeploymentAuthorized !== true) {
      findings.push({
        kind: "public_preview_claim_without_authorization",
        ref: "claim:public_preview_deployed"
      });
    }
  }
}

function validateCannotClaim(config: ProductPreviewConfig, findings: ProductPreviewFinding[]): void {
  const cannotClaim = new Set(config.cannotClaim ?? []);
  for (const required of requiredCannotClaims(config)) {
    if (!cannotClaim.has(required)) {
      findings.push({
        kind: "missing_required_cannot_claim",
        ref: `cannot_claim:${required}`
      });
    }
  }
}

function requiredCannotClaims(config: ProductPreviewConfig): readonly string[] {
  const required = new Set<string>();
  if (config.productionConnectionVerified !== true) required.add("production_connected_preview");
  if (config.publicDeploymentAuthorized !== true) required.add("public_preview_deployed");
  if (!config.stateSources.some((source) => source.maturity === "persistent")) {
    required.add("persistent_preview_state");
  }
  required.add("browser_accessibility_complete");
  required.add("browser_performance_complete");
  return [...required].sort();
}

function summarizeMaturity(config: ProductPreviewConfig): Record<ProductPreviewMaturity, number> {
  const summary = Object.fromEntries(MATURITY_VALUES.map((value) => [value, 0])) as Record<ProductPreviewMaturity, number>;
  summary[config.preview.maturity] += 1;
  for (const source of config.stateSources) {
    summary[source.maturity] += 1;
  }
  return summary;
}

function scanPrivateValues(value: unknown, findings: ProductPreviewFinding[], path = "$"): void {
  if (typeof value === "string") {
    if (PRIVATE_PATH_PATTERNS.some((pattern) => pattern.test(value))) {
      findings.push({
        kind: "private_or_forbidden_path_in_preview_config",
        ref: path
      });
    }
    return;
  }
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => scanPrivateValues(entry, findings, `${path}[${index}]`));
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    scanPrivateValues(nested, findings, `${path}.${key}`);
  }
}
