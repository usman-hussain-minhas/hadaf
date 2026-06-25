import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertNoSupplyChainFindings,
  buildSupplyChainReport,
  createCycloneDxSbom,
  createThirdPartyNotices,
  stableStringify
} from "./check-dependency-licenses.mjs";

const rootDir = fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/, "");
const sbomPath = join(rootDir, "sbom.cdx.json");
const noticesPath = join(rootDir, "THIRD_PARTY_NOTICES.md");

const report = buildSupplyChainReport(rootDir);
assertNoSupplyChainFindings(report);

const sbomContent = `${JSON.stringify(createCycloneDxSbom(report), null, 2)}\n`;
const noticesContent = createThirdPartyNotices(report);

if (process.argv.includes("--print-graph")) {
  console.log(stableStringify(report));
  process.exit(0);
}

if (process.argv.includes("--check")) {
  const findings = [];
  if (readExisting(sbomPath) !== sbomContent) {
    findings.push({ path: "sbom.cdx.json", kind: "sbom_drift" });
  }
  if (readExisting(noticesPath) !== noticesContent) {
    findings.push({ path: "THIRD_PARTY_NOTICES.md", kind: "third_party_notices_drift" });
  }

  if (findings.length > 0) {
    console.error(JSON.stringify({ status: "failed", check: "supply_chain_artifact_drift", graphHash: report.graphHash, findings }, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify({ status: "passed", check: "supply_chain_artifact_drift", graphHash: report.graphHash }));
  process.exit(0);
}

writeFileSync(sbomPath, sbomContent);
writeFileSync(noticesPath, noticesContent);
console.log(JSON.stringify({ status: "generated", check: "supply_chain_artifacts", graphHash: report.graphHash, artifacts: ["sbom.cdx.json", "THIRD_PARTY_NOTICES.md"] }));

function readExisting(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}
