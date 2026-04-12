#!/bin/zsh

set -euo pipefail

PROJECT_ROOT="${0:A:h}"
HOST="${BLACKLAB_HOST:-127.0.0.1}"
PORT="${BLACKLAB_PORT:-8000}"
URL="http://${HOST}:${PORT}"
RUNTIME_DIR="${PROJECT_ROOT}/.factory/runtime"
PID_FILE="${RUNTIME_DIR}/dashboard-${PORT}.pid"
LOG_FILE="${RUNTIME_DIR}/dashboard-${PORT}.log"
UVICORN_BIN="${PROJECT_ROOT}/.venv/bin/uvicorn"
AUTO_OPEN="${BLACKLAB_AUTO_OPEN:-1}"

mkdir -p "${RUNTIME_DIR}"

usage() {
  cat <<EOF
Usage: ./blacklab.sh [command]

Commands:
  (no command) Start the local blackLAB web server in the current terminal
  start     Start the local blackLAB web server in the current terminal
  start-bg  Start the local blackLAB web server in the background
  stop      Stop the local blackLAB web server started by start-bg
  restart   Restart the local blackLAB web server
  status   Show current server status
  logs     Tail the local server log
  open     Open the local web app in the browser

Environment overrides:
  BLACKLAB_HOST   Default: 127.0.0.1
  BLACKLAB_PORT   Default: 8000
  BLACKLAB_AUTO_OPEN  Default: 1 (open the browser when ready)
EOF
}

require_runtime() {
  if [[ ! -x "${UVICORN_BIN}" ]]; then
    echo "Missing ${UVICORN_BIN}. Run 'uv sync --group dev' first."
    exit 1
  fi
}

listening_pid() {
  lsof -tiTCP:${PORT} -sTCP:LISTEN 2>/dev/null | head -n 1 || true
}

pid_from_file() {
  if [[ -f "${PID_FILE}" ]]; then
    tr -d '[:space:]' < "${PID_FILE}"
  fi
}

cleanup_stale_pid_file() {
  local tracked_pid
  tracked_pid="$(pid_from_file)"
  if [[ -n "${tracked_pid}" ]] && ! kill -0 "${tracked_pid}" >/dev/null 2>&1; then
    rm -f "${PID_FILE}"
  fi
}

print_clickable_url() {
  printf 'open=%s\n' "${URL}"
  printf '\033]8;;%s\033\\%s\033]8;;\033\\\n' "${URL}" "${URL}"
}

open_browser_if_enabled() {
  if [[ "${AUTO_OPEN}" == "1" ]] && command -v open >/dev/null 2>&1; then
    open "${URL}" >/dev/null 2>&1 || true
  fi
}

announce_ready() {
  echo "blackLAB is running at ${URL}"
  echo "log=${LOG_FILE}"
  print_clickable_url
  open_browser_if_enabled
}

announce_ready_when_available() {
  (
    local attempts=0
    while (( attempts < 50 )); do
      if curl -fsS "${URL}/" >/dev/null 2>&1; then
        announce_ready
        return 0
      fi
      sleep 0.2
      attempts=$((attempts + 1))
    done
  ) &
}

wait_until_ready() {
  local pid="$1"
  local attempts=0

  while (( attempts < 50 )); do
    if curl -fsS "${URL}/" >/dev/null 2>&1; then
      announce_ready
      return 0
    fi

    if ! kill -0 "${pid}" >/dev/null 2>&1; then
      rm -f "${PID_FILE}"
      echo "blackLAB exited before becoming ready."
      tail -n 60 "${LOG_FILE}" 2>/dev/null || true
      exit 1
    fi

    sleep 0.2
    attempts=$((attempts + 1))
  done

  rm -f "${PID_FILE}"
  echo "blackLAB did not become ready in time."
  tail -n 60 "${LOG_FILE}" 2>/dev/null || true
  exit 1
}

start_foreground_server() {
  require_runtime

  local existing_pid
  existing_pid="$(listening_pid)"
  if [[ -n "${existing_pid}" ]]; then
    echo "blackLAB is already listening on ${URL} (pid=${existing_pid})."
    print_clickable_url
    open_browser_if_enabled
    return 0
  fi

  cd "${PROJECT_ROOT}"
  announce_ready_when_available
  exec "${UVICORN_BIN}" blacklab_factory.web:create_app --factory --host "${HOST}" --port "${PORT}"
}

start_background_server() {
  require_runtime
  cleanup_stale_pid_file

  local existing_pid
  existing_pid="$(listening_pid)"
  if [[ -n "${existing_pid}" ]]; then
    echo "blackLAB is already listening on ${URL} (pid=${existing_pid})."
    echo "log=${LOG_FILE}"
    print_clickable_url
    open_browser_if_enabled
    return 0
  fi

  cd "${PROJECT_ROOT}"
  nohup "${UVICORN_BIN}" blacklab_factory.web:create_app --factory --host "${HOST}" --port "${PORT}" < /dev/null >> "${LOG_FILE}" 2>&1 &
  local pid=$!
  disown "${pid}" 2>/dev/null || true
  echo "${pid}" > "${PID_FILE}"
  wait_until_ready "${pid}"
}

stop_server() {
  local pid
  pid="$(pid_from_file)"

  if [[ -n "${pid}" ]] && kill -0 "${pid}" >/dev/null 2>&1; then
    kill "${pid}" >/dev/null 2>&1 || true
    for _ in {1..25}; do
      if ! kill -0 "${pid}" >/dev/null 2>&1; then
        rm -f "${PID_FILE}"
        echo "blackLAB stopped."
        return 0
      fi
      sleep 0.2
    done
    echo "Timed out while waiting for pid=${pid} to stop."
    exit 1
  fi

  local existing_pid
  existing_pid="$(listening_pid)"
  if [[ -n "${existing_pid}" ]]; then
    echo "Port ${PORT} is still in use by pid=${existing_pid}, but it is not tracked by ${PID_FILE}."
    echo "Stop it manually if this is an old server instance."
    exit 1
  fi

  rm -f "${PID_FILE}"
  echo "blackLAB is already stopped."
}

show_status() {
  local existing_pid tracked_pid
  cleanup_stale_pid_file
  existing_pid="$(listening_pid)"
  tracked_pid="$(pid_from_file)"

  echo "url=${URL}"
  echo "log=${LOG_FILE}"

  if [[ -n "${existing_pid}" ]]; then
    echo "status=running"
    echo "listening_pid=${existing_pid}"
  else
    echo "status=stopped"
  fi

  if [[ -n "${tracked_pid}" ]]; then
    echo "tracked_pid=${tracked_pid}"
  fi
}

tail_logs() {
  touch "${LOG_FILE}"
  tail -n 80 -f "${LOG_FILE}"
}

open_ui() {
  open "${URL}"
}

command="${1:-start}"

case "${command}" in
  start)
    start_foreground_server
    ;;
  start-bg)
    start_background_server
    ;;
  stop)
    stop_server
    ;;
  restart)
    stop_server || true
    start_background_server
    ;;
  status)
    show_status
    ;;
  logs)
    tail_logs
    ;;
  open)
    open_ui
    ;;
  *)
    usage
    exit 1
    ;;
esac
