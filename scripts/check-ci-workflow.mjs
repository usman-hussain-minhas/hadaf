import { readFileSync } from "node:fs";

const fullSha = "[a-f0-9]{40}";
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const deniedCopyleftLicenses = [
  "AGPL-1.0-only",
  "AGPL-1.0-or-later",
  "AGPL-3.0-only",
  "AGPL-3.0-or-later",
  "GPL-1.0-only",
  "GPL-1.0-or-later",
  "GPL-2.0-only",
  "GPL-2.0-or-later",
  "GPL-3.0-only",
  "GPL-3.0-or-later",
  "LGPL-2.0-only",
  "LGPL-2.0-or-later",
  "LGPL-2.1-only",
  "LGPL-2.1-or-later",
  "LGPL-3.0-only",
  "LGPL-3.0-or-later"
];
const pinnedActions = {
  checkout: "actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0",
  setupNode: "actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e",
  codeqlInit: "github/codeql-action/init@1a818fd5f97ed0ee9a823421bd5b171add01227f",
  codeqlAnalyze: "github/codeql-action/analyze@1a818fd5f97ed0ee9a823421bd5b171add01227f",
  dependencyReview: "actions/dependency-review-action@a1d282b36b6f3519aa1f3fc636f609c47dddb294"
};

if (process.argv.includes("--self-test")) {
  runSelfTest();
  process.exit(0);
}

const files = {
  ci: readFileSync(".github/workflows/ci.yml", "utf8"),
  codeql: readFileSync(".github/workflows/codeql.yml", "utf8"),
  dependabot: readFileSync(".github/dependabot.yml", "utf8")
};

const failures = validateWorkflows(files, packageJson);
const selfTest = runSelfTest({ silent: true });
if (selfTest.status !== "passed") {
  failures.push(...selfTest.failures);
}

if (failures.length > 0) {
  console.error(JSON.stringify({ status: "failed", check: "ci_workflow", failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ status: "passed", check: "ci_workflow", selfTest }));

function validateWorkflows({ ci, codeql, dependabot }, pkg = packageJson) {
  const failures = [];

  assertPinnedActions("ci.yml", ci, failures);
  assertPinnedActions("codeql.yml", codeql, failures);
  assertExpectedAction(ci, pinnedActions.checkout, "ci.yml", failures);
  assertExpectedAction(ci, pinnedActions.setupNode, "ci.yml", failures);
  assertExpectedAction(ci, pinnedActions.dependencyReview, "ci.yml", failures);
  assertExpectedAction(codeql, pinnedActions.checkout, "codeql.yml", failures);
  assertExpectedAction(codeql, pinnedActions.codeqlInit, "codeql.yml", failures);
  assertExpectedAction(codeql, pinnedActions.codeqlAnalyze, "codeql.yml", failures);

  if (!/permissions:\s*\n\s+contents:\s+read\s*\n\s+pull-requests:\s+read/m.test(ci)) {
    failures.push("CI workflow must use read-only contents and pull-requests permissions");
  }
  if (!/permissions:\s*\n\s+actions:\s+read\s*\n\s+contents:\s+read\s*\n\s+security-events:\s+write/m.test(codeql)) {
    failures.push("CodeQL workflow must use only actions: read, contents: read, and security-events: write");
  }
  if (/permissions:\s*(write-all|read-all)/m.test(ci) || /permissions:\s*(write-all|read-all)/m.test(codeql)) {
    failures.push("Workflows must not use broad write-all or read-all permissions");
  }
  if (/^\s+[a-z-]+:\s+write$/m.test(ci)) {
    failures.push("CI workflow must not request write permissions");
  }
  if (/^\s+(?!security-events:)[a-z-]+:\s+write$/m.test(codeql)) {
    failures.push("Only CodeQL security-events may use write permission");
  }
  if (!/name:\s+Seed quality checks/m.test(ci)) {
    failures.push("CI workflow must preserve stable required check name: Seed quality checks");
  }
  if (!/run:\s+pnpm run quality/m.test(ci)) {
    failures.push("CI workflow must run the classified quality gate through pnpm run quality");
  }
  if (!/node-version:\s+"24"/m.test(ci)) {
    failures.push("CI workflow must run on Node 24");
  }
  if (!allowsNode24(pkg.engines?.node)) {
    failures.push("package.json engines.node must allow Node 24");
  }
  if (!/dependency-review:\s*\n[\s\S]*if:\s+github\.event_name == 'pull_request'/m.test(ci)) {
    failures.push("Dependency review must be pull-request scoped");
  }
  if (!/fail-on-severity:\s+moderate/m.test(ci)) {
    failures.push("Dependency review must fail on at least moderate severity");
  }
  const missingDeniedLicenses = deniedCopyleftLicenses.filter((license) => !new RegExp(`\\b${escapeRegExp(license)}\\b`).test(ci));
  if (missingDeniedLicenses.length > 0) {
    failures.push(`Dependency review deny list missing copyleft licenses: ${missingDeniedLicenses.join(", ")}`);
  }
  if (!/languages:\s+javascript-typescript/m.test(codeql) || !/build-mode:\s+none/m.test(codeql)) {
    failures.push("CodeQL workflow must analyze javascript-typescript with build-mode none");
  }
  if (!/package-ecosystem:\s+github-actions/m.test(dependabot) || !/package-ecosystem:\s+npm/m.test(dependabot)) {
    failures.push("Dependabot must cover GitHub Actions and npm");
  }

  return failures;
}

function allowsNode24(range) {
  return typeof range === "string" && />=\s*22\.0\.0/.test(range) && /<\s*25/.test(range);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assertPinnedActions(source, text, failures) {
  for (const match of text.matchAll(/uses:\s+([^@\s]+)@([^\s]+)/g)) {
    if (!new RegExp(`^${fullSha}$`).test(match[2])) {
      failures.push(`${source} action is not pinned to a full commit SHA: ${match[0]}`);
    }
  }
}

function assertExpectedAction(text, action, source, failures) {
  if (!text.includes(action)) {
    failures.push(`${source} missing pinned action ${action}`);
  }
}

function runSelfTest(options = {}) {
  const positive = {
    ci: [
      "permissions:",
      "  contents: read",
      "  pull-requests: read",
      "jobs:",
      "  quality:",
      "    name: Seed quality checks",
      "    steps:",
      `      - uses: ${pinnedActions.checkout}`,
      `      - uses: ${pinnedActions.setupNode}`,
      "        with:",
      "          node-version: \"24\"",
      "      - run: pnpm run quality",
      "  dependency-review:",
      "    if: github.event_name == 'pull_request'",
      "    steps:",
      `      - uses: ${pinnedActions.dependencyReview}`,
      "        with:",
      "          fail-on-severity: moderate",
      `          deny-licenses: ${deniedCopyleftLicenses.join(", ")}`
    ].join("\n"),
    codeql: [
      "permissions:",
      "  actions: read",
      "  contents: read",
      "  security-events: write",
      "jobs:",
      "  analyze:",
      "    steps:",
      `      - uses: ${pinnedActions.checkout}`,
      `      - uses: ${pinnedActions.codeqlInit}`,
      "        with:",
      "          languages: javascript-typescript",
      "          build-mode: none",
      `      - uses: ${pinnedActions.codeqlAnalyze}`
    ].join("\n"),
    dependabot: [
      "version: 2",
      "updates:",
      "  - package-ecosystem: github-actions",
      "  - package-ecosystem: npm"
    ].join("\n")
  };
  const negativeFixtures = [
    {
      name: "floating_action_fails",
      files: { ...positive, ci: positive.ci.replace(pinnedActions.checkout, "actions/checkout@v7") },
      expected: "not pinned"
    },
    {
      name: "write_all_fails",
      files: { ...positive, ci: positive.ci.replace("permissions:\n  contents: read\n  pull-requests: read", "permissions: write-all") },
      expected: "read-only contents"
    },
    {
      name: "missing_required_context_fails",
      files: { ...positive, ci: positive.ci.replace("Seed quality checks", "Quality") },
      expected: "Seed quality checks"
    },
    {
      name: "dependency_review_push_scope_fails",
      files: { ...positive, ci: positive.ci.replace("if: github.event_name == 'pull_request'", "if: always()") },
      expected: "pull-request scoped"
    },
    {
      name: "dependency_review_missing_severity_fails",
      files: { ...positive, ci: positive.ci.replace("          fail-on-severity: moderate\n", "") },
      expected: "fail on at least moderate severity"
    },
    {
      name: "dependency_review_missing_license_variant_fails",
      files: { ...positive, ci: positive.ci.replace("AGPL-1.0-or-later, ", "") },
      expected: "AGPL-1.0-or-later"
    },
    {
      name: "codeql_extra_write_fails",
      files: { ...positive, codeql: positive.codeql.replace("  contents: read", "  contents: write") },
      expected: "Only CodeQL security-events"
    },
    {
      name: "package_engine_incompatible_fails",
      files: positive,
      packageJson: { engines: { node: ">=22.0.0 <24" } },
      expected: "engines.node"
    }
  ];

  const positiveFailures = validateWorkflows(positive, { engines: { node: ">=22.0.0 <25" } });
  const failedNegatives = negativeFixtures
    .map((fixture) => ({
      fixture: fixture.name,
      failures: validateWorkflows(fixture.files, fixture.packageJson ?? { engines: { node: ">=22.0.0 <25" } }),
      expected: fixture.expected
    }))
    .filter((result) => !result.failures.some((failure) => failure.includes(result.expected)));

  if (positiveFailures.length > 0 || failedNegatives.length > 0) {
    const result = {
      status: "failed",
      check: "ci_workflow_self_test",
      positiveFailures,
      failedNegatives,
      failures: [
        ...positiveFailures,
        ...failedNegatives.map((fixture) => `${fixture.fixture} did not trigger expected failure: ${fixture.expected}`)
      ]
    };
    if (options.silent) return result;
    console.error(JSON.stringify(result, null, 2));
    process.exit(1);
  }

  const result = {
    status: "passed",
    check: "ci_workflow_self_test",
    positiveFixtures: 1,
    negativeFixtures: negativeFixtures.length,
    failures: []
  };
  if (options.silent) return result;
  console.log(JSON.stringify(result));
  return result;
}
