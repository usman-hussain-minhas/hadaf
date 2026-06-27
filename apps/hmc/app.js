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
  const h05Status = document.querySelector("[data-state-field='h05-status']");
  if (h05Status) {
    h05Status.textContent = state.h05Projection.status;
  }
  const h05AgentCount = document.querySelector("[data-state-field='h05-agent-count']");
  if (h05AgentCount) {
    h05AgentCount.textContent = String(state.h05Projection.agentCount);
  }
  const h05Registry = document.querySelector("[data-state-field='h05-registry']");
  if (h05Registry) {
    h05Registry.textContent = state.h05Projection.registryStatus;
  }
  const h05Capabilities = document.querySelector("[data-state-field='h05-capabilities']");
  if (h05Capabilities) {
    h05Capabilities.textContent = state.h05Projection.capabilityStatus;
  }
  const h05CircuitBreakers = document.querySelector("[data-state-field='h05-circuit-breakers']");
  if (h05CircuitBreakers) {
    h05CircuitBreakers.textContent = state.h05Projection.circuitBreakerStatus;
  }
  const h05Upskill = document.querySelector("[data-state-field='h05-upskill']");
  if (h05Upskill) {
    h05Upskill.textContent = state.h05Projection.upskillStatus;
  }
  const h05ActiveFfet = document.querySelector("[data-state-field='h05-active-ffet']");
  if (h05ActiveFfet) {
    h05ActiveFfet.textContent = state.h05Projection.activeFfet;
  }
  const h05ProjectionAuthority = document.querySelector("[data-state-field='h05-projection-authority']");
  if (h05ProjectionAuthority) {
    h05ProjectionAuthority.textContent = state.h05Projection.authority;
  }
  const h05AgentList = document.querySelector("[data-state-field='h05-agent-list']");
  if (h05AgentList) {
    h05AgentList.replaceChildren(
      ...state.h05Projection.agents.map((agent) => {
        const item = document.createElement("li");
        item.innerHTML = `<strong></strong><span></span>`;
        item.querySelector("strong").textContent = agent.title;
        item.querySelector("span").textContent = `${agent.qualificationStatus} / ${agent.boundedUseStatus}`;
        return item;
      })
    );
  }
  const h06Status = document.querySelector("[data-state-field='h06-status']");
  if (h06Status) {
    h06Status.textContent = state.h06Projection.status;
  }
  const h06Runtime = document.querySelector("[data-state-field='h06-runtime']");
  if (h06Runtime) {
    h06Runtime.textContent = state.h06Projection.runtimeStatus;
  }
  const h06Worktrees = document.querySelector("[data-state-field='h06-worktrees']");
  if (h06Worktrees) {
    h06Worktrees.textContent = state.h06Projection.worktreeStatus;
  }
  const h06Locks = document.querySelector("[data-state-field='h06-locks']");
  if (h06Locks) {
    h06Locks.textContent = state.h06Projection.lockStatus;
  }
  const h06Checkpoints = document.querySelector("[data-state-field='h06-checkpoints']");
  if (h06Checkpoints) {
    h06Checkpoints.textContent = state.h06Projection.checkpointStatus;
  }
  const h06Quarantine = document.querySelector("[data-state-field='h06-quarantine']");
  if (h06Quarantine) {
    h06Quarantine.textContent = state.h06Projection.quarantineStatus;
  }
  const h06Pods = document.querySelector("[data-state-field='h06-pods']");
  if (h06Pods) {
    h06Pods.textContent = state.h06Projection.podStatus;
  }
  const h06Runner = document.querySelector("[data-state-field='h06-runner']");
  if (h06Runner) {
    h06Runner.textContent = state.h06Projection.runnerStatus;
  }
  const h06ActiveFfet = document.querySelector("[data-state-field='h06-active-ffet']");
  if (h06ActiveFfet) {
    h06ActiveFfet.textContent = state.h06Projection.activeFfet;
  }
  const h06ProjectionAuthority = document.querySelector("[data-state-field='h06-projection-authority']");
  if (h06ProjectionAuthority) {
    h06ProjectionAuthority.textContent = state.h06Projection.authority;
  }
  const h06RuntimeList = document.querySelector("[data-state-field='h06-runtime-list']");
  if (h06RuntimeList) {
    h06RuntimeList.replaceChildren(
      ...state.h06Projection.runtimeRefs.map((runtimeRef) => {
        const item = document.createElement("li");
        item.innerHTML = `<strong></strong><span></span>`;
        item.querySelector("strong").textContent = runtimeRef.title;
        item.querySelector("span").textContent = runtimeRef.status;
        return item;
      })
    );
  }
  const h07Status = document.querySelector("[data-state-field='h07-status']");
  if (h07Status) {
    h07Status.textContent = state.h07Projection.status;
  }
  const h07ActiveFfet = document.querySelector("[data-state-field='h07-active-ffet']");
  if (h07ActiveFfet) {
    h07ActiveFfet.textContent = state.h07Projection.activeFfet;
  }
  const h07ProjectionAuthority = document.querySelector("[data-state-field='h07-projection-authority']");
  if (h07ProjectionAuthority) {
    h07ProjectionAuthority.textContent = state.h07Projection.authority;
  }
  const h07VerifiedProofCount = document.querySelector("[data-state-field='h07-verified-proof-count']");
  if (h07VerifiedProofCount) {
    h07VerifiedProofCount.textContent = String(state.h07Projection.verifiedProofCount);
  }
  const h07BlockedProofCount = document.querySelector("[data-state-field='h07-blocked-proof-count']");
  if (h07BlockedProofCount) {
    h07BlockedProofCount.textContent = String(state.h07Projection.blockedProofCount);
  }
  const h07NonOperationalProofCount = document.querySelector("[data-state-field='h07-non-operational-proof-count']");
  if (h07NonOperationalProofCount) {
    h07NonOperationalProofCount.textContent = String(state.h07Projection.nonOperationalProofCount);
  }
  const h07ProofList = document.querySelector("[data-state-field='h07-proof-list']");
  if (h07ProofList) {
    h07ProofList.replaceChildren(
      ...state.h07Projection.proofLevels.map((proof) => {
        const item = document.createElement("li");
        item.innerHTML = `<strong></strong><span></span>`;
        item.querySelector("strong").textContent = `${proof.level} ${proof.title}`;
        item.querySelector("span").textContent = proof.status;
        return item;
      })
    );
  }
  const h07BlockedClaims = document.querySelector("[data-state-field='h07-blocked-claims']");
  if (h07BlockedClaims) {
    h07BlockedClaims.replaceChildren(
      ...state.h07Projection.blockedClaims.map((claim) => {
        const item = document.createElement("li");
        item.textContent = claim;
        return item;
      })
    );
  }
  const mismatch = document.querySelector("[data-state-field='classified-mismatch']");
  if (mismatch) {
    mismatch.textContent = state.classifiedMismatch;
  }
}
