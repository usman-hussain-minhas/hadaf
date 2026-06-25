import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ignoredDirectories = new Set([".git", "node_modules", "dist", "coverage"]);
const forbiddenPathSegments = new Set(["control", "evidence", "release", "releases", "runtime", "input"]);
const allowedProductUriSegments = new Set([
  "concept",
  "concepts",
  "example",
  "examples",
  "logical",
  "placeholder",
  "profile",
  "profiles",
  "sample",
  "samples",
  "schema",
  "schemas",
  "type",
  "types",
  "uri",
  "uris"
]);
const secretLikePatterns = [
  /gh[pousr]_[A-Za-z0-9_]{20,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /sk-[A-Za-z0-9]{20,}/,
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/,
  /(api|auth|access|secret|private)[_-]?(key|token|secret)\s*[:=]\s*["'][^"']{8,}["']/i
];
const privatePathPatterns = [
  /\/Volumes\/[^\s"']+/i,
  /\/Users\/[^\s"']+/i,
  /file:\/\/\/?(Users|Volumes)\//i
];
const logicalUriPattern = /\b(control|evidence|release|runtime|input):\/\/[^\s"'`<>)\]}]+/gi;

const findings = [];

function collectFindings(path, text) {
  const fileFindings = [];

  for (const pattern of secretLikePatterns) {
    if (pattern.test(text)) fileFindings.push({ path, kind: "secret_like_pattern", pattern: String(pattern) });
  }

  for (const pattern of privatePathPatterns) {
    if (pattern.test(text)) fileFindings.push({ path, kind: "private_local_path", pattern: String(pattern) });
  }

  for (const match of text.matchAll(logicalUriPattern)) {
    const uriFinding = classifyLogicalUri(path, match[0]);
    if (uriFinding) fileFindings.push(uriFinding);
  }

  return fileFindings;
}

function classifyLogicalUri(path, uri) {
  const schemeMatch = /^([a-z]+):\/\/(.+)$/i.exec(uri);
  if (!schemeMatch) return { path, kind: "malformed_logical_uri", uri };

  const scheme = schemeMatch[1].toLowerCase();
  const body = schemeMatch[2].replace(/[.,;:]+$/g, "");
  const firstSegment = body.split(/[/?#]/, 1)[0].toLowerCase();

  if (scheme === "input") {
    return { path, kind: "forbidden_input_plane_uri", uri };
  }

  if (!["control", "evidence", "release", "runtime"].includes(scheme)) {
    return { path, kind: "unsupported_logical_uri_scheme", uri };
  }

  if (allowedProductUriSegments.has(firstSegment)) return null;

  return {
    path,
    kind: "forbidden_instance_residue_uri",
    uri,
    reason: "Only product-native logical URI examples, schemas, concepts, and profiles are allowed in Product Git"
  };
}

function scanFile(path) {
  findings.push(...collectFindings(path, readFileSync(path, "utf8")));
}

function walk(directory) {
  for (const entry of readdirSync(directory)) {
    if (ignoredDirectories.has(entry)) continue;
    const path = join(directory, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) {
      if (forbiddenPathSegments.has(entry)) {
        findings.push({ path, kind: "forbidden_plane_directory" });
        continue;
      }
      walk(path);
      continue;
    }
    scanFile(path);
  }
}

function runSelfTest() {
  const positiveSamples = [
    `schema reference: ${makeUri("control", "schema/authority-manifest")}`,
    `product evidence concept: ${makeUri("evidence", "concept/proof-artifact")}`,
    `release concept: ${makeUri("release", "logical/candidate")}`,
    `runtime concept: ${makeUri("runtime", "example/adapter-session")}`
  ];
  const negativeSamples = [
    { text: `private control record ${makeUri("control", "03_boxes/H00/ffets.jsonl")}`, kind: "forbidden_instance_residue_uri" },
    { text: `private evidence record ${makeUri("evidence", "quality/H00-Q00/result.json")}`, kind: "forbidden_instance_residue_uri" },
    { text: `worktree handle ${makeUri("runtime", "worktrees/run-001")}`, kind: "forbidden_instance_residue_uri" },
    { text: `bundle handle ${makeUri("input", "planning_bundle/00.md")}`, kind: "forbidden_input_plane_uri" },
    { text: `local file ${makeLocalPath("Users", "usman", "secret.txt")}`, kind: "private_local_path" },
    { text: `secret assignment ${["api", "_", "key"].join("")} = "1234567890abcdef"`, kind: "secret_like_pattern" }
  ];

  const positiveFindings = positiveSamples.flatMap((text, index) =>
    collectFindings(`self-test-positive-${index}`, text)
  );
  const negativeResults = negativeSamples.map((sample, index) => ({
    expectedKind: sample.kind,
    findings: collectFindings(`self-test-negative-${index}`, sample.text)
  }));
  const failedNegatives = negativeResults.filter((result) =>
    !result.findings.some((finding) => finding.kind === result.expectedKind)
  );

  if (positiveFindings.length > 0 || failedNegatives.length > 0) {
    console.error(
      JSON.stringify(
        {
          status: "failed",
          check: "public_safety_self_test",
          positiveFindings,
          failedNegatives
        },
        null,
        2
      )
    );
    process.exit(1);
  }

  console.log(
    JSON.stringify({
      status: "passed",
      check: "public_safety_self_test",
      positiveFixtures: positiveSamples.length,
      negativeFixtures: negativeSamples.length
    })
  );
}

function makeUri(scheme, body) {
  return `${scheme}://${body}`;
}

function makeLocalPath(...parts) {
  return `/${parts.join("/")}`;
}

if (process.argv.includes("--self-test")) {
  runSelfTest();
  process.exit(0);
}

walk(".");

if (findings.length > 0) {
  console.error(JSON.stringify({ status: "failed", check: "public_safety", findings }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ status: "passed", check: "public_safety" }));
