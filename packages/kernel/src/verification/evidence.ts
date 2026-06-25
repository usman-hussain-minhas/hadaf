import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, normalize, relative } from "node:path";
import { spawnSync } from "node:child_process";

export type EvidenceVerificationStatus = "passed" | "failed";

export interface EvidenceVerificationConfig {
  readonly logicalRoots: Record<string, string>;
  readonly manifestRefs: readonly string[];
  readonly requiredRefs?: readonly string[];
  readonly expectedArtifacts?: readonly EvidenceArtifactExpectation[];
  readonly productFiles?: readonly ProductFileExpectation[];
  readonly expectedProductGitSha?: string;
  readonly finalPostureRecommendation?: string;
  readonly cannotClaim?: readonly string[];
}

export interface EvidenceArtifactExpectation {
  readonly ref: string;
  readonly sha256: string;
}

export interface ProductFileExpectation {
  readonly path: string;
  readonly sha256: string;
  readonly gitSha?: string;
}

export interface EvidenceVerificationReport {
  readonly status: EvidenceVerificationStatus;
  readonly findings: readonly EvidenceVerificationFinding[];
  readonly classified_mismatches: readonly EvidenceVerificationFinding[];
  readonly verified_refs: readonly VerifiedEvidenceRef[];
  readonly hash_failures: readonly EvidenceVerificationFinding[];
  readonly cannot_claim: readonly string[];
  readonly final_posture_recommendation: string | null;
}

export interface VerifiedEvidenceRef {
  readonly ref: string;
  readonly path?: string;
  readonly sha256: string;
  readonly source: "manifest" | "expected_artifact" | "product_file";
}

export interface EvidenceVerificationFinding {
  readonly kind: string;
  readonly ref?: string;
  readonly path?: string;
  readonly expected?: string;
  readonly actual?: string;
  readonly detail?: string;
}

interface ManifestArtifact {
  readonly ref: string;
  readonly sha256: string;
}

interface ProductManifestRef {
  readonly path: string;
  readonly gitSha?: string;
}

const SHA256_PATTERN = /^(?:sha256:)?[a-f0-9]{64}$/u;
const PLACEHOLDER_PATTERN = /pending|placeholder|todo|TBD|FIXME/u;

export function verifyEvidenceConfig(
  config: EvidenceVerificationConfig
): EvidenceVerificationReport {
  const findings: EvidenceVerificationFinding[] = [];
  const verifiedRefs: VerifiedEvidenceRef[] = [];
  const manifestArtifacts: ManifestArtifact[] = [];

  for (const manifestRef of config.manifestRefs) {
    const manifestPath = resolveLogicalRef(manifestRef, config.logicalRoots, findings);
    if (!manifestPath) {
      findings.push({
        kind: "unresolved_manifest_ref",
        ref: manifestRef
      });
      continue;
    }
    if (!existsSync(manifestPath)) {
      findings.push({
        kind: "missing_manifest_ref",
        ref: manifestRef,
        path: manifestPath
      });
      continue;
    }

    const manifestHash = sha256File(manifestPath);
    verifiedRefs.push({
      ref: manifestRef,
      path: manifestPath,
      sha256: manifestHash,
      source: "manifest"
    });
    manifestArtifacts.push(...extractManifestArtifacts(manifestPath, findings));
  }
  validateDuplicateManifestRefs(manifestArtifacts, findings);

  const expectedArtifacts = new Map(
    (config.expectedArtifacts ?? []).map((artifact) => [artifact.ref, artifact.sha256])
  );
  for (const artifact of manifestArtifacts) {
    verifyArtifactHash(
      artifact.ref,
      artifact.sha256,
      config.logicalRoots,
      findings,
      verifiedRefs,
      "manifest"
    );
  }

  for (const artifact of config.expectedArtifacts ?? []) {
    verifyArtifactHash(
      artifact.ref,
      artifact.sha256,
      config.logicalRoots,
      findings,
      verifiedRefs,
      "expected_artifact"
    );
  }

  for (const ref of config.requiredRefs ?? []) {
    const bound = manifestArtifacts.some((artifact) => artifact.ref === ref) ||
      expectedArtifacts.has(ref) ||
      config.manifestRefs.includes(ref);
    if (!bound) {
      findings.push({
        kind: "unbound_required_ref",
        ref
      });
    }
  }

  verifyProductFiles(config, findings, verifiedRefs);

  const hashFailures = findings.filter((finding) =>
    finding.kind.includes("hash") ||
    finding.kind.includes("placeholder") ||
    finding.kind.includes("sha")
  );

  return {
    status: findings.length === 0 ? "passed" : "failed",
    findings,
    classified_mismatches: [],
    verified_refs: verifiedRefs,
    hash_failures: hashFailures,
    cannot_claim: [...(config.cannotClaim ?? [])],
    final_posture_recommendation: config.finalPostureRecommendation ?? null
  };
}

function verifyArtifactHash(
  ref: string,
  expectedSha256: string,
  roots: Record<string, string>,
  findings: EvidenceVerificationFinding[],
  verifiedRefs: VerifiedEvidenceRef[],
  source: "manifest" | "expected_artifact"
): void {
  const hashFinding = validateExpectedHash(ref, expectedSha256);
  if (hashFinding) {
    findings.push(hashFinding);
    return;
  }

  const productManifestRef = parseProductManifestRef(ref);
  if (productManifestRef) {
    verifyProductManifestRef(
      ref,
      productManifestRef,
      expectedSha256,
      roots,
      findings,
      verifiedRefs,
      source
    );
    return;
  }

  const path = resolveLogicalRef(ref, roots, findings);
  if (!path) {
    findings.push({ kind: "unresolved_ref", ref });
    return;
  }
  if (!existsSync(path)) {
    findings.push({ kind: "missing_ref", ref, path });
    return;
  }

  const actual = sha256File(path);
  const expected = normalizeSha256(expectedSha256);
  if (actual !== expected) {
    findings.push({
      kind: "hash_mismatch",
      ref,
      path,
      expected,
      actual
    });
    return;
  }

  verifiedRefs.push({
    ref,
    path,
    sha256: actual,
    source
  });
}

function verifyProductManifestRef(
  ref: string,
  productRef: ProductManifestRef,
  expectedSha256: string,
  roots: Record<string, string>,
  findings: EvidenceVerificationFinding[],
  verifiedRefs: VerifiedEvidenceRef[],
  source: "manifest" | "expected_artifact"
): void {
  const productRoot = roots.product;
  if (!productRoot) {
    findings.push({
      kind: "missing_product_root",
      ref,
      detail: "Product manifest references require a product logical root."
    });
    return;
  }
  if (!isRelativeProductPath(productRef.path)) {
    findings.push({
      kind: "product_file_escapes_root",
      ref,
      path: productRef.path
    });
    return;
  }

  const actual = productRef.gitSha
    ? gitBlobSha256(productRoot, productRef.gitSha, productRef.path, findings)
    : verifyLocalProductFile(productRoot, productRef.path, findings);
  if (!actual) return;

  const expected = normalizeSha256(expectedSha256);
  if (actual !== expected) {
    findings.push({
      kind: "hash_mismatch",
      ref,
      path: productRef.path,
      expected,
      actual
    });
    return;
  }

  verifiedRefs.push({
    ref,
    path: productRef.path,
    sha256: actual,
    source
  });
}

function verifyProductFiles(
  config: EvidenceVerificationConfig,
  findings: EvidenceVerificationFinding[],
  verifiedRefs: VerifiedEvidenceRef[]
): void {
  const productRoot = config.logicalRoots.product;
  if (!productRoot) {
    if ((config.productFiles?.length ?? 0) > 0) {
      findings.push({
        kind: "missing_product_root",
        detail: "Product file expectations require a product logical root."
      });
    }
    return;
  }

  for (const productFile of config.productFiles ?? []) {
    if (!isRelativeProductPath(productFile.path)) {
      findings.push({
        kind: "product_file_escapes_root",
        path: productFile.path
      });
      continue;
    }

    const hashFinding = validateExpectedHash(`product://${productFile.path}`, productFile.sha256);
    if (hashFinding) {
      findings.push(hashFinding);
      continue;
    }

    const gitSha = productFile.gitSha ?? config.expectedProductGitSha;
    if (config.expectedProductGitSha && gitSha !== config.expectedProductGitSha) {
      findings.push({
        kind: "stale_product_sha",
        path: productFile.path,
        expected: config.expectedProductGitSha,
        actual: gitSha ?? "missing"
      });
      continue;
    }

    const actual = gitSha
      ? gitBlobSha256(productRoot, gitSha, productFile.path, findings)
      : verifyLocalProductFile(productRoot, productFile.path, findings);
    if (!actual) continue;

    const expected = normalizeSha256(productFile.sha256);
    if (actual !== expected) {
      findings.push({
        kind: "product_file_hash_mismatch",
        ref: `product://${productFile.path}`,
        path: productFile.path,
        expected,
        actual
      });
      continue;
    }

    verifiedRefs.push({
      ref: `product://${productFile.path}`,
      path: productFile.path,
      sha256: actual,
      source: "product_file"
    });
  }
}

function extractManifestArtifacts(
  manifestPath: string,
  findings: EvidenceVerificationFinding[]
): ManifestArtifact[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    findings.push({
      kind: "manifest_json_parse_failed",
      path: manifestPath,
      detail: error instanceof Error ? error.message : "unknown parse error"
    });
    return [];
  }

  if (!isRecord(parsed)) {
    findings.push({
      kind: "manifest_root_malformed",
      path: manifestPath
    });
    return [];
  }

  const hasArtifacts = Object.hasOwn(parsed, "artifacts");
  const hasEntries = Object.hasOwn(parsed, "entries");
  if (hasArtifacts && hasEntries) {
    findings.push({
      kind: "ambiguous_manifest_collections",
      path: manifestPath,
      detail: "A manifest must use exactly one authorized collection form."
    });
    return [];
  }

  if (hasArtifacts) {
    return extractManifestCollection(parsed.artifacts, "artifacts", manifestPath, findings);
  }
  if (hasEntries) {
    return extractManifestCollection(parsed.entries, "entries", manifestPath, findings);
  }

  findings.push({
    kind: "unsupported_manifest_collection",
    path: manifestPath,
    detail: "Expected an authorized artifacts or entries collection."
  });
  return [];
}

function extractManifestCollection(
  value: unknown,
  collectionName: "artifacts" | "entries",
  manifestPath: string,
  findings: EvidenceVerificationFinding[]
): ManifestArtifact[] {
  if (!Array.isArray(value)) {
    findings.push({
      kind: "manifest_collection_malformed",
      path: manifestPath,
      detail: `${collectionName} must be an array.`
    });
    return [];
  }

  return value.flatMap((artifact): ManifestArtifact[] => {
    if (!isRecord(artifact)) {
      findings.push({
        kind: "manifest_entry_malformed",
        path: manifestPath,
        detail: `${collectionName} entries must be objects.`
      });
      return [];
    }
    const ref = artifact.ref;
    const sha256 = artifact.sha256;
    if (typeof ref !== "string" || typeof sha256 !== "string") {
      findings.push({
        kind: "manifest_entry_malformed",
        path: manifestPath
      });
      return [];
    }
    return [{ ref, sha256 }];
  });
}

function validateDuplicateManifestRefs(
  artifacts: readonly ManifestArtifact[],
  findings: EvidenceVerificationFinding[]
): void {
  const refs = new Map<string, string>();
  for (const artifact of artifacts) {
    const previousSha256 = refs.get(artifact.ref);
    if (previousSha256 && previousSha256 !== artifact.sha256) {
      findings.push({
        kind: "duplicate_manifest_ref_conflicting_hash",
        ref: artifact.ref,
        expected: previousSha256,
        actual: artifact.sha256
      });
    }
    refs.set(artifact.ref, artifact.sha256);
  }
}

function parseProductManifestRef(ref: string): ProductManifestRef | null {
  const match = /^product:\/\/(.+)$/u.exec(ref);
  if (!match) return null;

  const body = match[1];
  if (!body) return null;
  const gitShaMatch = /^(.*)@([a-f0-9]{40})$/u.exec(body);
  if (!gitShaMatch) {
    return {
      path: body
    };
  }

  const path = gitShaMatch[1];
  const gitSha = gitShaMatch[2];
  if (!path || !gitSha) return null;
  return {
    path,
    gitSha
  };
}

function validateExpectedHash(
  ref: string,
  expectedSha256: string
): EvidenceVerificationFinding | null {
  if (PLACEHOLDER_PATTERN.test(expectedSha256)) {
    return {
      kind: "placeholder_hash",
      ref,
      expected: expectedSha256
    };
  }
  if (!SHA256_PATTERN.test(expectedSha256)) {
    return {
      kind: "invalid_sha256",
      ref,
      expected: expectedSha256
    };
  }
  return null;
}

function resolveLogicalRef(
  ref: string,
  roots: Record<string, string>,
  findings: EvidenceVerificationFinding[]
): string | null {
  const match = /^([a-z][a-z0-9_-]*):\/\/(.+)$/u.exec(ref);
  if (!match) return null;
  const scheme = match[1];
  const body = match[2];
  const root = scheme ? roots[scheme] : undefined;
  if (!root || !body) return null;
  const resolved = resolveInsideRoot(root, body);
  if (!resolved) {
    findings.push({
      kind: "logical_ref_escapes_root",
      ref
    });
  }
  return resolved;
}

function resolveInsideRoot(root: string, body: string): string | null {
  if (!isRelativeProductPath(body)) {
    return null;
  }
  const resolved = normalize(join(root, body));
  const rootRelative = relative(root, resolved);
  if (rootRelative.startsWith("..")) {
    return null;
  }
  return resolved;
}

function isRelativeProductPath(path: string): boolean {
  if (isAbsolute(path)) return false;
  const normalized = normalize(path);
  return normalized !== ".." && !normalized.startsWith("../");
}

function verifyLocalProductFile(
  productRoot: string,
  path: string,
  findings: EvidenceVerificationFinding[]
): string | null {
  const resolved = resolveInsideRoot(productRoot, path);
  if (!resolved) {
    findings.push({
      kind: "product_file_escapes_root",
      path
    });
    return null;
  }
  if (!existsSync(resolved)) {
    findings.push({
      kind: "missing_product_file",
      path
    });
    return null;
  }
  return sha256File(resolved);
}

function gitBlobSha256(
  productRoot: string,
  gitSha: string,
  path: string,
  findings: EvidenceVerificationFinding[]
): string | null {
  const result = spawnSync("git", ["-C", productRoot, "show", `${gitSha}:${path}`], {
    encoding: "buffer"
  });
  if (result.status !== 0) {
    findings.push({
      kind: "git_blob_unavailable",
      path,
      detail: result.stderr.toString("utf8").trim()
    });
    return null;
  }
  return sha256Buffer(result.stdout);
}

function sha256File(path: string): string {
  return sha256Buffer(readFileSync(path));
}

function sha256Buffer(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function normalizeSha256(value: string): string {
  return value.replace(/^sha256:/u, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
