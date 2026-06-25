import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join, normalize, relative } from "node:path";

import {
  classifySourceDocument,
  type SourceAuthorityClassification,
  type SourceDocumentKind
} from "../source-vault/classifier.js";

export type H03InputAuthorityStatus = "passed" | "failed";

export type H03AcceptedInputForm =
  | "plain_language_plan"
  | "founder_notes"
  | "prd"
  | "client_brief"
  | "roadmap"
  | "architecture_document"
  | "github_issue"
  | "jira_export"
  | "linear_export"
  | "bug_list"
  | "design_brief"
  | "screen_brief"
  | "security_requirement"
  | "compliance_requirement"
  | "existing_repository"
  | "source_archive"
  | "migration_objective"
  | "refactor_objective";

export type H03SourceMode =
  | "READ_ONLY_DIGEST"
  | "MIGRATION_PLAN_ONLY"
  | "SHADOW_REFACTOR_LOCAL"
  | "SHADOW_REFACTOR_REMOTE"
  | "CLEAN_REBUILD"
  | "ADOPTION_BACK_INTO_SOURCE";

export interface H03InputAuthorityConfig {
  readonly logicalRoots: Record<string, string>;
  readonly sourceMode: H03SourceMode;
  readonly inputs: readonly H03AcceptedInput[];
  readonly authorityManifest: readonly H03AuthorityManifestEntry[];
  readonly expectedSourceAuthoritySetHash?: string;
  readonly cannotClaim?: readonly string[];
  readonly finalPostureRecommendation?: string;
}

export interface H03AcceptedInput {
  readonly inputId: string;
  readonly form: H03AcceptedInputForm;
  readonly ref: string;
  readonly sha256: string;
  readonly documentKind: SourceDocumentKind;
  readonly expectedClassification?: SourceAuthorityClassification;
  readonly required?: boolean;
}

export interface H03AuthorityManifestEntry {
  readonly rank: number;
  readonly inputId: string;
  readonly authority: string;
}

export interface H03InputAuthorityReport {
  readonly status: H03InputAuthorityStatus;
  readonly findings: readonly H03InputAuthorityFinding[];
  readonly classified_mismatches: readonly H03InputAuthorityFinding[];
  readonly verified_inputs: readonly H03VerifiedInput[];
  readonly authority_manifest: readonly H03VerifiedAuthorityManifestEntry[];
  readonly source_authority_set_hash: string | null;
  readonly cannot_claim: readonly string[];
  readonly final_posture_recommendation: string | null;
}

export interface H03VerifiedInput {
  readonly inputId: string;
  readonly form: H03AcceptedInputForm;
  readonly ref: string;
  readonly path: string;
  readonly sha256: string;
  readonly documentKind: SourceDocumentKind;
  readonly classification: SourceAuthorityClassification;
  readonly signals: readonly string[];
}

export interface H03VerifiedAuthorityManifestEntry {
  readonly rank: number;
  readonly inputId: string;
  readonly path_or_uri: string;
  readonly sha256: string;
  readonly authority: string;
  readonly classification: SourceAuthorityClassification;
}

export interface H03InputAuthorityFinding {
  readonly kind: string;
  readonly inputId?: string;
  readonly ref?: string;
  readonly path?: string;
  readonly rank?: number;
  readonly expected?: string;
  readonly actual?: string;
  readonly detail?: string;
}

const ACCEPTED_INPUT_FORMS = new Set<string>([
  "plain_language_plan",
  "founder_notes",
  "prd",
  "client_brief",
  "roadmap",
  "architecture_document",
  "github_issue",
  "jira_export",
  "linear_export",
  "bug_list",
  "design_brief",
  "screen_brief",
  "security_requirement",
  "compliance_requirement",
  "existing_repository",
  "source_archive",
  "migration_objective",
  "refactor_objective"
]);

const SUPPORTED_SOURCE_MODES = new Set<string>([
  "READ_ONLY_DIGEST",
  "MIGRATION_PLAN_ONLY",
  "SHADOW_REFACTOR_LOCAL",
  "SHADOW_REFACTOR_REMOTE",
  "CLEAN_REBUILD",
  "ADOPTION_BACK_INTO_SOURCE"
]);

const AUTHORITY_CLASSIFICATIONS = new Set<SourceAuthorityClassification>([
  "ratified_human_authority",
  "canonical_planning_source",
  "accepted_control_authority"
]);

const SHA256_PATTERN = /^(?:sha256:)?[a-f0-9]{64}$/u;
const PLACEHOLDER_PATTERN = /pending|placeholder|todo|TBD|FIXME/u;
const PRIVATE_PATH_PATTERN = /(?:^|["'\s])(?:\/Users\/|\/Volumes\/|file:\/\/)/u;

export function verifyH03InputAuthorityConfig(
  config: H03InputAuthorityConfig
): H03InputAuthorityReport {
  const findings: H03InputAuthorityFinding[] = [];
  const verifiedInputs = verifyInputs(config, findings);
  const authorityManifest = verifyAuthorityManifest(config, verifiedInputs, findings);
  const sourceAuthoritySetHash = findings.some((finding) => finding.kind.startsWith("authority_"))
    ? null
    : computeSourceAuthoritySetHash(authorityManifest);

  verifyExpectedAuthoritySetHash(config, sourceAuthoritySetHash, findings);

  return {
    status: findings.length === 0 ? "passed" : "failed",
    findings,
    classified_mismatches: findings.filter((finding) =>
      finding.kind === "classification_mismatch"
    ),
    verified_inputs: verifiedInputs,
    authority_manifest: authorityManifest,
    source_authority_set_hash: sourceAuthoritySetHash,
    cannot_claim: [...(config.cannotClaim ?? [])],
    final_posture_recommendation: config.finalPostureRecommendation ?? null
  };
}

export function computeSourceAuthoritySetHash(
  entries: readonly H03VerifiedAuthorityManifestEntry[]
): string {
  const normalized = [...entries]
    .sort((left, right) => left.rank - right.rank)
    .map((entry) => ({
      rank: entry.rank,
      path_or_uri: entry.path_or_uri,
      sha256: entry.sha256,
      authority: entry.authority,
      classification: entry.classification
    }));
  return sha256Text(JSON.stringify(normalized));
}

function verifyInputs(
  config: H03InputAuthorityConfig,
  findings: H03InputAuthorityFinding[]
): H03VerifiedInput[] {
  if (!SUPPORTED_SOURCE_MODES.has(config.sourceMode)) {
    findings.push({
      kind: "unsupported_source_mode",
      expected: [...SUPPORTED_SOURCE_MODES].join(","),
      actual: config.sourceMode
    });
  }

  const verifiedInputs: H03VerifiedInput[] = [];
  const inputIds = new Set<string>();
  for (const input of config.inputs) {
    if (inputIds.has(input.inputId)) {
      findings.push({ kind: "duplicate_input_id", inputId: input.inputId });
      continue;
    }
    inputIds.add(input.inputId);

    if (!ACCEPTED_INPUT_FORMS.has(input.form)) {
      findings.push({
        kind: "unsupported_input_form",
        inputId: input.inputId,
        expected: [...ACCEPTED_INPUT_FORMS].join(","),
        actual: input.form
      });
      continue;
    }

    const hashFinding = validateExpectedHash(input.ref, input.sha256);
    if (hashFinding) {
      findings.push({ ...hashFinding, inputId: input.inputId, ref: input.ref });
      continue;
    }

    const resolved = resolveLogicalRef(input.ref, config.logicalRoots, findings);
    if (!resolved) {
      findings.push({
        kind: "unresolved_input_ref",
        inputId: input.inputId,
        ref: input.ref
      });
      continue;
    }
    if (!existsSync(resolved)) {
      if (input.required !== false) {
        findings.push({
          kind: "missing_input_ref",
          inputId: input.inputId,
          ref: input.ref,
          path: resolved
        });
      }
      continue;
    }
    if (!statSync(resolved).isFile()) {
      findings.push({
        kind: "input_ref_not_file",
        inputId: input.inputId,
        ref: input.ref,
        path: resolved
      });
      continue;
    }

    const text = readFileSync(resolved, "utf8");
    if (PRIVATE_PATH_PATTERN.test(text)) {
      findings.push({
        kind: "private_path_in_input",
        inputId: input.inputId,
        ref: input.ref,
        path: resolved
      });
      continue;
    }

    const actualHash = sha256Text(text);
    const expectedHash = normalizeSha256(input.sha256);
    if (actualHash !== expectedHash) {
      findings.push({
        kind: "input_hash_mismatch",
        inputId: input.inputId,
        ref: input.ref,
        path: resolved,
        expected: expectedHash,
        actual: actualHash
      });
      continue;
    }

    const classified = classifySourceDocument({
      documentId: input.inputId,
      kind: input.documentKind,
      text,
      authorityManifestListed: config.authorityManifest.some((entry) =>
        entry.inputId === input.inputId
      )
    });
    if (input.expectedClassification && input.expectedClassification !== classified.classification) {
      findings.push({
        kind: "classification_mismatch",
        inputId: input.inputId,
        expected: input.expectedClassification,
        actual: classified.classification
      });
    }

    verifiedInputs.push({
      inputId: input.inputId,
      form: input.form,
      ref: input.ref,
      path: resolved,
      sha256: actualHash,
      documentKind: input.documentKind,
      classification: classified.classification,
      signals: classified.signals
    });
  }

  return verifiedInputs;
}

function verifyAuthorityManifest(
  config: H03InputAuthorityConfig,
  verifiedInputs: readonly H03VerifiedInput[],
  findings: H03InputAuthorityFinding[]
): H03VerifiedAuthorityManifestEntry[] {
  const byInputId = new Map(verifiedInputs.map((input) => [input.inputId, input]));
  const ranks = new Set<number>();
  const authorityManifest: H03VerifiedAuthorityManifestEntry[] = [];

  for (const entry of config.authorityManifest) {
    if (!Number.isInteger(entry.rank) || entry.rank < 1) {
      findings.push({
        kind: "authority_rank_invalid",
        inputId: entry.inputId,
        rank: entry.rank
      });
      continue;
    }
    if (ranks.has(entry.rank)) {
      findings.push({
        kind: "duplicate_authority_rank",
        inputId: entry.inputId,
        rank: entry.rank
      });
      continue;
    }
    ranks.add(entry.rank);

    const input = byInputId.get(entry.inputId);
    if (!input) {
      findings.push({
        kind: "authority_input_missing_or_unverified",
        inputId: entry.inputId,
        rank: entry.rank
      });
      continue;
    }
    if (input.documentKind === "untrusted_input") {
      findings.push({
        kind: "authority_overclaim_from_untrusted_input",
        inputId: entry.inputId,
        rank: entry.rank,
        actual: input.classification
      });
      continue;
    }
    if (!AUTHORITY_CLASSIFICATIONS.has(input.classification)) {
      findings.push({
        kind: authorityOverclaimKind(input.classification),
        inputId: entry.inputId,
        rank: entry.rank,
        actual: input.classification
      });
      continue;
    }
    if (input.signals.length > 0) {
      findings.push({
        kind: "authority_prompt_injection_candidate",
        inputId: entry.inputId,
        rank: entry.rank,
        detail: input.signals.join(",")
      });
      continue;
    }

    authorityManifest.push({
      rank: entry.rank,
      inputId: entry.inputId,
      path_or_uri: input.ref,
      sha256: input.sha256,
      authority: entry.authority,
      classification: input.classification
    });
  }

  return authorityManifest.sort((left, right) => left.rank - right.rank);
}

function authorityOverclaimKind(classification: SourceAuthorityClassification): string {
  if (classification === "generated_view") return "authority_overclaim_from_generated_view";
  if (classification === "untrusted_input") return "authority_overclaim_from_untrusted_input";
  if (classification === "prompt_injection_candidate") return "authority_prompt_injection_candidate";
  return "authority_overclaim_from_source_data";
}

function verifyExpectedAuthoritySetHash(
  config: H03InputAuthorityConfig,
  actualHash: string | null,
  findings: H03InputAuthorityFinding[]
): void {
  if (!config.expectedSourceAuthoritySetHash) return;
  const hashFinding = validateExpectedHash(
    "expectedSourceAuthoritySetHash",
    config.expectedSourceAuthoritySetHash
  );
  if (hashFinding) {
    findings.push({ ...hashFinding, kind: `authority_set_${hashFinding.kind}` });
    return;
  }
  if (!actualHash) return;
  const expected = normalizeSha256(config.expectedSourceAuthoritySetHash);
  if (actualHash !== expected) {
    findings.push({
      kind: "authority_set_hash_mismatch",
      expected,
      actual: actualHash
    });
  }
}

function validateExpectedHash(
  ref: string,
  expectedHash: string
): H03InputAuthorityFinding | null {
  if (PLACEHOLDER_PATTERN.test(expectedHash)) {
    return { kind: "placeholder_hash", ref, expected: expectedHash };
  }
  if (!SHA256_PATTERN.test(expectedHash)) {
    return { kind: "invalid_sha256", ref, expected: expectedHash };
  }
  return null;
}

function resolveLogicalRef(
  ref: string,
  roots: Record<string, string>,
  findings: H03InputAuthorityFinding[]
): string | null {
  if (isAbsolute(ref) || ref.startsWith("file://")) {
    findings.push({ kind: "absolute_or_file_ref_forbidden", ref });
    return null;
  }

  const match = /^(?<scheme>[a-z][a-z0-9+.-]*):\/\/(?<path>.+)$/iu.exec(ref);
  if (!match?.groups) {
    findings.push({ kind: "unsupported_ref_format", ref });
    return null;
  }

  const scheme = match.groups.scheme;
  const logicalRefPath = match.groups.path;
  if (!scheme || !logicalRefPath) {
    findings.push({ kind: "unsupported_ref_format", ref });
    return null;
  }

  const root = roots[scheme];
  if (!root) {
    findings.push({ kind: "unknown_logical_root", ref });
    return null;
  }

  const logicalPath = normalize(logicalRefPath);
  if (logicalPath.startsWith("..") || isAbsolute(logicalPath)) {
    findings.push({ kind: "logical_path_escape", ref });
    return null;
  }

  const resolved = join(root, logicalPath);
  const relativePath = relative(root, resolved);
  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    findings.push({ kind: "logical_path_escape", ref, path: resolved });
    return null;
  }
  return resolved;
}

function normalizeSha256(value: string): string {
  return value.replace(/^sha256:/u, "");
}

function sha256Text(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}
