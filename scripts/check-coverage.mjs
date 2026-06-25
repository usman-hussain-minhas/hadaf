import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const projectLineCoverageMin = 0.8;
const changedLineCoverageMin = 0.9;

if (process.argv.includes("--self-test")) {
  runSelfTest();
  process.exit(0);
}

const coverageDirectory = mkdtempSync(join(tmpdir(), "hadaf-coverage-"));
try {
  runCommand("pnpm build", { shell: true });
  runCommand("node --test \"packages/kernel/dist/**/*.test.js\"", {
    shell: true,
    env: { ...process.env, NODE_V8_COVERAGE: coverageDirectory }
  });

  const coverage = collectCoverage(coverageDirectory);
  const sourceFiles = listFiles(join(rootDir, "packages/kernel/dist"))
    .filter((path) => path.endsWith(".js"))
    .filter((path) => !path.endsWith(".test.js"));
  const project = calculateCoverage(sourceFiles, coverage);
  const changedSource = changedSourceFiles();
  const changedFiles = changedSource.files.map(sourceToDistFile).filter(Boolean);
  const changed = changedSource.status === "available" && changedFiles.length > 0
    ? calculateCoverage(changedFiles, coverage)
    : null;
  const result = evaluateCoverage({
    project,
    changed,
    changedSource,
    changedFiles,
    thresholds: {
      projectLineCoverageMin,
      changedLineCoverageMin
    }
  });

  if (result.status !== "passed") {
    console.error(JSON.stringify({ status: "failed", check: "coverage", result }, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify({ status: "passed", check: "coverage", result }));
} finally {
  rmSync(coverageDirectory, { recursive: true, force: true });
}

function runCommand(command, options = {}) {
  const result = spawnSync(command, [], {
    cwd: rootDir,
    encoding: "utf8",
    ...options
  });
  if (result.status !== 0) {
    console.error(JSON.stringify({ status: "failed", check: "coverage_command", command, stdout: result.stdout, stderr: result.stderr }, null, 2));
    process.exit(result.status ?? 1);
  }
}

function collectCoverage(directory) {
  const coverage = new Map();
  for (const entry of readdirSync(directory)) {
    if (!entry.endsWith(".json")) continue;
    const report = JSON.parse(readFileSync(join(directory, entry), "utf8"));
    for (const script of report.result ?? []) {
      if (!script.url.startsWith("file://")) continue;
      const path = fileURLToPath(script.url);
      coverage.set(path, script);
    }
  }
  return coverage;
}

function calculateCoverage(files, coverage) {
  let coveredBytes = 0;
  let totalBytes = 0;
  const fileResults = [];

  for (const path of files) {
    const text = readFileSync(path, "utf8");
    const byteCount = Buffer.byteLength(text);
    const covered = new Uint8Array(byteCount);
    const scriptCoverage = coverage.get(resolve(path));

    for (const fn of scriptCoverage?.functions ?? []) {
      for (const range of fn.ranges ?? []) {
        if (range.count <= 0) continue;
        covered.fill(1, range.startOffset, range.endOffset);
      }
    }

    const fileCoveredBytes = covered.reduce((sum, value) => sum + value, 0);
    coveredBytes += fileCoveredBytes;
    totalBytes += byteCount;
    fileResults.push({
      path: relative(path),
      coveredBytes: fileCoveredBytes,
      totalBytes: byteCount,
      ratio: ratio(fileCoveredBytes, byteCount)
    });
  }

  return {
    coveredBytes,
    totalBytes,
    ratio: ratio(coveredBytes, totalBytes),
    files: fileResults
  };
}

function evaluateCoverage({ project, changed, changedSource, changedFiles, thresholds }) {
  const findings = [];
  if (project.ratio < thresholds.projectLineCoverageMin) {
    findings.push({
      scope: "project",
      kind: "coverage_below_threshold",
      actual: project.ratio,
      required: thresholds.projectLineCoverageMin
    });
  }

  if (changed && changed.ratio < thresholds.changedLineCoverageMin) {
    findings.push({
      scope: "changed",
      kind: "coverage_below_threshold",
      actual: changed.ratio,
      required: thresholds.changedLineCoverageMin
    });
  }

  return {
    status: findings.length === 0 ? "passed" : "failed",
    projectLineCoverage: project,
    changedLineCoverage: changed ?? changedCoverageNotApplicable(changedSource),
    changedFiles: changedFiles.map(relative),
    branchCoverage: {
      status: "debt_approved",
      reason: "V8 coverage is enforced for line/byte coverage in H00; branch coverage instrumentation requires a later coverage provider.",
      cannotClaim: ["branch_coverage_enforced"]
    },
    findings
  };
}

function changedSourceFiles() {
  const result = spawnSync("git", ["diff", "--name-only", "origin/main...HEAD"], {
    cwd: rootDir,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    return {
      status: "diff_unavailable",
      reason: "Changed kernel source coverage could not inspect origin/main...HEAD in this checkout.",
      files: [],
      stderr: result.stderr.trim()
    };
  }
  return {
    status: "available",
    files: result.stdout
      .split(/\r?\n/u)
      .filter((path) => path.startsWith("packages/kernel/src/"))
      .filter((path) => path.endsWith(".ts"))
      .filter((path) => !path.endsWith(".test.ts"))
  };
}

function changedCoverageNotApplicable(changedSource) {
  if (changedSource.status === "diff_unavailable") {
    return {
      status: "not_applicable_with_reason",
      reason: changedSource.reason,
      files: [],
      cannotClaim: ["changed_source_coverage_enforced_in_current_checkout"]
    };
  }
  return {
    status: "not_applicable_with_reason",
    reason: "No changed kernel source files detected relative to origin/main",
    files: []
  };
}

function sourceToDistFile(path) {
  const distPath = join(rootDir, path.replace("packages/kernel/src/", "packages/kernel/dist/").replace(/\.ts$/u, ".js"));
  return statExists(distPath) ? distPath : null;
}

function listFiles(directory) {
  const entries = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) entries.push(...listFiles(path));
    else entries.push(path);
  }
  return entries;
}

function statExists(path) {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}

function ratio(covered, total) {
  return total === 0 ? 1 : Number((covered / total).toFixed(6));
}

function relative(path) {
  return path.startsWith(`${rootDir}/`) ? path.slice(rootDir.length + 1) : path;
}

function runSelfTest() {
  const passing = evaluateCoverage({
    project: { ratio: 0.81, files: [], coveredBytes: 81, totalBytes: 100 },
    changed: { ratio: 0.91, files: [], coveredBytes: 91, totalBytes: 100 },
    changedSource: { status: "available", files: ["packages/kernel/src/example.ts"] },
    changedFiles: ["packages/kernel/dist/example.js"],
    thresholds: { projectLineCoverageMin: 0.8, changedLineCoverageMin: 0.9 }
  });
  const failing = evaluateCoverage({
    project: { ratio: 0.79, files: [], coveredBytes: 79, totalBytes: 100 },
    changed: { ratio: 0.89, files: [], coveredBytes: 89, totalBytes: 100 },
    changedSource: { status: "available", files: ["packages/kernel/src/example.ts"] },
    changedFiles: ["packages/kernel/dist/example.js"],
    thresholds: { projectLineCoverageMin: 0.8, changedLineCoverageMin: 0.9 }
  });
  const unchanged = evaluateCoverage({
    project: { ratio: 0.81, files: [], coveredBytes: 81, totalBytes: 100 },
    changed: null,
    changedSource: { status: "available", files: [] },
    changedFiles: [],
    thresholds: { projectLineCoverageMin: 0.8, changedLineCoverageMin: 0.9 }
  });
  const diffUnavailable = evaluateCoverage({
    project: { ratio: 0.81, files: [], coveredBytes: 81, totalBytes: 100 },
    changed: null,
    changedSource: { status: "diff_unavailable", reason: "fixture diff unavailable", files: [] },
    changedFiles: [],
    thresholds: { projectLineCoverageMin: 0.8, changedLineCoverageMin: 0.9 }
  });

  const failures = [];
  if (passing.status !== "passed") failures.push("passing_coverage_fixture_failed");
  if (failing.status !== "failed") failures.push("coverage_below_threshold_fixture_did_not_fail");
  if (unchanged.changedLineCoverage.status !== "not_applicable_with_reason") failures.push("unchanged_scope_missing_not_applicable_reason");
  if (!diffUnavailable.changedLineCoverage.cannotClaim?.includes("changed_source_coverage_enforced_in_current_checkout")) failures.push("diff_unavailable_missing_cannot_claim");

  if (failures.length > 0) {
    console.error(JSON.stringify({ status: "failed", check: "coverage_self_test", failures }, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify({ status: "passed", check: "coverage_self_test", fixtures: 4 }));
}
