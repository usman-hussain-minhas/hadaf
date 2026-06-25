import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

import { runTargetGuard, type TargetGuardConfig } from "./guard.js";

test("allows product-native HADAF, HMC, Product Preview, Box, and FFET vocabulary", () => {
  const fixture = buildFixture();
  mkdirSync(join(fixture.root, "scripts"), { recursive: true });
  writeFileSync(
    join(fixture.root, "README.md"),
    [
      "HADAF Mission Control displays Box and FFET progress.",
      "Product Preview shows maturity labels.",
      `Allowed logical schema ${makeUri("control", "schema/authority-manifest")}.`,
      `Allowed evidence concept ${makeUri("evidence", "concept/proof-artifact")}.`,
      `Allowed runtime example ${makeUri("runtime", "example/adapter-session")}.`
    ].join("\n")
  );
  writeFileSync(join(fixture.root, "scripts/verify-evidence-manifest.mjs"), "export {};\n");

  const report = runTargetGuard(fixture.config);

  assert.equal(report.status, "passed");
  assert.deepEqual(report.findings, []);
  assert.equal(report.scanned_files.includes("README.md"), true);
});

test("fails when Product Git contains wrong-plane directories", () => {
  const fixture = buildFixture();
  mkdirSync(join(fixture.root, "control"), { recursive: true });
  writeFileSync(join(fixture.root, "control/config.json"), "{}\n");

  const report = runTargetGuard(fixture.config);

  assert.equal(report.status, "failed");
  assertFinding(report, "forbidden_plane_directory");
});

test("fails on private local paths and forbidden instance logical URIs", () => {
  const fixture = buildFixture();
  writeFileSync(
    join(fixture.root, "README.md"),
    [
      `Local path ${makeLocalPath("Volumes", "UsmanWork", "hadaf")}.`,
      `Private record ${makeUri("evidence", "manifests/H01/private.json")}.`,
      `Private input ${makeUri("input", "planning_bundle/source/00.md")}.`
    ].join("\n")
  );

  const report = runTargetGuard(fixture.config);

  assert.equal(report.status, "failed");
  assertFinding(report, "private_local_path");
  assertFinding(report, "forbidden_instance_residue_uri");
  assertFinding(report, "forbidden_input_plane_uri");
});

test("fails on private GitHub, runtime, and evidence record files", () => {
  const fixture = buildFixture();
  writeFileSync(join(fixture.root, "github-pr-truth.json"), "{}\n");
  writeFileSync(join(fixture.root, "runtime-checkpoint.json"), "{}\n");
  writeFileSync(join(fixture.root, "evidence-manifest.json"), "{}\n");

  const report = runTargetGuard(fixture.config);

  assert.equal(report.status, "failed");
  assertFinding(report, "forbidden_private_record_filename");
});

test("fails on private record content and source mutation configs", () => {
  const fixture = buildFixture();
  writeFileSync(
    join(fixture.root, "config.json"),
    JSON.stringify({
      githubPullRequests: [],
      mutationAllowed: true
    })
  );

  const report = runTargetGuard(fixture.config);

  assert.equal(report.status, "failed");
  assertFinding(report, "forbidden_private_record_content");
  assertFinding(report, "source_mutation_config_in_product");
});

test("passes with configured cannot_claim and final posture", () => {
  const fixture = buildFixture({
    cannotClaim: ["fixture_claim"],
    finalPostureRecommendation: "fixture_posture"
  });
  writeFileSync(join(fixture.root, "README.md"), "Plain product file.\n");

  const report = runTargetGuard(fixture.config);

  assert.equal(report.status, "passed");
  assert.deepEqual(report.cannot_claim, ["fixture_claim"]);
  assert.equal(report.final_posture_recommendation, "fixture_posture");
});

function buildFixture(
  override: Partial<TargetGuardConfig> = {}
): {
  readonly root: string;
  readonly config: TargetGuardConfig;
} {
  const root = mkdtempSync(join(tmpdir(), "hadaf-target-guard-"));
  return {
    root,
    config: {
      root,
      profile: "hadaf_dogfood",
      ...override
    }
  };
}

function makeUri(scheme: string, body: string): string {
  return `${scheme}://${body}`;
}

function makeLocalPath(...parts: readonly string[]): string {
  return `/${parts.join("/")}`;
}

function assertFinding(
  report: ReturnType<typeof runTargetGuard>,
  kind: string
): void {
  assert.equal(
    report.findings.some((finding) => finding.kind === kind),
    true
  );
}
