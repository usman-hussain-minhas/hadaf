import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const hmcDir = join(rootDir, "apps", "hmc");
const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"]
]);

if (process.argv.includes("--smoke")) {
  const result = await runSmoke();
  console.log(JSON.stringify(result));
  process.exit(result.status === "passed" ? 0 : 1);
}

const port = Number(process.env.HMC_PORT ?? 4173);
const server = createHmcServer();
server.listen(port, "127.0.0.1", () => {
  console.log(`HADAF HMC listening on http://127.0.0.1:${port}`);
});

function createHmcServer() {
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const filePath = resolveRequestPath(url.pathname);
      const body = await readFile(filePath);
      response.writeHead(200, {
        "content-type": contentTypes.get(extname(filePath)) ?? "application/octet-stream",
        "cache-control": "no-store"
      });
      response.end(body);
    } catch (error) {
      response.writeHead(404, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({
        status: "not_found",
        detail: error instanceof Error ? error.message : "unknown"
      }));
    }
  });
}

function resolveRequestPath(pathname) {
  const requested = pathname === "/" || pathname === "/hmc"
    ? "index.html"
    : pathname.replace(/^\/+/u, "");
  const normalized = normalize(requested);
  if (normalized.startsWith("..")) {
    throw new Error("request escapes HMC root");
  }
  return join(hmcDir, normalized);
}

async function runSmoke() {
  const server = createHmcServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const base = `http://127.0.0.1:${port}`;
  try {
    const [html, css, js, stateJson] = await Promise.all([
      fetchText(`${base}/`),
      fetchText(`${base}/styles.css`),
      fetchText(`${base}/app.js`),
      fetchText(`${base}/state.fixture.json`)
    ]);
    const findings = [
      ...requireIncludes(html, [
        "HADAF Mission Control",
        "H08 Git, CI, PR, and Merge Conductor",
        "H08_GIT_CI_PR_CONDUCTOR_PROJECTION_ACTIVE_FIXTURE_BACKED",
        "H02-F04-R1",
        "H03-F06",
        "H04-F06",
        "H05-F04",
        "H06-F05",
        "H08-F06",
        "fixture_backed",
        "mocked",
        "for_human_review",
        "execution_not_authorized",
        "derived_view_only",
        "Agents",
        "Registry Projection",
        "Runtime",
        "Lifecycle Projection",
        "CI and PR Projection",
        "Worktree registry",
        "Checkpoint chain",
        "Quarantine records",
        "Pod scheduler",
        "Bounded dogfood conductor envelope",
        "Bootstrap Execution Adapter",
        "runtime_circuit_breaker_enforcement",
        "runtime_upskill_enforcement",
        "live_autonomous_worktree_orchestration",
        "live_lifecycle_runner_execution",
        "H08_git_ci_pr_merge_conductor_implemented",
        "github_settings_mutation_authorized",
        "branch_protection_mutation_authorized",
        "H13_system_assurance_engine_implemented",
        "self_hosting_ready",
        "HMC_authoritative_state",
        "h06_box_assurance_complete",
        "Product Preview",
        "H03 Box assurance pending",
        "H06 runtime projection",
        "Generated state stale"
      ]),
      ...requireIncludes(css, [".app-shell", "@media", "--teal"]),
      ...requireIncludes(js, ["setView", "aria-pressed", "state.fixture.json", "constitution-status", "h04-status", "h06-status", "h08-status"]),
      ...requireIncludes(stateJson, [
        "adapterMaturity",
        "fixture_backed",
        "H08-F06 HMC Git/CI/PR conductor projection",
        "product_pipeline_active",
        "codex.bootstrap",
        "circuitBreakerStatus",
        "worktreeStatus",
        "podStatus",
        "liveProviderStatus",
        "gitTruthStatus",
        "bounded_envelope_verified",
        "limited_current_repo",
        "fixture_projected",
        "derived_view_only"
      ])
    ];
    await assertFile(join(hmcDir, "index.html"));
    await assertFile(join(hmcDir, "styles.css"));
    await assertFile(join(hmcDir, "app.js"));
    return {
      status: findings.length === 0 ? "passed" : "failed",
      check: "hmc_static_smoke",
      findings,
      cannot_claim: [
        "live_github_adapter_implemented",
        "live_h03_control_adapter_implemented",
        "persistent_state_store_implemented",
        "HMC_authoritative_state",
        "constitution_approved_by_human",
        "execution_authorization_granted",
        "browser_accessibility_complete",
        "browser_performance_complete"
      ]
    };
  } finally {
    server.close();
  }
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.text();
}

function requireIncludes(text, expectedValues) {
  return expectedValues
    .filter((value) => !text.includes(value))
    .map((value) => ({ kind: "missing_expected_text", value }));
}

async function assertFile(path) {
  const file = await stat(path);
  if (!file.isFile()) {
    throw new Error(`${path} is not a file`);
  }
}
