import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join, normalize, relative } from "node:path";

export type SourceManifestVerificationStatus = "passed" | "failed";

export interface SourceManifestVerificationConfig {
  readonly logicalRoots: Record<string, string>;
  readonly sources: readonly SourceManifestExpectation[];
  readonly cannotClaim?: readonly string[];
  readonly finalPostureRecommendation?: string;
}

export interface SourceManifestExpectation {
  readonly sourceId: string;
  readonly rootRef: string;
  readonly sourceType: string;
  readonly writePermission?: string;
  readonly mutationAllowed?: boolean;
  readonly expectedFingerprintSha256?: string;
  readonly files: readonly SourceFileExpectation[];
}

export interface SourceFileExpectation {
  readonly path: string;
  readonly sha256: string;
  readonly required?: boolean;
}

export interface SourceManifestVerificationReport {
  readonly status: SourceManifestVerificationStatus;
  readonly findings: readonly SourceManifestFinding[];
  readonly classified_mismatches: readonly SourceManifestFinding[];
  readonly verified_refs: readonly VerifiedSourceRef[];
  readonly hash_failures: readonly SourceManifestFinding[];
  readonly source_fingerprints: readonly SourceFingerprint[];
  readonly cannot_claim: readonly string[];
  readonly final_posture_recommendation: string | null;
}

export interface SourceFingerprint {
  readonly sourceId: string;
  readonly sha256: string;
  readonly fileCount: number;
}

export interface VerifiedSourceRef {
  readonly ref: string;
  readonly path: string;
  readonly sha256: string;
  readonly sourceId: string;
}

export interface SourceManifestFinding {
  readonly kind: string;
  readonly sourceId?: string;
  readonly ref?: string;
  readonly path?: string;
  readonly expected?: string;
  readonly actual?: string;
  readonly detail?: string;
}

const SHA256_PATTERN = /^(?:sha256:)?[a-f0-9]{64}$/u;
const PLACEHOLDER_PATTERN = /pending|placeholder|todo|TBD|FIXME/u;

export function verifySourceManifestConfig(
  config: SourceManifestVerificationConfig
): SourceManifestVerificationReport {
  const findings: SourceManifestFinding[] = [];
  const verifiedRefs: VerifiedSourceRef[] = [];
  const sourceFingerprints: SourceFingerprint[] = [];

  for (const source of config.sources) {
    const root = resolveLogicalRef(source.rootRef, config.logicalRoots, findings, source.sourceId);
    if (!root) continue;
    if (!existsSync(root)) {
      findings.push({
        kind: "missing_source_root",
        sourceId: source.sourceId,
        ref: source.rootRef,
        path: root
      });
      continue;
    }
    if (!statSync(root).isDirectory()) {
      findings.push({
        kind: "source_root_not_directory",
        sourceId: source.sourceId,
        ref: source.rootRef,
        path: root
      });
      continue;
    }

    verifyReadOnlyIntent(source, findings);
    const verifiedForSource = verifyFiles(source, root, findings, verifiedRefs);
    const fingerprint = fingerprintSource(source.sourceId, verifiedForSource);
    sourceFingerprints.push(fingerprint);
    verifySourceFingerprint(source, fingerprint, findings);
  }

  const hashFailures = findings.filter((finding) =>
    finding.kind.includes("hash") ||
    finding.kind.includes("fingerprint") ||
    finding.kind.includes("placeholder") ||
    finding.kind.includes("sha")
  );

  return {
    status: findings.length === 0 ? "passed" : "failed",
    findings,
    classified_mismatches: [],
    verified_refs: verifiedRefs,
    hash_failures: hashFailures,
    source_fingerprints: sourceFingerprints,
    cannot_claim: [...(config.cannotClaim ?? [])],
    final_posture_recommendation: config.finalPostureRecommendation ?? null
  };
}

export function fingerprintSource(
  sourceId: string,
  files: readonly VerifiedSourceRef[]
): SourceFingerprint {
  const canonical = files
    .filter((file) => file.sourceId === sourceId)
    .map((file) => ({
      path: normalizeRelativePath(file.ref.replace(/^source-file:\/\/[^/]+\//u, "")),
      sha256: file.sha256
    }))
    .sort((left, right) => left.path.localeCompare(right.path));
  const payload = JSON.stringify(canonical);
  return {
    sourceId,
    sha256: createHash("sha256").update(payload).digest("hex"),
    fileCount: canonical.length
  };
}

function verifyReadOnlyIntent(
  source: SourceManifestExpectation,
  findings: SourceManifestFinding[]
): void {
  if (source.sourceType !== "READ_ONLY_DIGEST") return;
  if (source.writePermission !== "forbidden") {
    findings.push({
      kind: "write_permission_expected_for_read_only_source",
      sourceId: source.sourceId,
      expected: "forbidden",
      actual: source.writePermission ?? "missing"
    });
  }
  if (source.mutationAllowed !== false) {
    findings.push({
      kind: "mutation_expected_forbidden_for_read_only_source",
      sourceId: source.sourceId,
      expected: "false",
      actual: String(source.mutationAllowed)
    });
  }
}

function verifyFiles(
  source: SourceManifestExpectation,
  root: string,
  findings: SourceManifestFinding[],
  verifiedRefs: VerifiedSourceRef[]
): VerifiedSourceRef[] {
  const verifiedForSource: VerifiedSourceRef[] = [];
  for (const file of source.files) {
    const expectedHashFinding = validateExpectedHash(source.sourceId, file.path, file.sha256);
    if (expectedHashFinding) {
      findings.push(expectedHashFinding);
      continue;
    }
    if (!isRelativeSourcePath(file.path)) {
      findings.push({
        kind: "source_entry_escapes_root",
        sourceId: source.sourceId,
        path: file.path
      });
      continue;
    }

    const path = join(root, file.path);
    const relativePath = relative(root, path);
    if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
      findings.push({
        kind: "source_entry_escapes_root",
        sourceId: source.sourceId,
        path: file.path
      });
      continue;
    }

    if (!existsSync(path)) {
      if (file.required !== false) {
        findings.push({
          kind: "missing_source_file",
          sourceId: source.sourceId,
          path: file.path
        });
      }
      continue;
    }
    if (!statSync(path).isFile()) {
      findings.push({
        kind: "source_entry_not_file",
        sourceId: source.sourceId,
        path: file.path
      });
      continue;
    }

    const actual = sha256File(path);
    const expected = normalizeSha256(file.sha256);
    if (actual !== expected) {
      findings.push({
        kind: "source_file_hash_mismatch",
        sourceId: source.sourceId,
        path: file.path,
        expected,
        actual
      });
      continue;
    }

    const verified = {
      ref: `source-file://${source.sourceId}/${normalizeRelativePath(file.path)}`,
      path,
      sha256: actual,
      sourceId: source.sourceId
    };
    verifiedRefs.push(verified);
    verifiedForSource.push(verified);
  }
  return verifiedForSource;
}

function verifySourceFingerprint(
  source: SourceManifestExpectation,
  fingerprint: SourceFingerprint,
  findings: SourceManifestFinding[]
): void {
  if (!source.expectedFingerprintSha256) return;
  const hashFinding = validateExpectedHash(
    source.sourceId,
    "expectedFingerprintSha256",
    source.expectedFingerprintSha256
  );
  if (hashFinding) {
    findings.push({
      ...hashFinding,
      kind: hashFinding.kind === "placeholder_hash"
        ? "placeholder_fingerprint_hash"
        : hashFinding.kind
    });
    return;
  }
  const expected = normalizeSha256(source.expectedFingerprintSha256);
  if (fingerprint.sha256 !== expected) {
    findings.push({
      kind: "source_fingerprint_mismatch",
      sourceId: source.sourceId,
      expected,
      actual: fingerprint.sha256
    });
  }
}

function validateExpectedHash(
  sourceId: string,
  path: string,
  expectedSha256: string
): SourceManifestFinding | null {
  if (PLACEHOLDER_PATTERN.test(expectedSha256)) {
    return {
      kind: "placeholder_hash",
      sourceId,
      path,
      actual: expectedSha256
    };
  }
  if (!SHA256_PATTERN.test(expectedSha256)) {
    return {
      kind: "invalid_sha256",
      sourceId,
      path,
      actual: expectedSha256
    };
  }
  return null;
}

function resolveLogicalRef(
  ref: string,
  roots: Record<string, string>,
  findings: SourceManifestFinding[],
  sourceId: string
): string | null {
  const match = /^([a-z][a-z0-9+.-]*):\/\/(.*)$/iu.exec(ref);
  if (!match) {
    findings.push({ kind: "malformed_logical_ref", sourceId, ref });
    return null;
  }
  const scheme = match[1]?.toLowerCase();
  const body = match[2];
  if (!scheme || body === undefined) {
    findings.push({ kind: "malformed_logical_ref", sourceId, ref });
    return null;
  }
  const root = roots[scheme];
  if (!root) {
    findings.push({ kind: "unknown_logical_root", sourceId, ref });
    return null;
  }
  const normalizedBody = normalize(body);
  if (normalizedBody.startsWith("..") || isAbsolute(normalizedBody)) {
    findings.push({ kind: "logical_ref_escapes_root", sourceId, ref });
    return null;
  }
  const path = join(root, normalizedBody);
  const relativePath = relative(root, path);
  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    findings.push({ kind: "logical_ref_escapes_root", sourceId, ref });
    return null;
  }
  return path;
}

function isRelativeSourcePath(path: string): boolean {
  const normalized = normalize(path);
  return path.length > 0 &&
    !isAbsolute(path) &&
    !normalized.startsWith("..") &&
    normalized !== ".";
}

function normalizeRelativePath(path: string): string {
  return normalize(path).replaceAll("\\", "/");
}

function normalizeSha256(value: string): string {
  return value.startsWith("sha256:") ? value.slice("sha256:".length) : value;
}

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}
