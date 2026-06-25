import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ignoredDirectories = new Set([".git", "node_modules", "dist", "coverage"]);
const forbiddenPathSegments = new Set(["control", "evidence", "release", "releases", "runtime", "input"]);
const secretLikePatterns = [
  /gh[pousr]_[A-Za-z0-9_]{20,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /sk-[A-Za-z0-9]{20,}/,
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/,
  /(api|auth|access|secret|private)[_-]?(key|token|secret)\s*[:=]\s*["'][^"']{8,}["']/i
];
const forbiddenResiduePatterns = [
  /runtime:\/\/worktrees/i,
  /control:\/\//i,
  /evidence:\/\//i,
  /release:\/\//i,
  /\/Volumes\/[^\s"']+/i,
  /\/Users\/[^\s"']+/i
];

const findings = [];

function scanFile(path) {
  const text = readFileSync(path, "utf8");
  for (const pattern of secretLikePatterns) {
    if (pattern.test(text)) findings.push({ path, kind: "secret_like_pattern", pattern: String(pattern) });
  }
  for (const pattern of forbiddenResiduePatterns) {
    if (pattern.test(text)) findings.push({ path, kind: "forbidden_residue_pattern", pattern: String(pattern) });
  }
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

walk(".");

if (findings.length > 0) {
  console.error(JSON.stringify({ status: "failed", check: "public_safety", findings }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ status: "passed", check: "public_safety" }));
