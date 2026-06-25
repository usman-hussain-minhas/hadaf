# Delivery Rules Reference

This is a public-safe delivery rules reference. Canonical authority remains the HADAF planning bundle and external Control records. This document summarizes delivery behavior for Product Plane readers; it is not a lifecycle source of truth and does not replace FFETs, closeouts, evidence, or Control decisions.

## Authority Boundary

Product docs may explain how HADAF delivery is expected to behave, but they must not store private operational state. Product Git must not contain Control records, Evidence records, Runtime state, Release records, private roots, implementation-session details, or generated status snapshots.

Generated status, runtime summaries, HMC views, reports, and chat memory never override verified Git, GitHub, Control, or Evidence truth. When derived state disagrees with verified truth, the mismatch must be classified before any posture claim is made.

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

## Persistent Cannot-Claim

This reference does not claim self-hosting readiness, release-candidate status, production readiness, stable agents, independent quality auditor qualification, independent process separation, live GitHub adapters, persistent state storage, browser-complete accessibility, or production-connected preview.
