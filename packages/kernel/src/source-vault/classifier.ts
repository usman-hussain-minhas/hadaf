export type SourceAuthorityClassificationStatus = "passed" | "failed";

export type SourceAuthorityClassification =
  | "ratified_human_authority"
  | "canonical_planning_source"
  | "accepted_control_authority"
  | "generated_view"
  | "source_data"
  | "untrusted_input"
  | "prompt_injection_candidate";

export type SourceDocumentKind =
  | "human_authorization"
  | "canonical_planning_source"
  | "accepted_control_record"
  | "generated_view"
  | "source_data"
  | "readme"
  | "source_comment"
  | "issue"
  | "test_fixture"
  | "package_script"
  | "source_code"
  | "untrusted_input";

export interface SourceAuthorityClassificationConfig {
  readonly documents: readonly SourceDocumentInput[];
  readonly failOnPromptInjectionCandidates?: boolean;
  readonly cannotClaim?: readonly string[];
  readonly finalPostureRecommendation?: string;
}

export interface SourceDocumentInput {
  readonly documentId: string;
  readonly kind: SourceDocumentKind;
  readonly text: string;
  readonly authorityManifestListed?: boolean;
  readonly expectedClassification?: SourceAuthorityClassification;
}

export interface SourceAuthorityClassificationReport {
  readonly status: SourceAuthorityClassificationStatus;
  readonly findings: readonly SourceAuthorityFinding[];
  readonly classified_mismatches: readonly SourceAuthorityFinding[];
  readonly classified_documents: readonly ClassifiedSourceDocument[];
  readonly prompt_injection_candidates: readonly ClassifiedSourceDocument[];
  readonly cannot_claim: readonly string[];
  readonly final_posture_recommendation: string | null;
}

export interface ClassifiedSourceDocument {
  readonly documentId: string;
  readonly kind: SourceDocumentKind;
  readonly classification: SourceAuthorityClassification;
  readonly signals: readonly string[];
  readonly authorityManifestListed: boolean;
}

export interface SourceAuthorityFinding {
  readonly kind: string;
  readonly documentId?: string;
  readonly expected?: string;
  readonly actual?: string;
  readonly detail?: string;
}

interface InjectionPattern {
  readonly signal: string;
  readonly pattern: RegExp;
}

const PROMPT_INJECTION_PATTERNS: readonly InjectionPattern[] = [
  {
    signal: "ignore_prior_instructions",
    pattern: /\bignore\s+(all\s+)?(previous|prior)\s+instructions\b/iu
  },
  {
    signal: "override_hadaf_rules",
    pattern: /\boverride\s+(hadaf|authority|constitution|rules?)\b/iu
  },
  {
    signal: "self_grants_authority",
    pattern: /\b(grant|grants|give|gives)\s+(me|this|itself|source|comment|file)\s+authority\b/iu
  },
  {
    signal: "disable_assurance",
    pattern: /\bdisable\s+(assurance|audit|quality|tests?|security)\b/iu
  },
  {
    signal: "widen_write_access",
    pattern: /\bwiden\s+(write\s+)?access\b/iu
  },
  {
    signal: "change_target",
    pattern: /\bchange\s+(the\s+)?target\b/iu
  },
  {
    signal: "allow_source_mutation",
    pattern: /\bmutation_allowed\s*=\s*true\b/iu
  },
  {
    signal: "source_claims_activation",
    pattern: /\byou\s+are\s+now\s+(authorized|in\s+control|the\s+authority)\b/iu
  },
  {
    signal: "generated_view_claims_canonical_authority",
    pattern: /\b(generated|derived)\s+(summary|report|view)\s+is\s+(canonical|binding|authority)\b/iu
  }
];

export function classifySourceAuthorityConfig(
  config: SourceAuthorityClassificationConfig
): SourceAuthorityClassificationReport {
  const findings: SourceAuthorityFinding[] = [];
  const classifiedDocuments = config.documents.map(classifySourceDocument);
  const promptInjectionCandidates = classifiedDocuments.filter((document) =>
    document.classification === "prompt_injection_candidate"
  );

  for (const document of classifiedDocuments) {
    const expected = config.documents.find((candidate) =>
      candidate.documentId === document.documentId
    )?.expectedClassification;
    if (expected && expected !== document.classification) {
      findings.push({
        kind: "classification_mismatch",
        documentId: document.documentId,
        expected,
        actual: document.classification
      });
    }
  }

  if (config.failOnPromptInjectionCandidates !== false) {
    for (const candidate of promptInjectionCandidates) {
      findings.push({
        kind: "prompt_injection_candidate_detected",
        documentId: candidate.documentId,
        actual: candidate.classification,
        detail: candidate.signals.join(",")
      });
    }
  }

  return {
    status: findings.length === 0 ? "passed" : "failed",
    findings,
    classified_mismatches: findings.filter((finding) =>
      finding.kind === "classification_mismatch"
    ),
    classified_documents: classifiedDocuments,
    prompt_injection_candidates: promptInjectionCandidates,
    cannot_claim: [...(config.cannotClaim ?? [])],
    final_posture_recommendation: config.finalPostureRecommendation ?? null
  };
}

export function classifySourceDocument(
  document: SourceDocumentInput
): ClassifiedSourceDocument {
  const signals = collectSignals(document.text);
  return {
    documentId: document.documentId,
    kind: document.kind,
    classification: signals.length > 0
      ? "prompt_injection_candidate"
      : baselineClassification(document),
    signals,
    authorityManifestListed: document.authorityManifestListed === true
  };
}

function baselineClassification(
  document: SourceDocumentInput
): SourceAuthorityClassification {
  if (document.authorityManifestListed === true) {
    if (document.kind === "generated_view") return "generated_view";
    if (document.kind === "human_authorization") return "ratified_human_authority";
    if (document.kind === "canonical_planning_source") return "canonical_planning_source";
    return "accepted_control_authority";
  }

  switch (document.kind) {
    case "human_authorization":
      return "ratified_human_authority";
    case "canonical_planning_source":
      return "canonical_planning_source";
    case "accepted_control_record":
      return "accepted_control_authority";
    case "generated_view":
      return "generated_view";
    case "source_data":
    case "readme":
    case "source_comment":
    case "issue":
    case "test_fixture":
    case "package_script":
    case "source_code":
      return "source_data";
    case "untrusted_input":
      return "untrusted_input";
  }
}

function collectSignals(text: string): readonly string[] {
  return PROMPT_INJECTION_PATTERNS
    .filter((pattern) => pattern.pattern.test(text))
    .map((pattern) => pattern.signal);
}
