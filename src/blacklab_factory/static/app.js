const feedbackNode = document.querySelector("#action-feedback");
let autoRefreshEnabled = false;
let autoRefreshTimer = null;
const chatLogNode = document.querySelector("#operator-chat-log");
const AUTO_REFRESH_INTERVAL_MS = 12000;

function setFeedback(message, isError = false) {
  if (!feedbackNode) {
    return;
  }
  feedbackNode.textContent = message;
  feedbackNode.style.color = isError ? "#b42318" : "";
}

function readStoredJson(key) {
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (_error) {
    return null;
  }
}

function writeStoredJson(key, value) {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch (_error) {
    // Ignore storage errors and keep the page usable.
  }
}

function removeStoredJson(key) {
  try {
    window.sessionStorage.removeItem(key);
  } catch (_error) {
    // Ignore storage errors and keep the page usable.
  }
}

function getRefreshToggle() {
  return document.querySelector('[data-toggle-refresh][data-refresh-scope="observe"]');
}

function clearScheduledRefresh() {
  if (!autoRefreshTimer) {
    return;
  }
  clearTimeout(autoRefreshTimer);
  autoRefreshTimer = null;
}

function updateRefreshToggle(toggle) {
  if (!toggle) {
    return;
  }
  const activeLabel = toggle.getAttribute("data-toggle-label-on") || "Auto refresh on";
  const inactiveLabel = toggle.getAttribute("data-toggle-label-off") || "Auto refresh off";
  toggle.textContent = autoRefreshEnabled ? activeLabel : inactiveLabel;
  toggle.setAttribute("data-active", autoRefreshEnabled ? "true" : "false");
}

function disableAutoRefreshForEditing() {
  if (!autoRefreshEnabled && !autoRefreshTimer) {
    return;
  }
  autoRefreshEnabled = false;
  clearScheduledRefresh();
  updateRefreshToggle(getRefreshToggle());
}

function getDraftStorageKey(form) {
  const draftKey = form.getAttribute("data-draft-key");
  return draftKey ? `blacklab:draft:${draftKey}` : null;
}

function setTogglePanelState(button, panel, isOpen) {
  if (isOpen) {
    panel.removeAttribute("hidden");
    const openLabel = button.getAttribute("data-toggle-label-open");
    if (openLabel) {
      button.textContent = openLabel;
    }
    return;
  }
  panel.setAttribute("hidden", "");
  const closedLabel = button.getAttribute("data-toggle-label-closed");
  if (closedLabel) {
    button.textContent = closedLabel;
  }
}

function collectFormDraftState(form) {
  const values = {};
  form.querySelectorAll("input[name], textarea[name], select[name]").forEach((field) => {
    if (
      !(
        field instanceof HTMLInputElement ||
        field instanceof HTMLTextAreaElement ||
        field instanceof HTMLSelectElement
      )
    ) {
      return;
    }
    if (field instanceof HTMLInputElement && ["button", "submit", "hidden"].includes(field.type)) {
      return;
    }
    if (field instanceof HTMLInputElement && field.type === "radio") {
      if (field.checked) {
        values[field.name] = field.value;
      }
      return;
    }
    if (field instanceof HTMLInputElement && field.type === "checkbox") {
      values[field.name] = field.checked;
      return;
    }
    values[field.name] = field.value;
  });

  const panels = {};
  form.querySelectorAll("[data-toggle-target]").forEach((button) => {
    const targetId = button.getAttribute("data-toggle-target");
    const panel = targetId ? document.getElementById(targetId) : null;
    if (!targetId || !panel) {
      return;
    }
    panels[targetId] = !panel.hasAttribute("hidden");
  });

  return { values, panels };
}

function persistFormDraft(form) {
  const storageKey = getDraftStorageKey(form);
  if (!storageKey) {
    return;
  }
  writeStoredJson(storageKey, collectFormDraftState(form));
}

function clearFormDraft(form) {
  const storageKey = getDraftStorageKey(form);
  if (!storageKey) {
    return;
  }
  removeStoredJson(storageKey);
}

function restoreFormDraft(form) {
  const storageKey = getDraftStorageKey(form);
  if (!storageKey) {
    return;
  }
  const state = readStoredJson(storageKey);
  if (!state || typeof state !== "object") {
    return;
  }

  const values = state.values || {};
  Object.entries(values).forEach(([name, value]) => {
    form.querySelectorAll(`[name="${name}"]`).forEach((field) => {
      if (
        !(
          field instanceof HTMLInputElement ||
          field instanceof HTMLTextAreaElement ||
          field instanceof HTMLSelectElement
        )
      ) {
        return;
      }
      if (field instanceof HTMLInputElement && ["button", "submit", "hidden"].includes(field.type)) {
        return;
      }
      if (field instanceof HTMLInputElement && field.type === "radio") {
        field.checked = field.value === value;
        return;
      }
      if (field instanceof HTMLInputElement && field.type === "checkbox") {
        field.checked = Boolean(value);
        return;
      }
      field.value = value ?? "";
    });
  });

  const panels = state.panels || {};
  form.querySelectorAll("[data-toggle-target]").forEach((button) => {
    const targetId = button.getAttribute("data-toggle-target");
    const panel = targetId ? document.getElementById(targetId) : null;
    if (!targetId || !panel) {
      return;
    }
    setTogglePanelState(button, panel, Boolean(panels[targetId]));
  });
}

function bindDraftableForms() {
  document.querySelectorAll("form[data-draft-key]").forEach((form) => {
    restoreFormDraft(form);
    form.addEventListener("focusin", (event) => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) {
        disableAutoRefreshForEditing();
      }
    });
    form.addEventListener("input", () => {
      disableAutoRefreshForEditing();
      persistFormDraft(form);
    });
    form.addEventListener("change", () => {
      disableAutoRefreshForEditing();
      persistFormDraft(form);
    });
  });
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed with status ${response.status}`);
  }
  return response.json();
}

function bindRunLaunchForm() {
  const form = document.querySelector("#run-launch-form");
  if (!form) {
    return;
  }
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(form).entries());
    payload.max_parallel_departments = Number(payload.max_parallel_departments || 9);
    payload.pause_between_departments = Number(payload.pause_between_departments || 0);
    try {
      setFeedback("Starting run...");
      const result = await postJson("/api/launch/run", payload);
      clearFormDraft(form);
      setFeedback(`Run ${result.run_id} is starting now.`);
      window.setTimeout(() => window.location.reload(), 800);
    } catch (error) {
      setFeedback(`Could not start the run: ${error.message}`, true);
    }
  });
}

function bindLoopLaunchForm() {
  const form = document.querySelector("#loop-launch-form");
  if (!form) {
    return;
  }
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(form).entries());
    payload.max_parallel_departments = Number(payload.max_parallel_departments || 9);
    payload.pause_between_departments = Number(payload.pause_between_departments || 0);
    payload.interval_seconds = Number(payload.interval_seconds || 30);
    payload.max_iterations = Number(payload.max_iterations || 3);
    try {
      setFeedback("Starting autopilot...");
      const result = await postJson("/api/launch/loop", payload);
      clearFormDraft(form);
      setFeedback(`Loop ${result.loop_id} is starting now.`);
      window.setTimeout(() => window.location.reload(), 800);
    } catch (error) {
      setFeedback(`Could not start autopilot: ${error.message}`, true);
    }
  });
}

function bindLoopStopButtons() {
  document.querySelectorAll("[data-stop-loop]").forEach((button) => {
    button.addEventListener("click", async () => {
      const loopId = button.getAttribute("data-stop-loop");
      if (!loopId) {
        return;
      }
      try {
        setFeedback(`Asking loop ${loopId} to stop...`);
        await postJson(`/api/loops/${loopId}/stop`, {});
        setFeedback(`Loop ${loopId} will stop after the current cycle.`);
        window.setTimeout(() => window.location.reload(), 800);
      } catch (error) {
        setFeedback(`Could not stop the loop: ${error.message}`, true);
      }
    });
  });
}

function bindRunStopButtons() {
  document.querySelectorAll("[data-stop-run]").forEach((button) => {
    button.addEventListener("click", async () => {
      const runId = button.getAttribute("data-stop-run");
      if (!runId) {
        return;
      }
      try {
        setFeedback(`Asking run ${runId} to stop...`);
        await postJson(`/api/runs/${runId}/stop`, {});
        setFeedback(`Run ${runId} will stop shortly.`);
        window.setTimeout(() => window.location.reload(), 800);
      } catch (error) {
        setFeedback(`Could not stop the run: ${error.message}`, true);
      }
    });
  });
}

function bindRefreshControls() {
  const refreshButton = document.querySelector("[data-refresh-page]");
  if (refreshButton) {
    refreshButton.addEventListener("click", () => window.location.reload());
  }

  const toggle = getRefreshToggle();
  if (!toggle) {
    return;
  }
  autoRefreshEnabled = toggle.getAttribute("data-active") === "true";
  updateRefreshToggle(toggle);
  toggle.addEventListener("click", () => {
    autoRefreshEnabled = !autoRefreshEnabled;
    updateRefreshToggle(toggle);
    if (autoRefreshEnabled) {
      scheduleRefresh();
    } else {
      clearScheduledRefresh();
    }
  });
  if (autoRefreshEnabled) {
    scheduleRefresh();
  }
}

function bindTogglePanels() {
  document.querySelectorAll('[data-toggle-target]').forEach((button) => {
    button.addEventListener('click', () => {
      const targetId = button.getAttribute('data-toggle-target');
      if (!targetId) {
        return;
      }
      const panel = document.getElementById(targetId);
      if (!panel) {
        return;
      }
      const nextIsOpen = panel.hasAttribute("hidden");
      setTogglePanelState(button, panel, nextIsOpen);
      const form = button.closest("form[data-draft-key]");
      if (form instanceof HTMLFormElement) {
        persistFormDraft(form);
      }
    });
  });
}

function bindProjectSelectors() {
  document.querySelectorAll("[data-apply-project]").forEach((button) => {
    button.addEventListener("click", () => {
      const binding = button.getAttribute("data-apply-project");
      const value = button.getAttribute("data-project-value") || "";
      if (!binding) {
        return;
      }
      const [formId, fieldName] = binding.split(":");
      const form = document.getElementById(formId);
      if (!(form instanceof HTMLFormElement)) {
        return;
      }
      const input = form.querySelector(`[name="${fieldName}"]`);
      if (!(input instanceof HTMLInputElement)) {
        return;
      }
      input.value = value;
      input.focus();
      setFeedback(`Project selected: ${value}.`);
    });
  });
}

function scheduleRefresh() {
  const autoRefreshToggle = getRefreshToggle();
  if (!autoRefreshToggle) {
    return;
  }
  if (!autoRefreshEnabled) {
    return;
  }
  clearScheduledRefresh();
  autoRefreshTimer = window.setTimeout(() => window.location.reload(), AUTO_REFRESH_INTERVAL_MS);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderChatMessages(messages) {
  if (!chatLogNode) {
    return;
  }
  chatLogNode.innerHTML = messages
    .map(
      (message) => `
        <article class="chat-message chat-${escapeHtml(message.role)}">
          <div class="chat-meta">${escapeHtml(message.role)} · ${escapeHtml(message.created_at)}</div>
          <div class="chat-body">${escapeHtml(message.content)}</div>
        </article>
      `,
    )
    .join("");
  chatLogNode.scrollTop = chatLogNode.scrollHeight;
}

function summarizeOperatorAction(action, fallback) {
  if (!action || !action.type) {
    return fallback || "Reply received.";
  }
  switch (action.type) {
    case "run_directive":
      return `Message sent to run ${action.run_id}.`;
    case "run_directive_broadcast":
      return `Message sent to ${action.run_ids?.length || 0} running runs.`;
    case "loop_directive":
      return `Message sent to loop ${action.loop_id}.`;
    case "loop_directive_broadcast":
      return `Message sent to ${action.loop_ids?.length || 0} running loops.`;
    case "run_launch":
      return `Run ${action.run_id} started.`;
    case "loop_launch":
      return `Loop ${action.loop_id} started.`;
    case "loop_stop":
      return `Loop ${action.loop_id} will stop after the current cycle.`;
    default:
      return fallback || "Reply received.";
  }
}

function bindOperatorSettingsForm() {
  const form = document.querySelector("#operator-settings-form");
  if (!form) {
    return;
  }
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const raw = Object.fromEntries(formData.entries());
    const activeDepartmentKeys = Array.from(
      document.querySelectorAll('input[name="roster_active_department_keys"]:checked'),
    )
      .map((element) => element.value)
      .filter(Boolean);
    const hiddenCampusItems = [];
    const monumentVisible = document.querySelector(
      'input[name="campus_item_monument_visible"]',
    );
    if (activeDepartmentKeys.length === 0) {
      setFeedback("Keep at least one team turned on.", true);
      return;
    }
    if (!(monumentVisible instanceof HTMLInputElement && monumentVisible.checked)) {
      hiddenCampusItems.push("monument");
    }
    const payload = {
      launch: {
        mode: raw.launch_mode,
        project_slug: raw.launch_project_slug || null,
        pause_between_departments: Number(raw.launch_pause_between_departments || 0),
        run_settings: {
          codex_model: raw.launch_codex_model,
          codex_autonomy: raw.launch_codex_autonomy,
          codex_review_model: raw.launch_codex_review_model,
          codex_review_autonomy: raw.launch_codex_review_autonomy,
          max_parallel_departments: Number(raw.launch_max_parallel_departments || 9),
          detached: false,
        },
      },
      autopilot: {
        run_mode: raw.autopilot_run_mode,
        project_slug: raw.autopilot_project_slug || null,
        loop_mode: raw.autopilot_loop_mode,
        interval_seconds: Number(raw.autopilot_interval_seconds || 30),
        max_iterations: Number(raw.autopilot_max_iterations || 3),
        pause_between_departments: Number(raw.autopilot_pause_between_departments || 0),
        run_settings: {
          codex_model: raw.autopilot_codex_model,
          codex_autonomy: raw.autopilot_codex_autonomy,
          codex_review_model: raw.autopilot_codex_review_model,
          codex_review_autonomy: raw.autopilot_codex_review_autonomy,
          max_parallel_departments: Number(raw.autopilot_max_parallel_departments || 9),
          detached: false,
        },
      },
      roster: {
        active_department_keys: activeDepartmentKeys,
        hidden_campus_items: hiddenCampusItems,
      },
    };
    try {
      setFeedback("Saving changes...");
      await postJson("/api/operator/profile", payload);
      setFeedback("Changes saved.");
    } catch (error) {
      setFeedback(`Could not save changes: ${error.message}`, true);
    }
  });

  document.querySelectorAll(".settings-reset-button").forEach((button) => {
    button.addEventListener("click", () => {
      setFeedback("Reloading saved changes...");
      window.location.reload();
    });
  });
}

function bindOperatorChat() {
  const form = document.querySelector("#operator-chat-form");
  if (!form) {
    return;
  }
  const textarea = form.querySelector('textarea[name="message"]');
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = textarea?.value?.trim();
    if (!message) {
      return;
    }
    try {
      setFeedback("Sending message...");
      const result = await postJson("/api/operator/chat", { message });
      renderChatMessages(result.messages || []);
      setFeedback(summarizeOperatorAction(result.action, result.reply));
      if (textarea) {
        textarea.value = "";
      }
    } catch (error) {
      setFeedback(`Could not send the message: ${error.message}`, true);
    }
  });

  document.querySelectorAll("[data-chat-command]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!textarea) {
        return;
      }
      textarea.value = button.getAttribute("data-chat-command") || "";
      textarea.focus();
    });
  });
}

bindRunLaunchForm();
bindLoopLaunchForm();
bindRunStopButtons();
bindLoopStopButtons();
bindRefreshControls();
bindTogglePanels();
bindProjectSelectors();
bindDraftableForms();
bindOperatorSettingsForm();
bindOperatorChat();
