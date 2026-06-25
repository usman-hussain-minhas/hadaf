const field = (name) => document.querySelector(`[data-preview-field="${name}"]`);

loadPreviewState().catch((error) => {
  document.documentElement.dataset.previewState = "failed";
  const maturity = field("maturity");
  if (maturity) maturity.textContent = "fixture_missing";
  console.error(error);
});

async function loadPreviewState() {
  const response = await fetch("./state.fixture.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`Preview state HTTP ${response.status}`);
  const state = await response.json();
  document.documentElement.dataset.previewState = "fixture_backed";

  field("name").textContent = state.preview.name;
  field("maturity").textContent = state.preview.maturity;
  field("publication").textContent = state.preview.publicationStatus;
  field("target").textContent = `${state.preview.targetBox} ${state.preview.targetFfet}`;

  const sources = field("sources");
  sources.replaceChildren(...state.stateSources.map((source) => {
    const item = document.createElement("li");
    const label = document.createElement("strong");
    const maturity = document.createElement("span");
    label.textContent = source.label;
    maturity.textContent = source.maturity;
    item.append(label, maturity);
    return item;
  }));

  const cannotClaim = field("cannot-claim");
  cannotClaim.replaceChildren(...state.cannotClaim.map((claim) => {
    const item = document.createElement("li");
    item.textContent = claim;
    return item;
  }));

  if (state.cannotClaim.includes("production_connected_preview")) {
    document.documentElement.dataset.previewProduction = "production_connected_preview_blocked";
  }
}
