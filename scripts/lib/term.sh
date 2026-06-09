#!/usr/bin/env bash
# Terminal-state restoration helpers.
#
# Long-running children that drive a TUI — notably `next dev` — switch the
# terminal into raw mode and/or application cursor-key mode (DECCKM). When such
# a child is killed by Ctrl-C before it can restore those modes, the parent
# shell is left garbled: there is no line editing and arrow keys emit raw escape
# sequences ("strange characters"). The parent script must therefore restore the
# terminal itself rather than trust the child to do it on the way out.
#
# Usage: source this file, call `term_save` once near the top (while the terminal
# is still sane), then call `term_restore` from the cleanup / EXIT trap.

# Saved `stty` settings captured by term_save (empty when stdin is not a TTY).
ASCIIDOCOLLAB_SAVED_STTY=""

# Capture the current terminal settings so term_restore can put them back exactly.
term_save() {
  if [ -t 0 ]; then
    ASCIIDOCOLLAB_SAVED_STTY=$(stty -g 2>/dev/null || true)
  fi
}

# Restore the terminal to a usable state. Idempotent, and a no-op when stdin /
# stdout are not TTYs (e.g. in CI), so it is always safe to call from a trap.
term_restore() {
  if [ -t 1 ]; then
    # Reset cursor keys to normal (DECCKM off), reset the keypad to numeric
    # mode, and show the cursor — all of which have no effect on screen content.
    # Deliberately does NOT touch the alternate screen buffer: dev servers like
    # `next dev` scroll inline (never enter alt-screen), so emitting the
    # "leave alt-screen" sequence would restore a stale buffer and leave old
    # text scattered on screen.
    printf '\033[?1l\033>\033[?25h' 2>/dev/null || true
  fi
  if [ -t 0 ]; then
    if [ -n "$ASCIIDOCOLLAB_SAVED_STTY" ]; then
      stty "$ASCIIDOCOLLAB_SAVED_STTY" 2>/dev/null || stty sane 2>/dev/null || true
    else
      stty sane 2>/dev/null || true
    fi
  fi
}
