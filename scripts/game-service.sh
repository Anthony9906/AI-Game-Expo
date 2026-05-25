#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PORT:-5174}"
RUNTIME_DIR="$ROOT_DIR/.runtime"
PID_FILE="$RUNTIME_DIR/game-service.pid"
LOG_FILE="$RUNTIME_DIR/game-service.log"
SESSION_NAME="${SESSION_NAME:-ai-game-expo-$PORT}"

mkdir -p "$RUNTIME_DIR"

find_port_pid() {
  lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true
}

is_pid_running() {
  local pid="${1:-}"
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

has_screen_session() {
  command -v screen >/dev/null 2>&1 && { screen -ls 2>/dev/null || true; } | grep -q "[.]$SESSION_NAME[[:space:]]"
}

current_pid() {
  if [[ -f "$PID_FILE" ]]; then
    tr -d '[:space:]' < "$PID_FILE"
  fi
}

start_service() {
  local existing_pid
  existing_pid="$(find_port_pid)"

  if [[ -n "$existing_pid" ]]; then
    echo "Service is already listening on port $PORT: PID $existing_pid"
    echo "URL: http://localhost:$PORT/"
    return 0
  fi

  if command -v screen >/dev/null 2>&1; then
    local root_q log_q port_q
    printf -v root_q '%q' "$ROOT_DIR"
    printf -v log_q '%q' "$LOG_FILE"
    printf -v port_q '%q' "$PORT"
    screen -dmS "$SESSION_NAME" bash -lc "cd $root_q && npm run dev -- --port $port_q --strictPort >> $log_q 2>&1"
    echo "screen:$SESSION_NAME" > "$PID_FILE"
  else
    cd "$ROOT_DIR"
    nohup npm run dev -- --port "$PORT" --strictPort > "$LOG_FILE" 2>&1 < /dev/null &
    echo "$!" > "$PID_FILE"
  fi

  sleep 2
  existing_pid="$(find_port_pid)"
  if [[ -n "$existing_pid" ]]; then
    echo "Service started in background: PID $existing_pid"
    echo "URL: http://localhost:$PORT/"
    echo "Log: $LOG_FILE"
  else
    echo "Service failed to start. Log: $LOG_FILE" >&2
    return 1
  fi
}

stop_service() {
  local pid
  pid="$(current_pid || true)"

  if [[ "$pid" == screen:* ]]; then
    local session="${pid#screen:}"
    if has_screen_session; then
      screen -S "$session" -X quit
      sleep 1
      rm -f "$PID_FILE"
      echo "Service stopped: screen session $session"
      return 0
    fi
  fi

  if is_pid_running "$pid"; then
    kill "$pid"
    sleep 1
    if is_pid_running "$pid"; then
      echo "Service did not stop cleanly: PID $pid" >&2
      return 1
    fi
    rm -f "$PID_FILE"
    echo "Service stopped: PID $pid"
    return 0
  fi

  local port_pid
  port_pid="$(find_port_pid)"
  if [[ -n "$port_pid" ]]; then
    echo "No managed PID found, but port $PORT is occupied by PID $port_pid"
    echo "Stop it manually if this is the game service."
    return 1
  fi

  rm -f "$PID_FILE"
  echo "Service is not running."
}

status_service() {
  local pid
  pid="$(current_pid || true)"

  if [[ "$pid" == screen:* ]] && has_screen_session; then
    local port_pid
    port_pid="$(find_port_pid)"
    echo "Service is running: screen session ${pid#screen:}"
    if [[ -n "$port_pid" ]]; then
      echo "Listening PID: $port_pid"
    fi
    echo "URL: http://localhost:$PORT/"
    echo "Log: $LOG_FILE"
    return 0
  fi

  if is_pid_running "$pid"; then
    echo "Service is running: PID $pid"
    echo "URL: http://localhost:$PORT/"
    echo "Log: $LOG_FILE"
    return 0
  fi

  local port_pid
  port_pid="$(find_port_pid)"
  if [[ -n "$port_pid" ]]; then
    echo "Port $PORT is occupied by unmanaged PID $port_pid"
    echo "URL: http://localhost:$PORT/"
    return 0
  fi

  echo "Service is not running."
}

case "${1:-start}" in
  start)
    start_service
    ;;
  stop)
    stop_service
    ;;
  restart)
    stop_service || true
    start_service
    ;;
  status)
    status_service
    ;;
  *)
    echo "Usage: $0 {start|stop|restart|status}"
    exit 2
    ;;
esac
