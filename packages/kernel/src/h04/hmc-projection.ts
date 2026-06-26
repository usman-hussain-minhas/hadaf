import { createHash } from "node:crypto";

export type H04HmcMaturity = "mocked" | "fixture_backed" | "api_backed" | "persistent" | "production_connected";
export type H04HmcProjectionStatus = "passed" | "failed";

export interface H04HmcProjectionConfig {
  readonly projectionId: string;
  readonly boxId: string;
  readonly productSha: string;
  readonly treeHash: string;
  readonly authority: "derived_view_only";
  readonly maturity: H04HmcMaturity;
  readonly ffets: readonly H04HmcFfetProjectionInput[];
  readonly ledgerEvents: readonly H04HmcLedgerEventInput[];
  readonly requiredCannotClaim: readonly string[];
  readonly cannotClaim: readonly string[];
  readonly claimLiveAdapter?: boolean;
  readonly claimPersistence?: boolean;
  readonly claimAuthority?: boolean;
}

export interface H04HmcFfetProjectionInput {
  readonly id: string;
  readonly status: string;
  readonly closeoutComplete: boolean;
  readonly evidenceManifestVerified: boolean;
  readonly terminalLearningComplete: boolean;
}

export interface H04HmcLedgerEventInput {
  readonly eventId: string;
  readonly eventType: "ffet_closed" | "evidence_verified" | "learning_recorded" | "state_superseded";
  readonly ref: string;
  readonly sha256: string;
}

export interface H04HmcProjectionReport {
  readonly status: H04HmcProjectionStatus;
  readonly findings: readonly H04HmcProjectionFinding[];
  readonly projection: H04HmcDerivedProjection;
  readonly cannot_claim: readonly string[];
}

export interface H04HmcProjectionFinding {
  readonly kind: string;
  readonly ref?: string;
  readonly expected?: string;
  readonly actual?: string;
}

export interface H04HmcDerivedProjection {
  readonly id: string;
  readonly boxId: string;
  readonly authority: "derived_view_only";
  readonly maturity: H04HmcMaturity;
  readonly productSha: string;
  readonly treeHash: string;
  readonly lifecycleHash: string;
  readonly ffetSummary: {
    readonly total: number;
    readonly closeoutComplete: number;
    readonly activeOrPending: number;
    readonly evidenceVerified: number;
    readonly terminalLearningComplete: number;
  };
  readonly truthLedger: {
    readonly eventCount: number;
    readonly hash: string;
  };
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const GIT_SHA_PATTERN = /^[a-f0-9]{40}$/u;

export function deriveH04HmcProjection(config: H04HmcProjectionConfig): H04HmcProjectionReport {
  const findings: H04HmcProjectionFinding[] = [];

  if (config.authority !== "derived_view_only" || config.claimAuthority === true) {
    findings.push({
      kind: "h04_hmc_projection_claims_authority",
      ref: config.projectionId,
      expected: "derived_view_only",
      actual: config.authority
    });
  }

  if (config.maturity !== "fixture_backed" && config.maturity !== "mocked") {
    findings.push({
      kind: "h04_hmc_projection_maturity_overclaim",
      ref: config.projectionId,
      expected: "fixture_backed_or_mocked",
      actual: config.maturity
    });
  }

  if (!GIT_SHA_PATTERN.test(config.productSha)) {
    findings.push({ kind: "invalid_product_sha", ref: "productSha", expected: "40 hex", actual: config.productSha });
  }
  if (!GIT_SHA_PATTERN.test(config.treeHash)) {
    findings.push({ kind: "invalid_tree_hash", ref: "treeHash", expected: "40 hex", actual: config.treeHash });
  }

  for (const event of config.ledgerEvents) {
    if (!SHA256_PATTERN.test(event.sha256)) {
      findings.push({
        kind: "invalid_ledger_event_hash",
        ref: event.eventId,
        expected: "64 hex sha256",
        actual: event.sha256
      });
    }
  }

  for (const ffet of config.ffets) {
    if (ffet.status === "closeout_complete" && ffet.closeoutComplete !== true) {
      findings.push({
        kind: "ffet_closeout_status_overclaim",
        ref: ffet.id,
        expected: "closeoutComplete=true",
        actual: "false"
      });
    }
    if (ffet.closeoutComplete && (!ffet.evidenceManifestVerified || !ffet.terminalLearningComplete)) {
      findings.push({
        kind: "ffet_closeout_missing_evidence_or_learning",
        ref: ffet.id,
        expected: "evidenceManifestVerified and terminalLearningComplete",
        actual: `${ffet.evidenceManifestVerified}/${ffet.terminalLearningComplete}`
      });
    }
  }

  if (config.claimLiveAdapter === true) {
    findings.push({
      kind: "live_adapter_overclaim",
      ref: config.projectionId,
      expected: "fixture_backed",
      actual: "live"
    });
  }
  if (config.claimPersistence === true) {
    findings.push({
      kind: "persistence_overclaim",
      ref: config.projectionId,
      expected: "fixture_backed",
      actual: "persistent"
    });
  }

  for (const required of config.requiredCannotClaim) {
    if (config.cannotClaim.includes(required)) continue;
    findings.push({
      kind: "missing_required_cannot_claim",
      ref: `cannot_claim:${required}`
    });
  }

  const closeoutComplete = config.ffets.filter((ffet) => ffet.closeoutComplete).length;
  const projection: H04HmcDerivedProjection = {
    id: config.projectionId,
    boxId: config.boxId,
    authority: config.authority,
    maturity: config.maturity,
    productSha: config.productSha,
    treeHash: config.treeHash,
    lifecycleHash: hashJson({
      boxId: config.boxId,
      ffets: config.ffets,
      ledgerEvents: config.ledgerEvents
    }),
    ffetSummary: {
      total: config.ffets.length,
      closeoutComplete,
      activeOrPending: config.ffets.length - closeoutComplete,
      evidenceVerified: config.ffets.filter((ffet) => ffet.evidenceManifestVerified).length,
      terminalLearningComplete: config.ffets.filter((ffet) => ffet.terminalLearningComplete).length
    },
    truthLedger: {
      eventCount: config.ledgerEvents.length,
      hash: hashJson(config.ledgerEvents)
    }
  };

  return {
    status: findings.length === 0 ? "passed" : "failed",
    findings,
    projection,
    cannot_claim: [...config.cannotClaim]
  };
}

function hashJson(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
