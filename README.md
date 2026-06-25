# HADAF

HADAF is the HAUTM Agentic Delivery & Assurance Framework: a local-first,
model-agnostic software delivery and assurance system.

HADAF is not a chatbot, prompt collection, or Codex-specific workflow. It owns
durable authority, plans, delivery state, Boxes, FFETs, agents, evidence, proof,
audits, self-heals, mistakes, learning, assurance, Git/CI/merge state, and
release state. Model and tool providers connect through adapters.

## Repository Status

This repository is the clean HADAF Product Plane. Bootstrap planning, Control
records, Evidence records, Release records, Runtime state, private prompts,
agent operational instructions, and dogfood execution records are intentionally
outside this repository.

Current posture:

- proprietary, all rights reserved;
- package metadata is private and UNLICENSED;
- no public deployment or production activation is authorized;
- no open-source licence is granted.

For a public-safe summary of delivery rules used by HADAF implementation work,
see [Delivery Rules Reference](docs/delivery-rules-reference.md). Canonical
authority remains the HADAF planning bundle and external Control records.

## Local Checks

```sh
pnpm run quality
```

The seed checks verify public-safe repository content, proprietary package
metadata, absence of licence-grant files, and pinned GitHub Actions workflow
references.
