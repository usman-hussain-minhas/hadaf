export interface H08StrictOptionalAntiPattern {
  readonly line: number;
  readonly column: number;
  readonly kind: "ternary_undefined_optional" | "literal_undefined_optional" | "maybe_named_optional";
  readonly snippet: string;
}

export function withOptionalField<T extends object, K extends string, V>(
  object: T,
  key: K,
  value: V | undefined
): T & Partial<Record<K, Exclude<V, undefined>>> {
  if (value === undefined) return object;
  return { ...object, [key]: value } as T & Record<K, Exclude<V, undefined>>;
}

export function omitUndefinedProperties(input: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    const normalized = normalizeValue(value);
    if (normalized !== undefined) output[key] = normalized;
  }
  return output;
}

export function findUndefinedPropertyPaths(value: unknown, path = "$"): string[] {
  if (value === undefined) return [path];
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findUndefinedPropertyPaths(item, `${path}[${index}]`));
  }
  if (isPlainRecord(value)) {
    return Object.entries(value).flatMap(([key, entry]) => findUndefinedPropertyPaths(entry, `${path}.${key}`));
  }
  return [];
}

export function detectStrictOptionalAntiPatterns(sourceText: string): H08StrictOptionalAntiPattern[] {
  const findings: H08StrictOptionalAntiPattern[] = [];
  const patterns: readonly { readonly pattern: RegExp; readonly kind: H08StrictOptionalAntiPattern["kind"] }[] = [
    { pattern: /\?\s*[^:\n]+:\s*undefined\b/gu, kind: "ternary_undefined_optional" },
    { pattern: /:\s*undefined\b/gu, kind: "literal_undefined_optional" },
    { pattern: /:\s*maybe[A-Za-z0-9_$]*\b/gu, kind: "maybe_named_optional" }
  ];

  for (const { pattern, kind } of patterns) {
    for (const match of sourceText.matchAll(pattern)) {
      findings.push({
        kind,
        ...locationFor(sourceText, match.index ?? 0),
        snippet: match[0].trim()
      });
    }
  }

  return findings;
}

function normalizeValue(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) return value;
  if (isPlainRecord(value)) {
    const nested = omitUndefinedProperties(value);
    if (Object.keys(nested).length === 0) return undefined;
    return nested;
  }
  return value;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function locationFor(text: string, index: number): { readonly line: number; readonly column: number } {
  const prefix = text.slice(0, index);
  const lines = prefix.split("\n");
  return {
    line: lines.length,
    column: (lines.at(-1)?.length ?? 0) + 1
  };
}
