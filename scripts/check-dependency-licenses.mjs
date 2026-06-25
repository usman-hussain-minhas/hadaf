import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const rootDir = dirname(dirname(scriptPath));
const workspacePackageDependencyFields = ["dependencies", "devDependencies", "optionalDependencies"];
const transitiveDependencyFields = ["dependencies", "optionalDependencies"];
const allowedPermissiveLicenses = new Set([
  "0BSD",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "ISC",
  "MIT",
  "Python-2.0",
  "Unicode-DFS-2016",
  "Unlicense"
]);
const weakCopyleftLicenses = new Set(["LGPL-2.0-only", "LGPL-2.0-or-later", "LGPL-2.1-only", "LGPL-2.1-or-later", "LGPL-3.0-only", "LGPL-3.0-or-later", "MPL-1.1", "MPL-2.0", "EPL-1.0", "EPL-2.0", "CDDL-1.0", "CDDL-1.1"]);
const strongCopyleftLicenses = new Set(["AGPL-1.0-only", "AGPL-1.0-or-later", "AGPL-3.0-only", "AGPL-3.0-or-later", "GPL-1.0-only", "GPL-1.0-or-later", "GPL-2.0-only", "GPL-2.0-or-later", "GPL-3.0-only", "GPL-3.0-or-later"]);
const knownLicenseExceptions = new Set(["Classpath-exception-2.0", "LLVM-exception", "OpenSSL-exception"]);

export function buildSupplyChainReport(baseDir = rootDir) {
  const lockfilePath = join(baseDir, "pnpm-lock.yaml");
  const lockfileText = readFileSync(lockfilePath, "utf8");
  const workspacePackages = readWorkspacePackages(baseDir);
  const lockPackages = extractLockPackages(lockfileText);
  const externalPackages = new Map();
  const edges = [];
  const findings = [];
  const queue = [];
  const directDependencies = new Set();

  for (const workspacePackage of workspacePackages) {
    const workspaceLicense = classifyLicenseExpression(workspacePackage.license, {
      internal: true,
      private: workspacePackage.private
    });
    if (workspaceLicense.status !== "allowed") {
      findings.push({
        kind: "workspace_license_invalid",
        packageName: workspacePackage.name,
        license: workspacePackage.license,
        detail: workspaceLicense.reason
      });
    }

    for (const field of workspacePackageDependencyFields) {
      for (const [dependencyName, specifier] of Object.entries(workspacePackage.manifest[field] ?? {})) {
        directDependencies.add(dependencyName);
        edges.push({
          from: workspacePackage.name,
          to: dependencyName,
          relationship: field,
          specifier
        });
        queue.push({ packageName: dependencyName, dependencyOf: workspacePackage.name, relationship: field, direct: true });
      }
    }
  }

  while (queue.length > 0) {
    const item = queue.shift();
    const lockPackageHint = findSingleLockPackageByName(lockPackages, item.packageName);
    const packageJsonPath = findInstalledPackageJsonPath(baseDir, item.packageName, lockPackageHint);
    if (!packageJsonPath) {
      findings.push({
        kind: "missing_package_metadata",
        packageName: item.packageName,
        dependencyOf: item.dependencyOf
      });
      continue;
    }

    const manifest = readJson(packageJsonPath);
    const packageKey = `${manifest.name}@${manifest.version}`;
    const existing = externalPackages.get(packageKey);

    if (existing) {
      existing.direct ||= item.direct;
      existing.dependencyOf = Array.from(new Set([...existing.dependencyOf, item.dependencyOf])).sort();
      continue;
    }

    const lockPackage = lockPackages.get(packageKey);
    if (!lockPackage) {
      findings.push({
        kind: "lockfile_package_missing",
        packageName: manifest.name,
        version: manifest.version,
        dependencyOf: item.dependencyOf
      });
    }

    const licenseExpression = normalizeLicenseExpression(manifest);
    const licenseClassification = classifyLicenseExpression(licenseExpression, { internal: false });
    if (licenseClassification.status !== "allowed") {
      findings.push({
        kind: licenseClassification.findingKind,
        packageName: manifest.name,
        version: manifest.version,
        license: licenseExpression,
        detail: licenseClassification.reason
      });
    }

    const packageRecord = {
      name: manifest.name,
      version: manifest.version,
      packageKey,
      license: licenseExpression,
      licenseClassification: licenseClassification.classification,
      direct: item.direct,
      dependencyOf: [item.dependencyOf],
      packageJsonPath: relativePublicPath(baseDir, packageJsonPath),
      lockfile: lockPackage
        ? {
            key: lockPackage.key,
            integrity: lockPackage.integrity ?? null
          }
        : null,
      repository: normalizeRepository(manifest.repository),
      homepage: typeof manifest.homepage === "string" ? manifest.homepage : null
    };

    externalPackages.set(packageKey, packageRecord);

    for (const field of transitiveDependencyFields) {
      for (const [dependencyName, specifier] of Object.entries(manifest[field] ?? {})) {
        edges.push({
          from: packageKey,
          to: dependencyName,
          relationship: field,
          specifier
        });
        queue.push({ packageName: dependencyName, dependencyOf: packageKey, relationship: field, direct: false });
      }
    }
  }

  for (const packageKey of lockPackages.keys()) {
    if (!externalPackages.has(packageKey)) {
      findings.push({
        kind: "lockfile_package_unreviewed",
        packageKey
      });
    }
  }

  const reportWithoutHash = {
    schemaVersion: "hadaf_supply_chain_graph_v1",
    packageManager: readJson(join(baseDir, "package.json")).packageManager,
    lockfileVersion: extractLockfileVersion(lockfileText),
    provenance: {
      kind: "local_pnpm_lockfile_and_installed_package_metadata",
      remoteAttestation: "not_available_in_h00_corr_004"
    },
    workspacePackages: workspacePackages.map((workspacePackage) => ({
      name: workspacePackage.name,
      version: workspacePackage.version,
      path: workspacePackage.path,
      private: workspacePackage.private,
      license: workspacePackage.license,
      internal: true
    })),
    externalPackages: Array.from(externalPackages.values()).sort(comparePackageRecords),
    directDependencies: Array.from(directDependencies).sort(),
    edges: edges.sort((a, b) => `${a.from}:${a.to}:${a.relationship}`.localeCompare(`${b.from}:${b.to}:${b.relationship}`)),
    findings: findings.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  };

  return {
    ...reportWithoutHash,
    graphHash: sha256(stableStringify(reportWithoutHash))
  };
}

export function createCycloneDxSbom(report) {
  const rootPackage = report.workspacePackages.find((workspacePackage) => workspacePackage.path === ".");
  const components = report.externalPackages.map((packageRecord) => ({
    type: "library",
    "bom-ref": packageBomRef(packageRecord),
    name: packageRecord.name,
    version: packageRecord.version,
    purl: packagePurl(packageRecord),
    licenses: [{ license: { id: packageRecord.license } }],
    externalReferences: externalReferencesFor(packageRecord),
    properties: [
      { name: "hadaf:dependency_scope", value: packageRecord.direct ? "direct" : "transitive" },
      { name: "hadaf:license_classification", value: packageRecord.licenseClassification },
      { name: "hadaf:provenance", value: "local_pnpm_lockfile_and_installed_package_metadata" }
    ]
  }));

  return {
    bomFormat: "CycloneDX",
    specVersion: "1.5",
    version: 1,
    metadata: {
      tools: [
        {
          vendor: "HAUTM",
          name: "HADAF supply-chain generator",
          version: "0.1.0"
        }
      ],
      component: {
        type: "application",
        name: rootPackage?.name ?? "hadaf",
        version: rootPackage?.version ?? "0.0.0-bootstrap",
        licenses: [{ license: { id: "UNLICENSED" } }],
        properties: [
          { name: "private", value: "true" },
          { name: "license_posture", value: "proprietary_all_rights_reserved" }
        ]
      },
      properties: [
        { name: "hadaf:supply_chain_graph_sha256", value: report.graphHash },
        { name: "hadaf:remote_provenance_attestation", value: "not_available_in_h00_corr_004" }
      ]
    },
    components,
    dependencies: createCycloneDependencies(report)
  };
}

export function createThirdPartyNotices(report) {
  const lines = [
    "# Third-Party Notices",
    "",
    "HADAF is proprietary software. This notice lists external packages currently used by this private product workspace and does not grant a public licence to HADAF.",
    "",
    `Supply-chain graph SHA-256: \`${report.graphHash}\``,
    "",
    "Remote package provenance attestation is not available in H00-CORR-004; provenance is bounded to the committed pnpm lockfile and installed package metadata.",
    "",
    "## External Packages",
    ""
  ];

  for (const packageRecord of report.externalPackages) {
    lines.push(`### ${packageRecord.name} ${packageRecord.version}`);
    lines.push("");
    lines.push(`- Licence: ${packageRecord.license}`);
    lines.push(`- Scope: ${packageRecord.direct ? "direct" : "transitive"}`);
    lines.push(`- Dependency of: ${packageRecord.dependencyOf.join(", ")}`);
    lines.push(`- Provenance: ${packageRecord.lockfile?.integrity ? "pnpm lockfile integrity and installed package metadata" : "installed package metadata only"}`);
    if (packageRecord.repository) lines.push(`- Repository: ${packageRecord.repository}`);
    if (packageRecord.homepage) lines.push(`- Homepage: ${packageRecord.homepage}`);
    lines.push("");
  }

  return `${lines.join("\n").replace(/\n+$/u, "")}\n`;
}

export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function classifyLicenseExpression(expression, options = {}) {
  if (options.internal && expression === "UNLICENSED" && options.private === true) {
    return { status: "allowed", classification: "internal_private_unlicensed" };
  }

  if (options.internal && expression === "UNLICENSED") {
    return {
      status: "failed",
      findingKind: "public_workspace_unlicensed",
      classification: "public_unlicensed",
      reason: "Only private workspace packages may use UNLICENSED"
    };
  }

  if (!expression || typeof expression !== "string") {
    return {
      status: "failed",
      findingKind: "missing_license",
      classification: "missing",
      reason: "Package metadata does not declare a license expression"
    };
  }

  if (!options.internal && expression === "UNLICENSED") {
    return {
      status: "failed",
      findingKind: "external_unlicensed_package",
      classification: "unlicensed",
      reason: "External packages may not use UNLICENSED without explicit review"
    };
  }

  try {
    const tree = parseSpdxExpression(expression);
    return evaluateLicenseNode(tree);
  } catch (error) {
    return {
      status: "failed",
      findingKind: "invalid_spdx_expression",
      classification: "invalid",
      reason: error.message
    };
  }
}

export function assertNoSupplyChainFindings(report) {
  if (report.findings.length === 0) return;
  const error = new Error("Supply-chain findings present");
  error.findings = report.findings;
  throw error;
}

function readWorkspacePackages(baseDir) {
  const rootManifest = readJson(join(baseDir, "package.json"));
  const workspacePatterns = readWorkspacePatterns(baseDir);
  const workspacePackagePaths = new Set(["."]);

  for (const pattern of workspacePatterns) {
    if (!pattern.endsWith("/*")) continue;
    const directory = join(baseDir, pattern.slice(0, -2));
    if (!existsSync(directory)) continue;

    for (const entry of readdirSync(directory)) {
      const packageJsonPath = join(directory, entry, "package.json");
      if (existsSync(packageJsonPath)) {
        workspacePackagePaths.add(relativePublicPath(baseDir, dirname(packageJsonPath)));
      }
    }
  }

  return Array.from(workspacePackagePaths)
    .sort()
    .map((packagePath) => {
      const manifest = packagePath === "." ? rootManifest : readJson(join(baseDir, packagePath, "package.json"));
      return {
        name: manifest.name,
        version: manifest.version,
        path: packagePath,
        private: manifest.private === true,
        license: manifest.license,
        manifest
      };
    });
}

function readWorkspacePatterns(baseDir) {
  const workspacePath = join(baseDir, "pnpm-workspace.yaml");
  if (!existsSync(workspacePath)) return [];
  const workspaceText = readFileSync(workspacePath, "utf8");
  const patterns = [];

  for (const line of workspaceText.split(/\r?\n/)) {
    const match = /^\s*-\s+["']?([^"']+)["']?\s*$/.exec(line);
    if (match) patterns.push(match[1]);
  }

  return patterns;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function findInstalledPackageJsonPath(baseDir, packageName, lockPackageHint = null) {
  const pnpmDirectory = join(baseDir, "node_modules", ".pnpm");
  if (lockPackageHint && existsSync(pnpmDirectory)) {
    const packageBasename = packageName.startsWith("@") ? packageName.replace("/", "+") : packageName;
    const versionedEntryPrefix = `${packageBasename}@${lockPackageHint.version}`;
    for (const entry of readdirSync(pnpmDirectory).sort()) {
      if (entry === "node_modules" || entry === "lock.yaml") continue;
      if (entry !== versionedEntryPrefix && !entry.startsWith(`${versionedEntryPrefix}_`)) continue;
      const nestedPath = join(pnpmDirectory, entry, "node_modules", packageName, "package.json");
      if (existsSync(nestedPath)) return nestedPath;
    }
  }

  const directPath = join(baseDir, "node_modules", packageName, "package.json");
  if (existsSync(directPath)) return directPath;

  if (!existsSync(pnpmDirectory)) return null;

  const candidates = [];
  for (const entry of readdirSync(pnpmDirectory)) {
    if (entry === "node_modules" || entry === "lock.yaml") continue;
    const nestedPath = join(pnpmDirectory, entry, "node_modules", packageName, "package.json");
    if (existsSync(nestedPath)) candidates.push(nestedPath);
  }

  if (candidates.length === 1) return candidates[0];
  if (candidates.length === 0) return null;
  throw new Error(`Multiple installed versions found for ${packageName}; lockfile resolver extension required`);
}

function findSingleLockPackageByName(lockPackages, packageName) {
  const matches = Array.from(lockPackages.values()).filter((lockPackage) => lockPackage.name === packageName);
  if (matches.length === 1) return matches[0];
  return null;
}

function extractLockfileVersion(lockfileText) {
  return /^lockfileVersion:\s*'?([^'\n]+)'?/m.exec(lockfileText)?.[1] ?? "unknown";
}

function extractLockPackages(lockfileText) {
  const packagesSection = extractTopLevelSection(lockfileText, "packages");
  const packageEntries = new Map();
  const entryPattern = /^  (?:'([^']+)'|([^:\n]+)):\n([\s\S]*?)(?=^  (?:'[^']+'|[^:\n]+):\n|^[A-Za-z][A-Za-z0-9_-]*:|\s*$)/gm;

  for (const match of packagesSection.matchAll(entryPattern)) {
    const key = match[1] ?? match[2];
    const parsed = splitPackageKey(key);
    if (!parsed) continue;
    packageEntries.set(`${parsed.name}@${parsed.version}`, {
      key,
      name: parsed.name,
      version: parsed.version,
      integrity: /integrity:\s*([^}\n]+)[},]?/.exec(match[3])?.[1]?.trim() ?? null
    });
  }

  return packageEntries;
}

function extractTopLevelSection(text, sectionName) {
  const startMatch = new RegExp(`^${sectionName}:\\n`, "m").exec(text);
  if (!startMatch) return "";
  const start = startMatch.index + startMatch[0].length;
  const nextSection = /^\S.*:\n/gm;
  nextSection.lastIndex = start;
  const nextMatch = nextSection.exec(text);
  return text.slice(start, nextMatch?.index ?? text.length);
}

function splitPackageKey(key) {
  const slashIndex = key.lastIndexOf("@");
  if (slashIndex <= 0) return null;
  return {
    name: key.slice(0, slashIndex),
    version: key.slice(slashIndex + 1).replace(/\(.+\)$/, "")
  };
}

function normalizeLicenseExpression(manifest) {
  if (typeof manifest.license === "string") return manifest.license;
  if (manifest.license && typeof manifest.license.type === "string") return manifest.license.type;
  if (Array.isArray(manifest.licenses) && manifest.licenses.length === 1) {
    const [license] = manifest.licenses;
    if (typeof license === "string") return license;
    if (license && typeof license.type === "string") return license.type;
  }
  return null;
}

function normalizeRepository(repository) {
  if (typeof repository === "string") return repository;
  if (repository && typeof repository.url === "string") return repository.url;
  return null;
}

function parseSpdxExpression(expression) {
  const tokens = expression.match(/\(|\)|\bAND\b|\bOR\b|\bWITH\b|[A-Za-z0-9-.+]+/g);
  if (!tokens || tokens.join("").length === 0) throw new Error("empty license expression");
  if (tokens.join("").length !== expression.replace(/\s+/g, "").length) {
    throw new Error("license expression contains unsupported characters");
  }
  let index = 0;

  function peek() {
    return tokens[index];
  }

  function consume(expected) {
    const token = tokens[index];
    if (expected && token !== expected) throw new Error(`expected ${expected} but found ${token ?? "end"}`);
    index += 1;
    return token;
  }

  function parsePrimary() {
    if (peek() === "(") {
      consume("(");
      const node = parseOr();
      consume(")");
      return node;
    }
    const token = consume();
    if (!token || ["AND", "OR", "WITH", ")"].includes(token)) throw new Error(`unexpected token ${token ?? "end"}`);
    return { type: "license", id: token };
  }

  function parseWith() {
    let node = parsePrimary();
    if (peek() === "WITH") {
      consume("WITH");
      const exception = consume();
      if (!exception || ["AND", "OR", "WITH", "(", ")"].includes(exception)) throw new Error("missing license exception");
      node = { type: "with", base: node, exception };
    }
    return node;
  }

  function parseAnd() {
    let node = parseWith();
    while (peek() === "AND") {
      consume("AND");
      node = { type: "and", left: node, right: parseWith() };
    }
    return node;
  }

  function parseOr() {
    let node = parseAnd();
    while (peek() === "OR") {
      consume("OR");
      node = { type: "or", left: node, right: parseAnd() };
    }
    return node;
  }

  const tree = parseOr();
  if (index !== tokens.length) throw new Error(`unexpected trailing token ${tokens[index]}`);
  return tree;
}

function evaluateLicenseNode(node) {
  if (node.type === "license") return classifyAtomicLicense(node.id);

  if (node.type === "with") {
    const base = evaluateLicenseNode(node.base);
    if (base.status !== "allowed") return base;
    if (knownLicenseExceptions.has(node.exception)) {
      return {
        status: "failed",
        findingKind: "license_exception_requires_review",
        classification: "custom_exception",
        reason: `License exception ${node.exception} requires explicit approval`
      };
    }
    return {
      status: "failed",
      findingKind: "unknown_license_exception",
      classification: "unknown_exception",
      reason: `Unknown license exception ${node.exception}`
    };
  }

  if (node.type === "and") {
    const left = evaluateLicenseNode(node.left);
    const right = evaluateLicenseNode(node.right);
    if (left.status === "allowed" && right.status === "allowed") {
      return { status: "allowed", classification: "permissive_conjunction" };
    }
    return left.status !== "allowed" ? left : right;
  }

  if (node.type === "or") {
    const left = evaluateLicenseNode(node.left);
    const right = evaluateLicenseNode(node.right);
    if (left.status === "allowed" || right.status === "allowed") {
      return { status: "allowed", classification: "permissive_alternative" };
    }
    return left;
  }

  throw new Error(`unknown SPDX node ${node.type}`);
}

function classifyAtomicLicense(id) {
  if (allowedPermissiveLicenses.has(id)) return { status: "allowed", classification: "permissive" };
  if (weakCopyleftLicenses.has(id)) {
    return {
      status: "failed",
      findingKind: "weak_copyleft_requires_approval",
      classification: "weak_copyleft",
      reason: `Weak copyleft license ${id} requires explicit approval`
    };
  }
  if (strongCopyleftLicenses.has(id)) {
    return {
      status: "failed",
      findingKind: "strong_copyleft_blocked",
      classification: "strong_copyleft",
      reason: `Strong copyleft license ${id} is blocked without explicit approval`
    };
  }
  if (/^LicenseRef-/i.test(id)) {
    return {
      status: "failed",
      findingKind: "custom_license_requires_review",
      classification: "custom",
      reason: `Custom license ${id} requires explicit review`
    };
  }
  return {
    status: "failed",
    findingKind: "unknown_license",
    classification: "unknown",
    reason: `Unknown license ${id}`
  };
}

function createCycloneDependencies(report) {
  const dependencyByRef = new Map();
  const rootRef = report.workspacePackages.find((workspacePackage) => workspacePackage.path === ".")?.name ?? "hadaf";
  dependencyByRef.set(rootRef, new Set());

  for (const packageRecord of report.externalPackages) {
    dependencyByRef.set(packageBomRef(packageRecord), new Set());
  }

  for (const edge of report.edges) {
    const fromPackage = report.externalPackages.find((packageRecord) => packageRecord.packageKey === edge.from);
    const toPackage = report.externalPackages.find((packageRecord) => packageRecord.name === edge.to);
    if (!toPackage) continue;

    const fromRef = fromPackage ? packageBomRef(fromPackage) : rootRef;
    dependencyByRef.get(fromRef)?.add(packageBomRef(toPackage));
  }

  return Array.from(dependencyByRef, ([ref, dependsOn]) => ({
    ref,
    dependsOn: Array.from(dependsOn).sort()
  })).sort((a, b) => a.ref.localeCompare(b.ref));
}

function externalReferencesFor(packageRecord) {
  const references = [];
  if (packageRecord.repository) references.push({ type: "vcs", url: packageRecord.repository });
  if (packageRecord.homepage) references.push({ type: "website", url: packageRecord.homepage });
  return references;
}

function packageBomRef(packageRecord) {
  return `pkg:npm/${encodeURIComponent(packageRecord.name)}@${packageRecord.version}`;
}

function packagePurl(packageRecord) {
  return packageBomRef(packageRecord);
}

function comparePackageRecords(a, b) {
  return a.packageKey.localeCompare(b.packageKey);
}

function relativePublicPath(baseDir, path) {
  return path.startsWith(`${baseDir}/`) ? path.slice(baseDir.length + 1) : path;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function runSelfTest() {
  const graphFixtureResults = runGraphSelfTestFixtures();
  const checks = [
    ["unknown license fails", classifyLicenseExpression("Not-A-License", { internal: false }).findingKind === "unknown_license"],
    ["missing license fails", classifyLicenseExpression(null, { internal: false }).findingKind === "missing_license"],
    ["weak copyleft escalates", classifyLicenseExpression("MPL-2.0", { internal: false }).findingKind === "weak_copyleft_requires_approval"],
    ["strong copyleft blocks", classifyLicenseExpression("GPL-3.0-only", { internal: false }).findingKind === "strong_copyleft_blocked"],
    ["custom license escalates", classifyLicenseExpression("LicenseRef-Proprietary", { internal: false }).findingKind === "custom_license_requires_review"],
    ["permissive OR passes", classifyLicenseExpression("GPL-3.0-only OR MIT", { internal: false }).status === "allowed"],
    ["permissive AND passes", classifyLicenseExpression("MIT AND Apache-2.0", { internal: false }).status === "allowed"],
    ["private workspace UNLICENSED allowed", classifyLicenseExpression("UNLICENSED", { internal: true, private: true }).status === "allowed"],
    ["public workspace UNLICENSED fails", classifyLicenseExpression("UNLICENSED", { internal: true, private: false }).findingKind === "public_workspace_unlicensed"],
    ["external UNLICENSED fails", classifyLicenseExpression("UNLICENSED", { internal: false }).findingKind === "external_unlicensed_package"],
    ["malformed SPDX suffix fails", classifyLicenseExpression("MIT/", { internal: false }).findingKind === "invalid_spdx_expression"],
    ["malformed SPDX wildcard fails", classifyLicenseExpression("MIT*", { internal: false }).findingKind === "invalid_spdx_expression"],
    ["lockfile parser captures final package", extractLockPackages("packages:\n  alpha@1.0.0:\n    resolution: {}\n  beta@1.0.0:\n    resolution: {}\n").has("beta@1.0.0")],
    ["missing package metadata fails", graphFixtureResults.missingMetadata],
    ["unlisted transitive dependency fails", graphFixtureResults.unlistedTransitive],
    ["external unknown package license fails", graphFixtureResults.unknownExternalLicense],
    ["private UNLICENSED workspace fixture passes", graphFixtureResults.privateWorkspace],
    ["public UNLICENSED workspace fixture fails", graphFixtureResults.publicWorkspaceUnlicensed]
  ];
  const failures = checks.filter(([, passed]) => !passed).map(([name]) => name);

  if (failures.length > 0) {
    console.error(JSON.stringify({ status: "failed", check: "dependency_license_self_test", failures }, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify({ status: "passed", check: "dependency_license_self_test", fixtures: checks.length }));
}

function runGraphSelfTestFixtures() {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "hadaf-supply-chain-fixture-"));
  try {
    writeWorkspace(fixtureRoot, {
      rootDependencies: { missing: "1.0.0" },
      lockPackages: ["missing@1.0.0"],
      installedPackages: []
    });
    const missingMetadata = buildSupplyChainReport(fixtureRoot).findings.some((finding) => finding.kind === "missing_package_metadata");

    writeWorkspace(fixtureRoot, {
      rootDependencies: { alpha: "1.0.0" },
      lockPackages: ["alpha@1.0.0"],
      installedPackages: [
        { name: "alpha", version: "1.0.0", license: "MIT", dependencies: { beta: "1.0.0" } },
        { name: "beta", version: "1.0.0", license: "MIT" }
      ]
    });
    const unlistedTransitive = buildSupplyChainReport(fixtureRoot).findings.some((finding) => finding.kind === "lockfile_package_missing" && finding.packageName === "beta");

    writeWorkspace(fixtureRoot, {
      rootDependencies: { mystery: "1.0.0" },
      lockPackages: ["mystery@1.0.0"],
      installedPackages: [{ name: "mystery", version: "1.0.0", license: "Not-A-License" }]
    });
    const unknownExternalLicense = buildSupplyChainReport(fixtureRoot).findings.some((finding) => finding.kind === "unknown_license" && finding.packageName === "mystery");

    writeWorkspace(fixtureRoot, {
      rootDependencies: {},
      lockPackages: [],
      installedPackages: []
    });
    const privateWorkspace = buildSupplyChainReport(fixtureRoot).findings.length === 0;

    writeWorkspace(fixtureRoot, {
      rootDependencies: {},
      lockPackages: [],
      installedPackages: [],
      rootPrivate: false
    });
    const publicWorkspaceUnlicensed = buildSupplyChainReport(fixtureRoot).findings.some((finding) => finding.kind === "workspace_license_invalid" && finding.packageName === "fixture-root");

    return {
      missingMetadata,
      unlistedTransitive,
      unknownExternalLicense,
      privateWorkspace,
      publicWorkspaceUnlicensed
    };
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

function writeWorkspace(baseDir, options) {
  rmSync(baseDir, { recursive: true, force: true });
  mkdirSync(baseDir, { recursive: true });
  mkdirSync(join(baseDir, "node_modules"), { recursive: true });

  writeFileSync(
    join(baseDir, "package.json"),
    `${JSON.stringify(
      {
        name: "fixture-root",
        version: "0.0.0",
        private: options.rootPrivate ?? true,
        license: "UNLICENSED",
        packageManager: "pnpm@10.34.4",
        devDependencies: options.rootDependencies
      },
      null,
      2
    )}\n`
  );
  writeFileSync(join(baseDir, "pnpm-workspace.yaml"), "packages: []\n");
  writeFileSync(join(baseDir, "pnpm-lock.yaml"), createFixtureLockfile(options.lockPackages));

  for (const packageRecord of options.installedPackages) {
    const packageDirectory = join(baseDir, "node_modules", packageRecord.name);
    mkdirSync(packageDirectory, { recursive: true });
    writeFileSync(
      join(packageDirectory, "package.json"),
      `${JSON.stringify(
        {
          name: packageRecord.name,
          version: packageRecord.version,
          license: packageRecord.license,
          dependencies: packageRecord.dependencies
        },
        null,
        2
      )}\n`
    );
  }
}

function createFixtureLockfile(packageKeys) {
  const packageEntries = packageKeys
    .map((packageKey) => `  ${packageKey}:\n    resolution: {integrity: sha512-fixture}\n`)
    .join("\n");
  const snapshotEntries = packageKeys
    .map((packageKey) => `  ${packageKey}: {}\n`)
    .join("\n");

  return `lockfileVersion: '9.0'\n\nimporters:\n\n  .:\n    devDependencies: {}\n\npackages:\n\n${packageEntries}\nsnapshots:\n\n${snapshotEntries}`;
}

function main() {
  if (process.argv.includes("--self-test")) {
    runSelfTest();
    return;
  }

  const report = buildSupplyChainReport(rootDir);
  if (report.findings.length > 0) {
    console.error(JSON.stringify({ status: "failed", check: "dependency_licenses", graphHash: report.graphHash, findings: report.findings }, null, 2));
    process.exit(1);
  }

  console.log(
    JSON.stringify({
      status: "passed",
      check: "dependency_licenses",
      graphHash: report.graphHash,
      reviewed: report.externalPackages.map((packageRecord) => ({
        packageName: packageRecord.name,
        version: packageRecord.version,
        license: packageRecord.license,
        scope: packageRecord.direct ? "direct" : "transitive"
      }))
    })
  );
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
