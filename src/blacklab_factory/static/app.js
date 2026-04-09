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
    payload.max_parallel_departments = Number(payload.max_parallel_departments || 7);
    payload.pause_between_departments = Number(payload.pause_between_departments || 0);
    try {
      setFeedback("Launching detached run...");
      const result = await postJson("/api/launch/run", payload);
      setFeedback(`Run ${result.run_id} launched. PID ${result.pid}.`);
      window.setTimeout(() => window.location.reload(), 800);
    } catch (error) {
      setFeedback(`Run launch failed: ${error.message}`, true);
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
    payload.max_parallel_departments = Number(payload.max_parallel_departments || 7);
    payload.pause_between_departments = Number(payload.pause_between_departments || 0);
    payload.interval_seconds = Number(payload.interval_seconds || 30);
    payload.max_iterations = Number(payload.max_iterations || 3);
    try {
      setFeedback("Launching autopilot loop...");
      const result = await postJson("/api/launch/loop", payload);
      setFeedback(`Loop ${result.loop_id} launched. PID ${result.pid}.`);
      window.setTimeout(() => window.location.reload(), 800);
    } catch (error) {
      setFeedback(`Autopilot launch failed: ${error.message}`, true);
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
        setFeedback(`Requesting stop for loop ${loopId}...`);
        await postJson(`/api/loops/${loopId}/stop`, {});
        setFeedback(`Stop requested for loop ${loopId}.`);
        window.setTimeout(() => window.location.reload(), 800);
      } catch (error) {
        setFeedback(`Loop stop failed: ${error.message}`, true);
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
    toggle.textContent = autoRefreshEnabled ? "Auto Refresh On" : "Auto Refresh Off";
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

function bindOperatorSettingsForm() {
  const form = document.querySelector("#operator-settings-form");
  if (!form) {
    return;
  }
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const raw = Object.fromEntries(new FormData(form).entries());
    const payload = {
      launch: {
        mode: raw.launch_mode,
        pause_between_departments: Number(raw.launch_pause_between_departments || 0),
        run_settings: {
          codex_model: raw.launch_codex_model,
          codex_autonomy: raw.launch_codex_autonomy,
          codex_review_model: raw.launch_codex_review_model,
          codex_review_autonomy: raw.launch_codex_review_autonomy,
          max_parallel_departments: Number(raw.launch_max_parallel_departments || 7),
          detached: false,
        },
      },
      autopilot: {
        run_mode: raw.autopilot_run_mode,
        loop_mode: raw.autopilot_loop_mode,
        interval_seconds: Number(raw.autopilot_interval_seconds || 30),
        max_iterations: Number(raw.autopilot_max_iterations || 3),
        pause_between_departments: Number(raw.autopilot_pause_between_departments || 0),
        run_settings: {
          codex_model: raw.autopilot_codex_model,
          codex_autonomy: raw.autopilot_codex_autonomy,
          codex_review_model: raw.autopilot_codex_review_model,
          codex_review_autonomy: raw.autopilot_codex_review_autonomy,
          max_parallel_departments: Number(raw.autopilot_max_parallel_departments || 7),
          detached: false,
        },
      },
    };
    try {
      setFeedback("Saving web defaults...");
      await postJson("/api/operator/profile", payload);
      setFeedback("Web defaults saved.");
    } catch (error) {
      setFeedback(`Settings save failed: ${error.message}`, true);
    }
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
      setFeedback("Sending command to the main operator...");
      const result = await postJson("/api/operator/chat", { message });
      renderChatMessages(result.messages || []);
      setFeedback(result.reply || "Operator replied.");
      if (textarea) {
        textarea.value = "";
      }
    } catch (error) {
      setFeedback(`Operator chat failed: ${error.message}`, true);
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
bindLoopStopButtons();
bindRefreshControls();
bindTogglePanels();
bindOperatorSettingsForm();
bindOperatorChat();
scheduleRefresh();
