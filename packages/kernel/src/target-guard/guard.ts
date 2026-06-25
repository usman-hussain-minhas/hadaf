import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";

export type TargetGuardStatus = "passed" | "failed";

export interface TargetGuardConfig {
  readonly root: string;
  readonly profile?: "hadaf_dogfood" | "external_target";
  readonly ignoredDirectories?: readonly string[];
  readonly cannotClaim?: readonly string[];
  readonly finalPostureRecommendation?: string;
}

export interface TargetGuardReport {
  readonly status: TargetGuardStatus;
  readonly findings: readonly TargetGuardFinding[];
  readonly scanned_files: readonly string[];
  readonly cannot_claim: readonly string[];
  readonly final_posture_recommendation: string | null;
}

export interface TargetGuardFinding {
  readonly kind: string;
  readonly path?: string;
  readonly detail?: string;
  readonly value?: string;
}

const DEFAULT_IGNORED_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  "dist",
  "coverage",
  ".turbo",
  ".vite"
]);
const FORBIDDEN_PLANE_DIRECTORIES = new Set([
  "control",
  "evidence",
  "runtime",
  "releases",
  "release",
  "input"
]);
const TEXT_FILE_PATTERN = /\.(cjs|css|html|js|json|md|mjs|ts|tsx|txt|yaml|yml)$/u;
const PRIVATE_PATH_PATTERNS: readonly RegExp[] = [
  /\/Volumes\/[^\s"'`<>)\]}]+/iu,
  /\/Users\/[^\s"'`<>)\]}]+/iu,
  /file:\/\/\/?(Users|Volumes)\//iu
];
const SECRET_LIKE_PATTERNS: readonly RegExp[] = [
  /gh[pousr]_[A-Za-z0-9_]{20,}/u,
  /github_pat_[A-Za-z0-9_]{20,}/u,
  /sk-[A-Za-z0-9]{20,}/u,
  /AKIA[0-9A-Z]{16}/u,
  /-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/u,
  /(api|auth|access|secret|private)[_-]?(key|token|secret)\s*[:=]\s*["'][^"']{8,}["']/iu
];
const LOGICAL_URI_PATTERN = /\b(control|evidence|release|runtime|input):\/\/[^\s"'`<>)\]}]+/giu;
const ALLOWED_PRODUCT_URI_SEGMENTS = new Set([
  "concept",
  "concepts",
  "example",
  "examples",
  "logical",
  "placeholder",
  "profile",
  "profiles",
  "sample",
  "samples",
  "schema",
  "schemas",
  "type",
  "types",
  "uri",
  "uris"
]);
const PRIVATE_RECORD_NAME_PATTERNS: readonly RegExp[] = [
  /(^|[-_.])github[-_.]?pr[-_.]?truth([-_.]|$)/iu,
  /(^|[-_.])pr[-_.]?truth([-_.]|$)/iu,
  /(^|[-_.])runtime[-_.]?checkpoint([-_.]|$)/iu,
  /(^|[-_.])current[-_.]?state([-_.]|$)/iu,
  /(^|[-_.])evidence[-_.]?manifest([-_.]|$)/iu,
  /(^|[-_.])(control|evidence)[-_.]?config([-_.]|$)/iu,
  /(^|[-_.])verification[-_.]?config([-_.]|$)/iu
];
const PRIVATE_RECORD_CONTENT_PATTERNS: readonly RegExp[] = [
  /"githubPullRequests"\s*:/u,
  /"runtimeCheckpointStatus"\s*:/u,
  /"evidence_manifest_hash"\s*:/u,
  /"schemaVersion"\s*:\s*"hadaf_[^"]*current[^"]*state/iu,
  /"schemaVersion"\s*:\s*"hadaf_[^"]*evidence[^"]*manifest/iu
];

export function runTargetGuard(config: TargetGuardConfig): TargetGuardReport {
  const findings: TargetGuardFinding[] = [];
  const scannedFiles: string[] = [];
  const ignored = new Set([
    ...DEFAULT_IGNORED_DIRECTORIES,
    ...(config.ignoredDirectories ?? [])
  ]);

  walk(config.root, config.root, ignored, findings, scannedFiles);

  return {
    status: findings.length === 0 ? "passed" : "failed",
    findings,
    scanned_files: scannedFiles.sort(),
    cannot_claim: [...(config.cannotClaim ?? [])],
    final_posture_recommendation: config.finalPostureRecommendation ?? null
  };
}

function walk(
  root: string,
  directory: string,
  ignoredDirectories: Set<string>,
  findings: TargetGuardFinding[],
  scannedFiles: string[]
): void {
  for (const entry of readdirSync(directory)) {
    if (ignoredDirectories.has(entry)) continue;
    const path = join(directory, entry);
    const relativePath = relative(root, path) || ".";
    const stats = statSync(path);
    if (stats.isDirectory()) {
      if (FORBIDDEN_PLANE_DIRECTORIES.has(entry)) {
        findings.push({
          kind: "forbidden_plane_directory",
          path: relativePath
        });
        continue;
      }
      walk(root, path, ignoredDirectories, findings, scannedFiles);
      continue;
    }
    if (!stats.isFile()) continue;
    if (!TEXT_FILE_PATTERN.test(path)) continue;
    scannedFiles.push(relativePath);
    scanTextFile(relativePath, readFileSync(path, "utf8"), findings);
  }
}

function scanTextFile(
  path: string,
  text: string,
  findings: TargetGuardFinding[]
): void {
  scanPrivateRecordName(path, findings);
  scanPrivateRecordContent(path, text, findings);
  scanPrivatePaths(path, text, findings);
  scanSecrets(path, text, findings);
  scanLogicalUris(path, text, findings);
  scanSourceMutationConfig(path, text, findings);
}

function scanPrivateRecordName(
  path: string,
  findings: TargetGuardFinding[]
): void {
  const name = basename(path);
  if (/^(check|classify|generate|reconcile|verify)-/u.test(name)) return;
  for (const pattern of PRIVATE_RECORD_NAME_PATTERNS) {
    if (pattern.test(name)) {
      findings.push({
        kind: "forbidden_private_record_filename",
        path,
        detail: String(pattern)
      });
    }
  }
}

function scanPrivateRecordContent(
  path: string,
  text: string,
  findings: TargetGuardFinding[]
): void {
  for (const pattern of PRIVATE_RECORD_CONTENT_PATTERNS) {
    if (pattern.test(text)) {
      findings.push({
        kind: "forbidden_private_record_content",
        path,
        detail: String(pattern)
      });
    }
  }
}

function scanPrivatePaths(
  path: string,
  text: string,
  findings: TargetGuardFinding[]
): void {
  for (const pattern of PRIVATE_PATH_PATTERNS) {
    if (pattern.test(text)) {
      findings.push({
        kind: "private_local_path",
        path,
        detail: String(pattern)
      });
    }
  }
}

function scanSecrets(
  path: string,
  text: string,
  findings: TargetGuardFinding[]
): void {
  for (const pattern of SECRET_LIKE_PATTERNS) {
    if (pattern.test(text)) {
      findings.push({
        kind: "secret_like_pattern",
        path,
        detail: String(pattern)
      });
    }
  }
}

function scanLogicalUris(
  path: string,
  text: string,
  findings: TargetGuardFinding[]
): void {
  for (const match of text.matchAll(LOGICAL_URI_PATTERN)) {
    const uri = trimTrailingPunctuation(match[0]);
    const finding = classifyLogicalUri(path, uri);
    if (finding) findings.push(finding);
  }
}

function classifyLogicalUri(
  path: string,
  uri: string
): TargetGuardFinding | null {
  const match = /^([a-z]+):\/\/(.+)$/iu.exec(uri);
  if (!match) {
    return { kind: "malformed_logical_uri", path, value: uri };
  }
  const scheme = match[1]?.toLowerCase();
  const body = match[2] ?? "";
  const firstSegment = body.split(/[/?#]/u, 1)[0]?.toLowerCase() ?? "";
  if (scheme === "input") {
    return {
      kind: "forbidden_input_plane_uri",
      path,
      value: uri
    };
  }
  if (!["control", "evidence", "release", "runtime"].includes(scheme ?? "")) {
    return {
      kind: "unsupported_logical_uri_scheme",
      path,
      value: uri
    };
  }
  if (ALLOWED_PRODUCT_URI_SEGMENTS.has(firstSegment)) return null;
  return {
    kind: "forbidden_instance_residue_uri",
    path,
    value: uri
  };
}

function scanSourceMutationConfig(
  path: string,
  text: string,
  findings: TargetGuardFinding[]
): void {
  if (!/\.(json|yaml|yml)$/u.test(path)) return;
  if (/"mutationAllowed"\s*:\s*true/u.test(text) || /\bmutation_allowed\s*:\s*true/iu.test(text)) {
    findings.push({
      kind: "source_mutation_config_in_product",
      path
    });
  }
}

function trimTrailingPunctuation(value: string): string {
  return value.replace(/[.,;:]+$/u, "");
}
