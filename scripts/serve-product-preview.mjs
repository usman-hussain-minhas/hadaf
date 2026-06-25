import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const previewDir = join(rootDir, "apps", "product-preview");
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

const port = Number(process.env.PREVIEW_PORT ?? 4174);
const server = createPreviewServer();
server.listen(port, "127.0.0.1", () => {
  console.log(`HADAF Product Preview listening on http://127.0.0.1:${port}`);
});

function createPreviewServer() {
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
  const requested = pathname === "/" || pathname === "/preview"
    ? "index.html"
    : pathname.replace(/^\/+/u, "");
  const normalized = normalize(requested);
  if (normalized.startsWith("..")) {
    throw new Error("request escapes Product Preview root");
  }
  return join(previewDir, normalized);
}

async function runSmoke() {
  const server = createPreviewServer();
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
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
        "HADAF Product Preview",
        "fixture_backed",
        "production_connected blocked",
        "public_preview_deployed",
        "persistent_preview_state",
        "browser_accessibility_complete"
      ]),
      ...requireIncludes(css, [".preview-shell", "@media", "--teal"]),
      ...requireIncludes(js, ["state.fixture.json", "production_connected_preview"]),
      ...requireIncludes(stateJson, ["publicationStatus", "local_only", "production_connected_preview"])
    ];
    await assertFile(join(previewDir, "index.html"));
    await assertFile(join(previewDir, "styles.css"));
    await assertFile(join(previewDir, "app.js"));
    return {
      status: findings.length === 0 ? "passed" : "failed",
      check: "product_preview_static_smoke",
      findings,
      cannot_claim: [
        "production_connected_preview",
        "public_preview_deployed",
        "persistent_preview_state",
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
