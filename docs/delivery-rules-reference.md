# Delivery Rules Reference

This is a public-safe delivery rules reference. Canonical authority remains the HADAF planning bundle and external Control records. This document summarizes delivery behavior for Product Plane readers; it is not a lifecycle source of truth and does not replace FFETs, closeouts, evidence, or Control decisions.

## Authority Boundary

Product docs may explain how HADAF delivery is expected to behave, but they must not store private operational state. Product Git must not contain Control records, Evidence records, Runtime state, Release records, private roots, implementation-session details, or generated status snapshots.

Generated status, runtime summaries, HMC views, reports, and chat memory never override verified Git, GitHub, Control, or Evidence truth. When derived state disagrees with verified truth, the mismatch must be classified before any posture claim is made.

## Historical Planning Queues

Planning queue records may preserve pre-execution statuses such as `candidate`, `approved`, or `PLANNED`. After a FFET or Box has append-only closeout and current-state supersession records, those historical statuses are not current truth.

Readers must prefer closeouts, current-state supersessions, verified evidence, and Git/GitHub truth over historical planning queues. Historical queues may explain what was intended at the time they were written; they must not reopen completed work or downgrade a boundedly verified posture by themselves.

## Point-in-Time Evidence

Verification configs and assurance configs are point-in-time records. They bind to the product SHA, source hashes, and evidence expectations recorded for that run.

Do not replay an old verification config against a later product main and treat the mismatch as current failure unless the current FFET explicitly requires historical replay. Final proof for a completed Box should use that Box's terminal closeout, final readiness evidence, and any later supersession records.

## SHA Pinning Boundary

HADAF does not claim platform-level GitHub Actions SHA pin enforcement unless the GitHub setting actually requires it. Product CI can still enforce known pinned workflow actions through its scanner, and branch protection can require the stable `Seed quality checks` context.

Those are separate controls: platform setting, Product scanner, and branch protection must be described independently.

## FFET Freshness

A stale implementation is a symptom of a stale FFET.

Every implementation unit must begin from a fresh, exact, audited, scoped FFET. The FFET must be concrete enough to maximize useful implementation inside its scope, including owned files, forbidden files, validation commands, proof expectations, negative fixtures, residue checks, and cannot-claim boundaries.

An FFET does not close merely because code merged. Closeout requires implementation status, qualification status, exact head and merge SHAs where applicable, implemented files, validation results, evidence manifests, remaining debt, and cannot-claim entries.

## Terminal PR Upskill

After every terminal PR outcome, HADAF records an upskill review. Terminal outcomes include merge, close, supersession, or abandoned replacement.

Upskill lanes include:

- coding;
- planning;
- evidence;
- security;
- doctrine;
- decision.

No lesson learned counts unless it creates at least one executable fixture, FFET checklist item, verifier rule, stop condition, or human decision gate.

## Decision Upskill

Decision upskills capture judgment failures, not only code defects. A decision upskill record should include:

- decision context;
- rejected alternatives;
- decision failure;
- corrected rule;
- future stop or ask condition;
- regression checklist;
- cannot-claim impact.

Examples include trusting generated state too quickly, under-scoping a FFET, overclaiming proof, choosing a risky sequencing path, or failing to stop when verified truth was missing.

## H02 Claim Boundary

Static accessibility smoke is not browser accessibility proof. It can check static structure, labels, landmarks, focusable elements, document title, color-token sanity, and asset budget, but it does not prove full browser interaction, keyboard traversal, screen-reader behavior, or browser performance.

Fixture-backed HMC and Product Preview states are not live, persistent, production-connected, or authoritative. HMC is a derived view over verified truth. Product Preview is an inspection surface. Neither can create authority by displaying a status.

## Quality Claim Precision

Quality debt and cannot-claim entries should be precise. Avoid broad stale labels when a narrower claim describes the actual missing capability.

Prefer specific claims such as `live_github_adapter_implemented` and `persistent_state_store_implemented` over stale aggregate labels such as `real_state_adapters_implemented`.

## GitHub CLI Merge Cleanup

If a GitHub CLI merge succeeds remotely but local cleanup fails, verify GitHub PR state and remote main before acting further. Do not assume local cleanup failure means merge failure. Confirm the PR state, remote main SHA, branch state, and worktree cleanliness before continuing.

## Final Sanity

Before a final posture is recorded, rerun the final quality gate, exact-SHA manifest resolution, no-open-PR check, worktree cleanup check, bundle verifier, and cannot-claim precision check.

If any of those checks fail or produce generated/tracked file changes outside the active FFET scope, stop and classify the result instead of widening the PR silently.

## Evidence Eligibility

Valid evidence is not necessarily eligible evidence. HADAF must check syntax, schema, existence, and hash integrity, but terminal claims also require purpose, provenance, maturity, freshness, authority, eligibility, and root-of-trust checks.

`PATTERN-11`, Closed-Loop Claim Promotion / Evidence Eligibility Failure, describes a failure mode where structurally valid and internally consistent evidence is promoted to support a claim for which it is not eligible. `PATTERN-11A` covers the H03 subtype where a fixture or test artifact is promoted as ratification truth.

Terminal evidence must declare a governed artifact purpose. Public-safe purpose labels include:

- `fixture_only`;
- `test_calibration`;
- `generated_view`;
- `implementation_evidence`;
- `qualification_evidence`;
- `ratification_candidate`;
- `ratified_authority`;
- `release_candidate`;
- `production_evidence`.

Lower-purpose artifacts cannot satisfy higher-purpose claims. Fixture, test-calibration, and generated-view artifacts may help prove that scanners and UI projections work, but they cannot support ratification, release, or production claims.

## Truth-Source Classes

Terminal claims must distinguish where truth came from. Public-safe truth-source labels include:

- `fixture_state`;
- `generated_view`;
- `runtime_checkpoint`;
- `control_authority`;
- `evidence_attestation`;
- `git_truth`;
- `github_truth`;
- `human_ratification`;
- `unavailable`;
- `stale`;
- `conflicting`.

Fixture, generated, and runtime state never override verified Control, Evidence, Git, or GitHub truth. Only a human ratification decision can create human-ratification truth.

## Claim Eligibility

Every terminal claim should have an eligibility contract that names the claim to prove, minimum evidence purpose, eligible evidence types, forbidden evidence types, required authority roots, freshness requirement, independence requirement, and human gate.

For an H03 Delivery Constitution to be ready for human ratification, mandatory roots must be real and authority-bound: Source Authority Manifest, Question Register, companion artifact set, Delivery Constitution candidate, ratification-grade assurance, current Product SHA/tree, external Control provenance, `for_human_review` approval state, and external execution authorization set to false.

Forbidden roots include fixture-only evidence, test-calibration evidence, generated views as authority, runtime checkpoints as authority, chat-derived authority, and unbound transient evidence.

## Weakest Evidence

A terminal claim cannot mature beyond the weakest mandatory evidence root. If any mandatory root is fixture-only, stale, unavailable, conflicting, generated-only, or transient-only, the final claim must be downgraded or blocked even when all downstream hashes and schemas verify.

This rule prevents a closed loop where the same internally consistent evidence chain proves itself without proving external authority, purpose eligibility, or maturity.

## Root Of Trust

Terminal readiness must trace from final claim to closeout, assurance, evidence manifest, constitution, companion artifacts, Question Register, Source Authority Manifest, and canonical or human authority.

Every edge in that trace should verify reference, content hash, schema hash, purpose eligibility, freshness, and authority class. A correct hash chain anchored to an ineligible root is still ineligible.

## Durable Evidence Promotion

Scratch output may exist during implementation, but no final assurance, readiness, closeout, ratification, release, or production artifact may depend solely on transient files.

Before terminal use, required artifacts must be durable in the correct plane, schema-valid, hash-checked, manifest-bound, replay-verified, purpose-classified, and freshness-classified. Historical or calibration artifacts may be referenced only as validation or superseded history; they must not raise terminal claim maturity.

## Terminal Audit Stages

Terminal audits must answer three separate questions:

- Is the evidence structurally and cryptographically valid?
- Is the evidence eligible for the claim?
- Does the root authority originate outside the generated evidence chain being audited?

All three must pass before a terminal readiness claim may advance. A role label or separate session may produce an advisory read-only audit, but it does not prove genuine independent qualification by itself.

## Final-Mode Ratification Boundary

H03 final-mode ratification checks must use real authority-bound roots and the current Product SHA/tree. Calibration or fixture packages may test the guard, but they must not emit an H03 ratification-ready posture.

The final-mode command path must reject fixture references, fixture-labelled identifiers, test/example paths as authority, generated summaries as authority, placeholder or dummy hashes, transient-only evidence, stale Product SHAs, unresolved broad questions, approval overclaims, embedded execution authorization, and cross-plane maturity contradictions.

## Pipeline Placement

### FFET Compiler

H03 introduces the FFET Compiler as Product generic compiler logic backed by Control authority and configuration. After H03 implements it, the compiler becomes the only valid way to create executable JIT FFETs before an implementation branch begins.

The compiler must preserve freshness, exact file ownership, forbidden-plane boundaries, validation commands, evidence expectations, rollback plans, cannot-claim entries, and stop conditions.

### Final Sanity Command

H03 or H04 should introduce a Final Sanity command as Product generic verifier logic backed by Control and Evidence configuration. Once available, it is required as a pipeline gate immediately after it exists.

Its pipeline position is the post-merge closeout gate and final Box/System posture gate. A FFET, Box, or System posture cannot close until the Final Sanity command passes or produces an explicitly classified failure/debt record.

### Truth Ledger

H04 or H05 should introduce the Truth Ledger after the compiler provides enough structure. The ledger belongs to Control/Evidence schema and records, with Product generic readers and adapters.

Every PR lifecycle event should write to the ledger. HMC should read from it as a derived view. The Truth Ledger becomes the durable replacement for hand-shaped fixture state, but it still does not override verified Git, GitHub, Control, or Evidence truth.

### Future Process Engines

Future Boxes should place generalized process machinery in the right scope:

- H04: Delivery Truth Ledger, Box/FFET engine, generalized truth-source classifier, closeout hash-chain verifier, durable evidence writer, schema-driven record generators, fixture-pack generator, `finalize-box` command, and HMC truth-class projection.
- H05: Agent Registry, agent version and capability contracts, bounded qualification, circuit breakers, quarantine/demotion, decision-upskill records, and non-degradation checks.
- H06: worktree lifecycle, absolute current-directory enforcement, locks, checkpoints, quotas, pod scheduler, serial fallback, local lifecycle-runner foundation, and cleanup/orphan reconciliation.

These entries are future placement requirements only. They do not authorize or claim H04, H05, or H06 implementation.

## Persistent Cannot-Claim

This reference does not claim self-hosting readiness, release-candidate status, production readiness, stable agents, independent quality auditor qualification, independent process separation, live GitHub adapters, persistent state storage, browser-complete accessibility, or production-connected preview.
