import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runTargetGuard } from "../packages/kernel/dist/target-guard/guard.js";

if (process.argv.includes("--self-test")) {
  runSelfTest();
  process.exit(0);
}

const configPath = process.argv[2];
const config = configPath
  ? JSON.parse(await readFile(configPath, "utf8"))
  : {
      root: ".",
      profile: "hadaf_dogfood",
      cannotClaim: [
        "compiled_bundle_binary_residue_scanning_complete",
        "container_layer_residue_scanning_complete"
      ]
    };

const report = runTargetGuard(config);
console.log(JSON.stringify(report, null, 2));
if (report.status !== "passed") {
  process.exit(1);
}

function runSelfTest() {
  const positive = mkdtempSync(join(tmpdir(), "hadaf-target-positive-"));
  writeFileSync(
    join(positive, "README.md"),
    [
      "HADAF Mission Control may show Box and FFET concepts.",
      `Allowed ${makeUri("control", "schema/authority")}`,
      `Allowed ${makeUri("evidence", "concept/proof")}`,
      `Allowed ${makeUri("runtime", "example/session")}`
    ].join("\n")
  );
  const positiveReport = runTargetGuard({ root: positive, profile: "hadaf_dogfood" });

  const negative = mkdtempSync(join(tmpdir(), "hadaf-target-negative-"));
  mkdirSync(join(negative, "runtime"), { recursive: true });
  writeFileSync(join(negative, "runtime/checkpoint.json"), "{}\n");
  writeFileSync(join(negative, "github-pr-truth.json"), "{}\n");
  writeFileSync(
    join(negative, "README.md"),
    `${makeLocalPath("Users", "usman", "secret.txt")}\n${makeUri("evidence", "manifests/H01/private.json")}\n`
  );
  const negativeReport = runTargetGuard({ root: negative, profile: "hadaf_dogfood" });

  const failed = [];
  if (positiveReport.status !== "passed") {
    failed.push({ fixture: "positive", findings: positiveReport.findings });
  }
  const expectedNegativeKinds = [
    "forbidden_plane_directory",
    "forbidden_private_record_filename",
    "private_local_path",
    "forbidden_instance_residue_uri"
  ];
  for (const kind of expectedNegativeKinds) {
    if (!negativeReport.findings.some((finding) => finding.kind === kind)) {
      failed.push({ fixture: "negative", missingKind: kind, findings: negativeReport.findings });
    }
  }

  if (failed.length > 0) {
    console.error(JSON.stringify({ status: "failed", check: "target_guard_self_test", failed }, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify({
    status: "passed",
    check: "target_guard_self_test",
    positiveFixtures: 1,
    negativeFixtures: expectedNegativeKinds.length
  }));
}

function makeUri(scheme, body) {
  return `${scheme}://${body}`;
}

function makeLocalPath(...parts) {
  return `/${parts.join("/")}`;
}
