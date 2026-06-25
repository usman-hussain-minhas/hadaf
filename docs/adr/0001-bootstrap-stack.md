# ADR 0001: Bootstrap Stack

## Status

Accepted for bootstrap.

## Context

The approved implementation direction requires a local-first, public-repository-safe TypeScript foundation for HADAF. The Product Plane must be clean and proprietary while Control, Evidence, Release, and Runtime state stay outside the product repository.

## Decision

Use TypeScript end-to-end with Node.js 24 LTS, pnpm workspaces, strict TypeScript project references, Node's built-in test runner for the bootstrap foundation, GitHub Actions validation, CodeQL, dependency review, and product-native safety scanners.

Vitest remains an approved later test-runner candidate, but its current transitive dependency set includes weak-copyleft material that requires licence review under HADAF's public repository policy. The bootstrap foundation therefore uses Node's built-in test runner until that review or replacement decision is ratified.

The initial Product repository remains publish-blocked through `private: true`, `license: UNLICENSED`, and `prepublishOnly`.

## Consequences

- The local bootstrap shell may warn if it is not running Node.js 24, but CI validates the pinned LTS runtime.
- Future HMC, local API, runtime, proof, and adapter packages can be added under the same workspace.
- No private HADAF Control or Evidence artifacts are stored in the public Product repository.
