import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  detectStrictOptionalAntiPatterns,
  findUndefinedPropertyPaths,
  omitUndefinedProperties,
  withOptionalField
} from "./optional-fields.js";

test("omits optional strings when undefined", () => {
  const value = withOptionalField({ kind: "finding" }, "detail", undefined);

  assert.deepEqual(value, { kind: "finding" });
  assert(!Object.hasOwn(value, "detail"));
});

test("preserves false, zero, empty string, and empty array when explicitly present", () => {
  const value = omitUndefinedProperties({
    falseValue: false,
    zeroValue: 0,
    emptyString: "",
    emptyArray: [],
    omitted: undefined
  });

  assert.deepEqual(value, {
    falseValue: false,
    zeroValue: 0,
    emptyString: "",
    emptyArray: []
  });
});

test("omits optional objects when all optional leaves are absent", () => {
  const value = omitUndefinedProperties({
    github: {
      unavailable_reason: undefined
    },
    conductor: {
      dry_run: true,
      mutation_commands_used: []
    }
  });

  assert.deepEqual(value, {
    conductor: {
      dry_run: true,
      mutation_commands_used: []
    }
  });
});

test("preserves null only when the caller domain explicitly supplies null", () => {
  const value = omitUndefinedProperties({
    merge_sha: null,
    optional_note: undefined
  });

  assert.deepEqual(value, { merge_sha: null });
});

test("finds undefined leaves in GitHub truth, CI, and dogfood conductor objects", () => {
  const githubTruth = { github: { unavailable_reason: undefined } };
  const ciState = { classification: { checkName: undefined, detail: "failed" } };
  const dogfoodEnvelope = { conductor: { dry_run: true, decision: undefined } };

  assert.deepEqual(findUndefinedPropertyPaths(githubTruth), ["$.github.unavailable_reason"]);
  assert.deepEqual(findUndefinedPropertyPaths(ciState), ["$.classification.checkName"]);
  assert.deepEqual(findUndefinedPropertyPaths(dogfoodEnvelope), ["$.conductor.decision"]);
});

test("detects strict optional construction anti-pattern examples", () => {
  const source = [
    "const a = { detail: condition ? value : undefined };",
    "const b = { detail: undefined };",
    "const c = { detail: maybeDetail };"
  ].join("\n");
  const findings = detectStrictOptionalAntiPatterns(source);

  assert(findings.some((finding) => finding.kind === "ternary_undefined_optional"));
  assert(findings.some((finding) => finding.kind === "literal_undefined_optional"));
  assert(findings.some((finding) => finding.kind === "maybe_named_optional"));
});

test("guards H08 source against strict optional construction anti-patterns", () => {
  const findings = sourceFiles("packages/kernel/src/h08").flatMap((file) =>
    detectStrictOptionalAntiPatterns(readFileSync(file, "utf8")).map((finding) => ({ file, ...finding }))
  );

  assert.deepEqual(findings, []);
});

function sourceFiles(root: string): string[] {
  return readdirSync(root)
    .flatMap((entry) => {
      const path = join(root, entry);
      const stats = statSync(path);
      if (stats.isDirectory()) return sourceFiles(path);
      return path.endsWith(".ts") && !path.endsWith(".test.ts") ? [path] : [];
    })
    .sort();
}
