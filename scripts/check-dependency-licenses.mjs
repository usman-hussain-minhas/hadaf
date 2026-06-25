import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const expectedLicenses = new Map([
  ["typescript", "Apache-2.0"],
  ["@types/node", "MIT"],
  ["undici-types", "MIT"]
]);
const allowedLicenses = new Set([
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
const findings = [];

for (const [packageName, expectedLicense] of expectedLicenses) {
  const packageJsonPath = findPackageJsonPath(packageName);
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  const actualLicense = packageJson.license;

  if (actualLicense !== expectedLicense) {
    findings.push({
      packageName,
      expectedLicense,
      actualLicense,
      kind: "unexpected_license"
    });
    continue;
  }

  if (!allowedLicenses.has(actualLicense)) {
    findings.push({
      packageName,
      actualLicense,
      kind: "license_not_allowed"
    });
  }
}

if (findings.length > 0) {
  console.error(JSON.stringify({ status: "failed", check: "dependency_licenses", findings }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify({
    status: "passed",
    check: "dependency_licenses",
    reviewed: Array.from(expectedLicenses, ([packageName, license]) => ({ packageName, license }))
  })
);

function findPackageJsonPath(packageName) {
  const directPath = join("node_modules", packageName, "package.json");
  if (existsSync(directPath)) return directPath;

  const pnpmDirectory = join("node_modules", ".pnpm");
  const packageBasename = packageName.startsWith("@")
    ? packageName.replace("/", "+")
    : packageName;

  for (const entry of readdirSync(pnpmDirectory)) {
    if (!entry.startsWith(`${packageBasename}@`)) continue;
    const nestedPath = join(pnpmDirectory, entry, "node_modules", packageName, "package.json");
    if (existsSync(nestedPath)) return nestedPath;
  }

  throw new Error(`Unable to locate installed package metadata for ${packageName}`);
}
