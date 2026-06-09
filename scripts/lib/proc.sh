#!/usr/bin/env bash
# Process-tree cleanup helper.
#
# Servers are started as `cmd &`, which captures only the direct child PID — but
# wrappers spawn grandchildren (e.g. pnpm -> next -> next-server) that survive a
# kill of the parent and keep their ports bound. `stop_tree` terminates a PID and
# all of its descendants, identified **by PID**, so it never touches unrelated
# processes such as a concurrently-running dev stack. SIGTERM first (graceful),
# then SIGKILL for anything that ignores it.

# Echo a PID and every descendant PID, one per line.
_pid_tree() {
  local pid="$1" child
  for child in $(pgrep -P "$pid" 2>/dev/null); do
    _pid_tree "$child"
  done
  echo "$pid"
}

# Gracefully stop a process tree, then force-kill survivors. No-op for an empty
# PID, so it is safe to call with an unset variable.
stop_tree() {
  local pid="$1"
  [ -z "$pid" ] && return 0
  local pids
  pids=$(_pid_tree "$pid")
  # shellcheck disable=SC2086
  kill -TERM $pids 2>/dev/null || true
  # Wait up to ~3s for the root to exit; break early once it's gone.
  local i
  for i in $(seq 1 15); do
    kill -0 "$pid" 2>/dev/null || return 0
    sleep 0.2
  done
  # shellcheck disable=SC2046,SC2086
  kill -KILL $(_pid_tree "$pid") 2>/dev/null || true
}
