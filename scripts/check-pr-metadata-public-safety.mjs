import { readFileSync } from "node:fs";

const privatePathPatterns = [
  /\/Volumes\/[^\s"'`<>)\]}]+/i,
  /\/Users\/[^\s"'`<>)\]}]+/i,
  /file:\/\/\/?(Users|Volumes)\//i
];
const privateOperationalPatterns = [
  /\b(control|evidence|release|runtime|input):\/\/[^\s"'`<>)\]}]+/i,
  /\binput\/planning_bundle\b/i,
  /\bruntime\/worktrees\b/i,
  /\bcontrol\/03_boxes\b/i,
  /\bevidence\/(audits|manifests|quality|learning)\b/i
];
const secretLikePatterns = [
  /gh[pousr]_[A-Za-z0-9_]{20,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /sk-[A-Za-z0-9]{20,}/,
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/,
  /(api|auth|access|secret|private)[_-]?(key|token|secret)\s*[:=]\s*["'][^"']{8,}["']/i
];

function collectMetadataFindings(source, text) {
  const findings = [];

  for (const pattern of privatePathPatterns) {
    if (pattern.test(text)) findings.push({ source, kind: "private_local_path", pattern: String(pattern) });
  }

  for (const pattern of privateOperationalPatterns) {
    if (pattern.test(text)) {
      findings.push({ source, kind: "private_operational_reference", pattern: String(pattern) });
    }
  }

  for (const pattern of secretLikePatterns) {
    if (pattern.test(text)) findings.push({ source, kind: "secret_like_pattern", pattern: String(pattern) });
  }

  return findings;
}

function runSelfTest() {
  const positiveSamples = [
    "Implements H00-CORR-003A. Public evidence manifest hash: sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef.",
    "CI passed at exact head 0123456789abcdef0123456789abcdef01234567."
  ];
  const negativeSamples = [
    { text: `local path ${makeLocalPath("Volumes", "UsmanWork", "hadaf")}`, kind: "private_local_path" },
    { text: `private URI ${makeUri("evidence", "manifests/H00/result.json")}`, kind: "private_operational_reference" },
    { text: "private bundle input/planning_bundle/00.md", kind: "private_operational_reference" },
    { text: `token ${["secret", "_", "token"].join("")} = "1234567890abcdef"`, kind: "secret_like_pattern" }
  ];

  const positiveFindings = positiveSamples.flatMap((text, index) =>
    collectMetadataFindings(`self-test-positive-${index}`, text)
  );
  const failedNegatives = negativeSamples
    .map((sample, index) => ({
      expectedKind: sample.kind,
      findings: collectMetadataFindings(`self-test-negative-${index}`, sample.text)
    }))
    .filter((result) => !result.findings.some((finding) => finding.kind === result.expectedKind));

  if (positiveFindings.length > 0 || failedNegatives.length > 0) {
    console.error(
      JSON.stringify(
        {
          status: "failed",
          check: "pr_metadata_public_safety_self_test",
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
      check: "pr_metadata_public_safety_self_test",
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

const targets = process.argv.slice(2);
if (targets.length === 0) {
  console.error(
    JSON.stringify({
      status: "failed",
      check: "pr_metadata_public_safety",
      error: "Provide one or more text files, or run with --self-test"
    })
  );
  process.exit(1);
}

const findings = targets.flatMap((target) => collectMetadataFindings(target, readFileSync(target, "utf8")));

if (findings.length > 0) {
  console.error(JSON.stringify({ status: "failed", check: "pr_metadata_public_safety", findings }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ status: "passed", check: "pr_metadata_public_safety", targets }));
