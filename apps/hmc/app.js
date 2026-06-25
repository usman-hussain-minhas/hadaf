const navItems = Array.from(document.querySelectorAll("[data-view]"));
const panels = Array.from(document.querySelectorAll("[data-view-panel]"));
const links = Array.from(document.querySelectorAll("[data-view-link]"));

function setView(view) {
  for (const item of navItems) {
    const selected = item.dataset.view === view;
    item.classList.toggle("is-active", selected);
    item.setAttribute("aria-pressed", String(selected));
  }
  for (const panel of panels) {
    const selected = panel.dataset.viewPanel === view;
    panel.classList.toggle("is-active", selected);
    panel.hidden = !selected;
  }
  if (location.hash !== `#${view}`) {
    history.replaceState(null, "", `#${view}`);
  }
}

for (const item of navItems) {
  item.addEventListener("click", () => {
    setView(item.dataset.view);
  });
}

for (const link of links) {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    setView(link.dataset.viewLink);
  });
}

const initialView = location.hash.replace("#", "") || "project";
if (panels.some((panel) => panel.dataset.viewPanel === initialView)) {
  setView(initialView);
}

loadFixtureState().catch(() => {
  document.documentElement.dataset.hmcState = "fixture_unavailable";
});

async function loadFixtureState() {
  const response = await fetch("./state.fixture.json", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`HMC fixture state failed with HTTP ${response.status}`);
  }
  const state = await response.json();
  document.documentElement.dataset.hmcState = state.adapterStatus;
  const adapterStatus = document.querySelector("[data-state-field='adapter-status']");
  if (adapterStatus) {
    adapterStatus.textContent = `${state.adapterMaturity} adapter`;
  }
  const activeFfet = document.querySelector("[data-state-field='active-ffet']");
  if (activeFfet) {
    activeFfet.textContent = state.activeFfet;
  }
  const mismatch = document.querySelector("[data-state-field='classified-mismatch']");
  if (mismatch) {
    mismatch.textContent = state.classifiedMismatch;
  }
}
