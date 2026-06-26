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
  const activeBox = document.querySelector("[data-state-field='active-box']");
  if (activeBox) {
    activeBox.textContent = state.activeBox;
  }
  const projectPosture = document.querySelector("[data-state-field='project-posture']");
  if (projectPosture) {
    projectPosture.textContent = state.projectPosture;
  }
  const constitutionStatus = document.querySelector("[data-state-field='constitution-status']");
  if (constitutionStatus) {
    constitutionStatus.textContent = state.h03Projection.deliveryConstitution.readinessStatus;
  }
  const approvalStatus = document.querySelector("[data-state-field='approval-status']");
  if (approvalStatus) {
    approvalStatus.textContent = state.h03Projection.deliveryConstitution.approvalStatus;
  }
  const executionStatus = document.querySelector("[data-state-field='execution-status']");
  if (executionStatus) {
    executionStatus.textContent = state.h03Projection.deliveryConstitution.executionAuthorized
      ? "execution_authorized"
      : "execution_not_authorized";
  }
  const projectionAuthority = document.querySelector("[data-state-field='projection-authority']");
  if (projectionAuthority) {
    projectionAuthority.textContent = state.h03Projection.authority;
  }
  const h04Status = document.querySelector("[data-state-field='h04-status']");
  if (h04Status) {
    h04Status.textContent = state.h04Projection.status;
  }
  const h04Ledger = document.querySelector("[data-state-field='h04-ledger']");
  if (h04Ledger) {
    h04Ledger.textContent = state.h04Projection.truthLedgerStatus;
  }
  const h04Finalizer = document.querySelector("[data-state-field='h04-finalizer']");
  if (h04Finalizer) {
    h04Finalizer.textContent = state.h04Projection.finalizerStatus;
  }
  const h04Gate = document.querySelector("[data-state-field='h04-successor-gate']");
  if (h04Gate) {
    h04Gate.textContent = state.h04Projection.successorGate;
  }
  const h04ActiveFfet = document.querySelector("[data-state-field='h04-active-ffet']");
  if (h04ActiveFfet) {
    h04ActiveFfet.textContent = state.h04Projection.activeFfet;
  }
  const h04ProjectionAuthority = document.querySelector("[data-state-field='h04-projection-authority']");
  if (h04ProjectionAuthority) {
    h04ProjectionAuthority.textContent = state.h04Projection.authority;
  }
  const mismatch = document.querySelector("[data-state-field='classified-mismatch']");
  if (mismatch) {
    mismatch.textContent = state.classifiedMismatch;
  }
}
