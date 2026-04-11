const feedbackNode = document.querySelector("#action-feedback");
let autoRefreshEnabled = true;
let autoRefreshTimer = null;
const chatLogNode = document.querySelector("#operator-chat-log");

function setFeedback(message, isError = false) {
  if (!feedbackNode) {
    return;
  }
  feedbackNode.textContent = message;
  feedbackNode.style.color = isError ? "#b42318" : "";
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

  const toggle = document.querySelector("[data-toggle-refresh]");
  if (!toggle) {
    return;
  }
  toggle.addEventListener("click", () => {
    autoRefreshEnabled = !autoRefreshEnabled;
    toggle.textContent = autoRefreshEnabled ? "Auto refresh on" : "Auto refresh off";
    toggle.setAttribute("data-active", autoRefreshEnabled ? "true" : "false");
    if (autoRefreshEnabled) {
      scheduleRefresh();
    } else if (autoRefreshTimer) {
      clearTimeout(autoRefreshTimer);
      autoRefreshTimer = null;
    }
  });
}

function bindTogglePanels() {
  document.querySelectorAll('[data-toggle-target]').forEach((button) => {
    button.addEventListener('click', () => {
      const targetId = button.getAttribute('data-toggle-target')
      if (!targetId) {
        return
      }
      const panel = document.getElementById(targetId)
      if (!panel) {
        return
      }
      const nextHidden = !panel.hasAttribute('hidden')
      if (nextHidden) {
        panel.setAttribute('hidden', '')
        const closedLabel = button.getAttribute('data-toggle-label-closed')
        if (closedLabel) {
          button.textContent = closedLabel
        }
      } else {
        panel.removeAttribute('hidden')
        const openLabel = button.getAttribute('data-toggle-label-open')
        if (openLabel) {
          button.textContent = openLabel
        }
      }
    })
  })
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
  const autoRefreshToggle = document.querySelector("[data-toggle-refresh]");
  if (!autoRefreshToggle) {
    return;
  }
  if (!autoRefreshEnabled) {
    return;
  }
  if (autoRefreshTimer) {
    clearTimeout(autoRefreshTimer);
  }
  autoRefreshTimer = window.setTimeout(() => window.location.reload(), 12000);
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
bindOperatorSettingsForm();
bindOperatorChat();
scheduleRefresh();
