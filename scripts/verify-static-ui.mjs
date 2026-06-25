import { readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const maxSurfaceBytes = 120_000;

if (process.argv.includes("--self-test")) {
  runSelfTest();
  process.exit(0);
}

const report = await verifyStaticUi();
console.log(JSON.stringify(report, null, 2));
process.exit(report.status === "passed" ? 0 : 1);

async function verifyStaticUi() {
  const surfaces = [
    {
      id: "hmc",
      dir: join(rootDir, "apps", "hmc"),
      requiredText: [
        "HADAF Mission Control",
        "Generated state stale",
        "HMC_authoritative_state",
        "browser_accessibility_complete",
        "browser_performance_complete"
      ],
      requiredCssTokens: ["--teal", "--amber", "--blue", "--green"],
      requiredStateText: ["fixture_backed", "H02-F04 Static assurance", "generated_state_not_fresh"]
    },
    {
      id: "product_preview",
      dir: join(rootDir, "apps", "product-preview"),
      requiredText: [
        "HADAF Product Preview",
        "production_connected blocked",
        "production_connected_preview",
        "public_preview_deployed",
        "persistent_preview_state",
        "browser_accessibility_complete",
        "browser_performance_complete"
      ],
      requiredCssTokens: ["--teal", "--amber", "--blue", "--green"],
      requiredStateText: ["fixture_backed", "local_only", "production_connected_preview"]
    }
  ];

  const surfaceReports = [];
  for (const surface of surfaces) {
    surfaceReports.push(await verifySurface(surface));
  }

  const findings = surfaceReports.flatMap((surface) => surface.findings);
  return {
    status: findings.length === 0 ? "passed" : "failed",
    check: "local_static_accessibility_smoke",
    surface_reports: surfaceReports,
    findings,
    cannot_claim: [
      "browser_accessibility_complete",
      "browser_performance_complete",
      "screen_reader_complete",
      "keyboard_traversal_complete"
    ]
  };
}

async function verifySurface(surface) {
  const htmlPath = join(surface.dir, "index.html");
  const cssPath = join(surface.dir, "styles.css");
  const jsPath = join(surface.dir, "app.js");
  const statePath = join(surface.dir, "state.fixture.json");
  const [html, css, js, stateText] = await Promise.all([
    readFile(htmlPath, "utf8"),
    readFile(cssPath, "utf8"),
    readFile(jsPath, "utf8"),
    readFile(statePath, "utf8")
  ]);
  const sizes = await Promise.all([stat(htmlPath), stat(cssPath), stat(jsPath), stat(statePath)]);
  const totalBytes = sizes.reduce((sum, file) => sum + file.size, 0);
  const findings = [
    ...verifyHtml(surface.id, html),
    ...verifyCss(surface.id, css, surface.requiredCssTokens),
    ...verifyRequiredText(surface.id, "html", html, surface.requiredText),
    ...verifyRequiredText(surface.id, "state", stateText, surface.requiredStateText),
    ...verifyNoPrivatePaths(surface.id, `${html}\n${css}\n${js}\n${stateText}`),
    ...verifyAssetBudget(surface.id, totalBytes)
  ];

  return {
    surface: surface.id,
    status: findings.length === 0 ? "passed" : "failed",
    total_bytes: totalBytes,
    findings
  };
}

function verifyHtml(surfaceId, html) {
  const findings = [];
  if (!/<title>[^<]+<\/title>/iu.test(html)) findings.push(finding(surfaceId, "missing_title"));
  if (!/<main\b/iu.test(html)) findings.push(finding(surfaceId, "missing_main_landmark"));
  if (!/<h1\b[^>]*>/iu.test(html)) findings.push(finding(surfaceId, "missing_h1"));
  if (!/<header\b/iu.test(html)) findings.push(finding(surfaceId, "missing_header_landmark"));
  if (!/aria-label=|aria-labelledby=/iu.test(html)) findings.push(finding(surfaceId, "missing_accessible_labels"));

  for (const control of findElements(html, "button")) {
    if (!hasAccessibleName(control)) findings.push(finding(surfaceId, "control_without_accessible_name", "button"));
  }
  for (const link of findElements(html, "a")) {
    if (!hasAccessibleName(link)) findings.push(finding(surfaceId, "control_without_accessible_name", "a"));
  }
  if (/production_connected(?![\s_,-]*(blocked|preview))/iu.test(html)) {
    findings.push(finding(surfaceId, "production_connected_overclaim"));
  }
  return findings;
}

function verifyCss(surfaceId, css, requiredTokens) {
  const findings = [];
  for (const token of requiredTokens) {
    if (!css.includes(token)) findings.push(finding(surfaceId, "missing_color_token", token));
  }
  if (!/@media\b/iu.test(css)) findings.push(finding(surfaceId, "missing_responsive_media_query"));
  return findings;
}

function verifyRequiredText(surfaceId, location, text, requiredValues) {
  return requiredValues
    .filter((value) => !text.includes(value))
    .map((value) => finding(surfaceId, "missing_required_text", `${location}:${value}`));
}

function verifyNoPrivatePaths(surfaceId, text) {
  const patterns = [
    /\/Volumes\/[^\s"'`<>)\]}]+/iu,
    /\/Users\/[^\s"'`<>)\]}]+/iu,
    /file:\/\/\/?(Users|Volumes)\//iu,
    /\binput:\/\/[^\s"'`<>)\]}]+/iu
  ];
  return patterns.some((pattern) => pattern.test(text))
    ? [finding(surfaceId, "private_or_forbidden_path")]
    : [];
}

function verifyAssetBudget(surfaceId, totalBytes) {
  return totalBytes > maxSurfaceBytes
    ? [finding(surfaceId, "asset_budget_exceeded", `${totalBytes} > ${maxSurfaceBytes}`)]
    : [];
}

function findElements(html, tagName) {
  return [...html.matchAll(new RegExp(`<${tagName}\\b[\\s\\S]*?<\\/${tagName}>`, "giu"))].map((match) => match[0]);
}

function hasAccessibleName(element) {
  if (/aria-label=["'][^"']+["']/iu.test(element)) return true;
  const text = element
    .replace(/<[^>]+>/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  return text.length > 0;
}

function finding(surface, kind, detail) {
  return detail ? { surface, kind, detail } : { surface, kind };
}

function runSelfTest() {
  const missingTitle = verifyHtml("fixture", "<main><h1>Title</h1><button>Go</button></main>");
  const missingMain = verifyHtml("fixture", "<title>T</title><header></header><h1>Title</h1>");
  const unnamedButton = verifyHtml("fixture", "<title>T</title><header></header><main><h1>T</h1><button><span aria-hidden=\"true\"></span></button></main>");
  const missingCannot = verifyRequiredText("fixture", "html", "<main></main>", ["browser_accessibility_complete"]);
  const budget = verifyAssetBudget("fixture", maxSurfaceBytes + 1);
  const kinds = new Set([
    ...missingTitle,
    ...missingMain,
    ...unnamedButton,
    ...missingCannot,
    ...budget
  ].map((item) => item.kind));
  const failures = [];
  if (!kinds.has("missing_title")) failures.push("missing_title_not_detected");
  if (!kinds.has("missing_main_landmark")) failures.push("missing_main_not_detected");
  if (!kinds.has("control_without_accessible_name")) failures.push("unnamed_control_not_detected");
  if (!kinds.has("missing_required_text")) failures.push("missing_required_text_not_detected");
  if (!kinds.has("asset_budget_exceeded")) failures.push("asset_budget_not_detected");

  if (failures.length > 0) {
    console.error(JSON.stringify({ status: "failed", check: "static_ui_self_test", failures }, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify({ status: "passed", check: "static_ui_self_test", negativeFixtures: failures.length + 5 }));
}
