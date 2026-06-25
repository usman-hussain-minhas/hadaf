# HMC And Product Preview Architecture

## Purpose

HADAF Mission Control, abbreviated HMC, is the local operator surface for reading HADAF delivery state. Product Preview is the local surface for inspecting the product being delivered. They are related, but they are not the same surface.

HMC helps a human see what HADAF believes is happening. Product Preview helps a human inspect what the product currently does. Neither surface is authority by itself.

## Authority Boundary

HMC is a generated view. It may display project state, Box state, FFET state, evidence summaries, quality status, debt, cannot-claim entries, Git status, GitHub status, CI status, questions, and decisions. HMC must not create authority by rendering text on screen.

Product Preview is an inspection surface. It may show product routes, static previews, fixture-backed states, local API-backed states, and maturity labels. Product Preview must not claim production connectivity unless a production connection is actually configured and verified by later delivery work.

When a generated HMC view disagrees with verified delivery truth, verified delivery truth wins. The UI must make stale, missing, incomplete, or conflicting state visible instead of hiding it.

## Local-First Topology

The first HMC and Product Preview implementation is local-first:

- A local Node process may serve static assets and read-only JSON state.
- Product code may provide generic readers, renderers, adapters, and fixtures.
- Private project roots, run identifiers, repository snapshots, evidence records, and operator-specific facts must be supplied through external configuration or invocation context.
- Public Product Git must contain only product-safe code, fixtures, docs, and generic examples.

The public product repository must not contain private Control, Evidence, Runtime, or Release records. It must also not contain local machine paths, private prompts, operational transcripts, secrets, repository-setting snapshots, or private evidence payloads.

## Surface Separation

HMC owns the operator experience:

- project identity;
- Box roadmap;
- active Box status;
- FFET queue and closeout summaries;
- quality, debt, and cannot-claim summaries;
- evidence and proof summaries;
- Git, GitHub, and CI summaries;
- human questions and decisions;
- agent, pod, and worktree state when real state exists.

Product Preview owns product inspection:

- local product routes;
- static preview states;
- fixture-backed product states;
- API-backed product states when a local API exists;
- explicit maturity labels;
- visible cannot-claim entries when a state is not production-connected.

HMC may link to Product Preview. Product Preview may surface HADAF maturity metadata. Neither surface may silently substitute for the other.

## State Maturity Labels

Every HMC or Product Preview data region must be classified with one of these maturity labels:

- `mocked`: placeholder or illustrative data only.
- `fixture_backed`: deterministic fixture data committed to Product Git.
- `api_backed`: live local API response from a HADAF process or adapter.
- `persistent`: state persisted by a local HADAF store.
- `production_connected`: verified production connection.

Initial H02 implementations may use `mocked` and `fixture_backed`. `api_backed`, `persistent`, and `production_connected` require later FFETs to prove the backing mechanism. A UI region must not display a higher maturity label than its data source supports.

## Truth Precedence

HMC readers must apply this order when comparing state:

1. Verified Git and GitHub truth.
2. Verified evidence and closeout records.
3. Accepted Control authority.
4. Runtime state that is fresh and explicitly bound to the current run.
5. Generated reports and derived UI state.
6. Fixtures and mocks.

Generated state may be helpful, but it is never enough to prove current delivery truth. If a state reader finds a mismatch, the UI must classify it as missing, stale, incomplete, or conflicting.

## Product-Safe Configuration

Product code may accept configuration paths or data objects at runtime. Product code must not hardcode private roots, private run identifiers, private GitHub snapshots, private evidence locations, or local filesystem details.

Fixture configs inside Product Git are allowed when they are public-safe and deterministic. Real project configs belong outside Product Git.

## H01 Dependency

H02 depends on the H01 source and target guard foundation:

- source documents are treated as read-only inputs;
- generated views are not authority;
- untrusted text and prompt-injection candidates are classified;
- Product Git is scanned for wrong-plane residue;
- product-native HADAF, HMC, Product Preview, Box, FFET, and maturity vocabulary is allowed;
- instance records and private operational facts remain outside Product Git.

If the Target Guard reports product-plane residue, HMC and Product Preview work must stop until the residue is corrected or explicitly classified.

## Static Accessibility Scope

H02 may prove a bounded static accessibility smoke baseline:

- document title exists;
- one primary landmark exists;
- navigation is represented with semantic elements;
- headings are ordered for the static page shape;
- interactive controls have accessible names;
- links and buttons are focusable;
- visible cannot-claim and stale-state markers are present where needed;
- basic color tokens are named and constrained;
- asset budget is bounded.

This is not a full browser accessibility audit. H02 must preserve cannot-claim entries for browser-complete accessibility and browser performance until real browser tooling or equivalent proof exists.

## Security And Public-Safety Rules

HMC and Product Preview must not display secrets, private local paths, private operational paths, private prompts, raw transcripts, or unredacted private evidence. Public-safe hashes and statuses may be shown when the backing evidence policy allows it.

Public Product Git must stay proprietary and private-by-metadata:

- package metadata remains private and unlicensed for public use;
- no public-use license file is added;
- public-safe docs may describe HADAF concepts without granting external rights.

## Implementation Sequence

H02 implementation proceeds in narrow FFETs:

1. Architecture contract.
2. Local HMC shell and navigation.
3. Real-state read adapters with truth conflict classification.
4. Product Preview shell with maturity labels.
5. Static accessibility, preview honesty, and H02 closeout.

Each FFET must keep HMC as a derived view, keep Product Preview honest about maturity, and preserve the no-overclaim posture.
