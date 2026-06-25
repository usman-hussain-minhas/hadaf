import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import {
  verifyH03InputAuthorityConfig,
  type H03InputAuthorityConfig,
  type H03VerifiedInput
} from "./input-authority.js";

export type H03PlanNormalizationStatus = "passed" | "failed";

export type H03PlanSectionId =
  | "objective"
  | "outcomes"
  | "scope"
  | "non_scope"
  | "constraints"
  | "public_commitments"
  | "internal_invariants"
  | "candidate_boxes"
  | "human_gates"
  | "cannot_claim";

export interface H03PlanNormalizationConfig {
  readonly inputAuthority: H03InputAuthorityConfig;
  readonly planSourceInputIds: readonly string[];
  readonly expectedSourceAuthoritySetHash: string;
  readonly requiredSections?: readonly H03PlanSectionId[];
  readonly expectedNormalizedPlanHash?: string;
  readonly cannotClaim?: readonly string[];
  readonly finalPostureRecommendation?: string;
}

export interface H03PlanNormalizationReport {
  readonly status: H03PlanNormalizationStatus;
  readonly findings: readonly H03PlanNormalizationFinding[];
  readonly classified_mismatches: readonly H03PlanNormalizationFinding[];
  readonly source_authority_set_hash: string | null;
  readonly normalized_plan_hash: string | null;
  readonly normalized_plan: H03NormalizedPlan | null;
  readonly cannot_claim: readonly string[];
  readonly final_posture_recommendation: string | null;
}

export interface H03NormalizedPlan {
  readonly source_authority_set_hash: string;
  readonly sources: readonly H03NormalizedPlanSource[];
  readonly sections: readonly H03NormalizedPlanSection[];
}

export interface H03NormalizedPlanSource {
  readonly inputId: string;
  readonly ref: string;
  readonly sha256: string;
}

export interface H03NormalizedPlanSection {
  readonly section_id: H03PlanSectionId;
  readonly title: string;
  readonly items: readonly string[];
  readonly source_input_id: string;
  readonly source_ref: string;
  readonly source_sha256: string;
}

export interface H03PlanNormalizationFinding {
  readonly kind: string;
  readonly inputId?: string;
  readonly sectionId?: string;
  readonly expected?: string;
  readonly actual?: string;
  readonly detail?: string;
}

const REQUIRED_SECTIONS: readonly H03PlanSectionId[] = [
  "objective",
  "outcomes",
  "scope",
  "non_scope",
  "constraints",
  "public_commitments",
  "internal_invariants",
  "candidate_boxes",
  "human_gates",
  "cannot_claim"
];

const SECTION_TITLES: Record<H03PlanSectionId, string> = {
  objective: "Objective",
  outcomes: "Outcomes",
  scope: "Scope",
  non_scope: "Non-Scope",
  constraints: "Constraints",
  public_commitments: "Public Commitments",
  internal_invariants: "Internal Invariants",
  candidate_boxes: "Candidate Boxes",
  human_gates: "Human Gates",
  cannot_claim: "Cannot Claim"
};

const SECTION_ALIASES = new Map<string, H03PlanSectionId>([
  ["objective", "objective"],
  ["outcomes", "outcomes"],
  ["business/user outcomes", "outcomes"],
  ["business and user outcomes", "outcomes"],
  ["scope", "scope"],
  ["non-scope", "non_scope"],
  ["non scope", "non_scope"],
  ["constraints", "constraints"],
  ["public commitments", "public_commitments"],
  ["internal invariants", "internal_invariants"],
  ["candidate boxes", "candidate_boxes"],
  ["boxes", "candidate_boxes"],
  ["human gates", "human_gates"],
  ["cannot_claim", "cannot_claim"],
  ["cannot claim", "cannot_claim"]
]);

const SHA256_PATTERN = /^(?:sha256:)?[a-f0-9]{64}$/u;
const PLACEHOLDER_PATTERN = /pending|placeholder|todo|TBD|FIXME/u;
const PRIVATE_PATH_PATTERN = /(?:^|["'\s])(?:\/Users\/|\/Volumes\/|file:\/\/)/u;

export function normalizeH03PlanConfig(
  config: H03PlanNormalizationConfig
): H03PlanNormalizationReport {
  const findings: H03PlanNormalizationFinding[] = [];
  const authorityReport = verifyH03InputAuthorityConfig(config.inputAuthority);
  if (authorityReport.status !== "passed") {
    findings.push({
      kind: "input_authority_verification_failed",
      detail: authorityReport.findings.map((finding) => finding.kind).join(",")
    });
  }

  const sourceAuthoritySetHash = authorityReport.source_authority_set_hash;
  verifyExpectedHash(
    "expectedSourceAuthoritySetHash",
    config.expectedSourceAuthoritySetHash,
    findings
  );
  if (sourceAuthoritySetHash && sourceAuthoritySetHash !== normalizeSha256(config.expectedSourceAuthoritySetHash)) {
    findings.push({
      kind: "source_authority_set_hash_mismatch",
      expected: normalizeSha256(config.expectedSourceAuthoritySetHash),
      actual: sourceAuthoritySetHash
    });
  }

  const authorityInputIds = new Set(authorityReport.authority_manifest.map((entry) => entry.inputId));
  const verifiedInputsById = new Map(authorityReport.verified_inputs.map((input) => [
    input.inputId,
    input
  ]));
  const sources = verifyPlanSources(config, authorityInputIds, verifiedInputsById, findings);
  const sections = sources.flatMap((source) => parseSourceSections(source, findings));
  verifyRequiredSections(config.requiredSections ?? REQUIRED_SECTIONS, sections, findings);

  const normalizedPlan = findings.length === 0 && sourceAuthoritySetHash
    ? buildNormalizedPlan(sourceAuthoritySetHash, sources, sections)
    : null;
  const normalizedPlanHash = normalizedPlan ? hashNormalizedPlan(normalizedPlan) : null;
  verifyExpectedNormalizedPlanHash(config, normalizedPlanHash, findings);

  return {
    status: findings.length === 0 ? "passed" : "failed",
    findings,
    classified_mismatches: findings.filter((finding) =>
      finding.kind.endsWith("_mismatch")
    ),
    source_authority_set_hash: sourceAuthoritySetHash,
    normalized_plan_hash: normalizedPlanHash,
    normalized_plan: normalizedPlan,
    cannot_claim: [...(config.cannotClaim ?? [])],
    final_posture_recommendation: config.finalPostureRecommendation ?? null
  };
}

export function hashNormalizedPlan(plan: H03NormalizedPlan): string {
  return sha256Text(JSON.stringify(plan));
}

function verifyPlanSources(
  config: H03PlanNormalizationConfig,
  authorityInputIds: ReadonlySet<string>,
  verifiedInputsById: ReadonlyMap<string, H03VerifiedInput>,
  findings: H03PlanNormalizationFinding[]
): H03VerifiedInput[] {
  const seen = new Set<string>();
  const sources: H03VerifiedInput[] = [];
  for (const inputId of config.planSourceInputIds) {
    if (seen.has(inputId)) {
      findings.push({ kind: "duplicate_plan_source", inputId });
      continue;
    }
    seen.add(inputId);

    if (!authorityInputIds.has(inputId)) {
      findings.push({ kind: "plan_source_not_authority_verified", inputId });
      continue;
    }
    const input = verifiedInputsById.get(inputId);
    if (!input) {
      findings.push({ kind: "plan_source_missing_verified_input", inputId });
      continue;
    }
    if (input.signals.length > 0) {
      findings.push({
        kind: "plan_source_prompt_injection_candidate",
        inputId,
        detail: input.signals.join(",")
      });
      continue;
    }
    sources.push(input);
  }
  return sources;
}

function parseSourceSections(
  source: H03VerifiedInput,
  findings: H03PlanNormalizationFinding[]
): H03NormalizedPlanSection[] {
  const text = readFileSync(source.path, "utf8");
  if (PRIVATE_PATH_PATTERN.test(text)) {
    findings.push({ kind: "private_path_in_plan_source", inputId: source.inputId });
    return [];
  }

  const sections: H03NormalizedPlanSection[] = [];
  let current: {
    readonly sectionId: H03PlanSectionId;
    readonly title: string;
    readonly items: string[];
  } | null = null;
  const seenSections = new Set<H03PlanSectionId>();

  for (const rawLine of text.split(/\r?\n/u)) {
    const heading = /^#{1,6}\s+(?<title>.+?)\s*$/u.exec(rawLine);
    if (heading?.groups?.title) {
      if (current) sections.push(finalizeSection(current, source, findings));
      const sectionId = sectionIdForTitle(heading.groups.title);
      if (!sectionId) {
        findings.push({
          kind: "unsupported_plan_section",
          inputId: source.inputId,
          sectionId: heading.groups.title
        });
        current = null;
        continue;
      }
      if (seenSections.has(sectionId)) {
        findings.push({
          kind: "duplicate_plan_section",
          inputId: source.inputId,
          sectionId
        });
        current = null;
        continue;
      }
      seenSections.add(sectionId);
      current = {
        sectionId,
        title: SECTION_TITLES[sectionId],
        items: []
      };
      continue;
    }

    if (!current) {
      if (rawLine.trim().length > 0) {
        findings.push({
          kind: "plan_text_outside_section",
          inputId: source.inputId,
          detail: rawLine.trim()
        });
      }
      continue;
    }

    const normalizedLine = normalizeItem(rawLine);
    if (normalizedLine) current.items.push(normalizedLine);
  }

  if (current) sections.push(finalizeSection(current, source, findings));
  return sections.filter((section) => section.items.length > 0);
}

function finalizeSection(
  current: {
    readonly sectionId: H03PlanSectionId;
    readonly title: string;
    readonly items: readonly string[];
  },
  source: H03VerifiedInput,
  findings: H03PlanNormalizationFinding[]
): H03NormalizedPlanSection {
  const items = [...new Set(current.items.map(normalizeWhitespace).filter(Boolean))].sort();
  if (items.length === 0) {
    findings.push({
      kind: "empty_plan_section",
      inputId: source.inputId,
      sectionId: current.sectionId
    });
  }
  return {
    section_id: current.sectionId,
    title: current.title,
    items,
    source_input_id: source.inputId,
    source_ref: source.ref,
    source_sha256: source.sha256
  };
}

function verifyRequiredSections(
  requiredSections: readonly H03PlanSectionId[],
  sections: readonly H03NormalizedPlanSection[],
  findings: H03PlanNormalizationFinding[]
): void {
  const present = new Set<H03PlanSectionId>();
  for (const section of sections) {
    if (present.has(section.section_id)) {
      findings.push({
        kind: "duplicate_plan_section_across_sources",
        sectionId: section.section_id
      });
    }
    present.add(section.section_id);
  }
  for (const sectionId of requiredSections) {
    if (!present.has(sectionId)) {
      findings.push({ kind: "missing_required_plan_section", sectionId });
    }
  }
}

function buildNormalizedPlan(
  sourceAuthoritySetHash: string,
  sources: readonly H03VerifiedInput[],
  sections: readonly H03NormalizedPlanSection[]
): H03NormalizedPlan {
  return {
    source_authority_set_hash: sourceAuthoritySetHash,
    sources: sources
      .map((source) => ({
        inputId: source.inputId,
        ref: source.ref,
        sha256: source.sha256
      }))
      .sort((left, right) => left.inputId.localeCompare(right.inputId)),
    sections: [...sections].sort((left, right) =>
      sectionOrder(left.section_id) - sectionOrder(right.section_id)
    )
  };
}

function verifyExpectedNormalizedPlanHash(
  config: H03PlanNormalizationConfig,
  normalizedPlanHash: string | null,
  findings: H03PlanNormalizationFinding[]
): void {
  if (!config.expectedNormalizedPlanHash) return;
  verifyExpectedHash("expectedNormalizedPlanHash", config.expectedNormalizedPlanHash, findings);
  if (!normalizedPlanHash) return;
  const expected = normalizeSha256(config.expectedNormalizedPlanHash);
  if (normalizedPlanHash !== expected) {
    findings.push({
      kind: "normalized_plan_hash_mismatch",
      expected,
      actual: normalizedPlanHash
    });
  }
}

function sectionIdForTitle(title: string): H03PlanSectionId | null {
  const key = normalizeWhitespace(title)
    .replace(/[_-]+/gu, " ")
    .toLowerCase();
  return SECTION_ALIASES.get(key) ?? null;
}

function sectionOrder(sectionId: H03PlanSectionId): number {
  return REQUIRED_SECTIONS.indexOf(sectionId);
}

function normalizeItem(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  return normalizeWhitespace(trimmed.replace(/^(?:[-*]|\d+[.)])\s+/u, ""));
}

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/gu, " ");
}

function verifyExpectedHash(
  field: string,
  hash: string,
  findings: H03PlanNormalizationFinding[]
): void {
  if (PLACEHOLDER_PATTERN.test(hash)) {
    findings.push({ kind: "placeholder_hash", detail: field, expected: hash });
    return;
  }
  if (!SHA256_PATTERN.test(hash)) {
    findings.push({ kind: "invalid_sha256", detail: field, expected: hash });
  }
}

function normalizeSha256(value: string): string {
  return value.replace(/^sha256:/u, "");
}

function sha256Text(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}
