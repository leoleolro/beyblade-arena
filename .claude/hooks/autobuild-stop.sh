#!/bin/bash
# Stop hook for the autobuild loop.
#
# Off unless .claude/autobuild/ACTIVE exists AND names the session that armed it,
# so a stale flag can never stop an unrelated conversation from ending. Every
# terminating condition below disarms the loop by deleting that flag.
#
# Contract: https://code.claude.com/docs/en/hooks (Stop event)
#   in  - JSON on stdin: session_id, cwd, stop_reason, last_assistant_message
#   out - exit 0; hookSpecificOutput.decision of "continue" keeps the turn alive
#
# Absolute paths throughout: a hook runs in a spawned process and does not
# inherit an interactive shell's PATH.

set -uo pipefail

JQ=/usr/bin/jq
input=$(cat)

proj="${CLAUDE_PROJECT_DIR:-$("$JQ" -r '.cwd // "."' <<<"$input")}"
state="$proj/.claude/autobuild"
queue="$proj/docs/QUEUE.md"
flag="$state/ACTIVE"
log="$state/log"

stamp() { /bin/date '+%Y-%m-%d %H:%M:%S'; }

# Let the turn end. With an argument, also disarm-log it and tell the owner why.
allow_stop() {
  if [ -n "${1:-}" ]; then
    printf '%s  STOP  %s\n' "$(stamp)" "$1" >>"$log"
    "$JQ" -n --arg m "autobuild disarmed - $1" '{systemMessage: $m}'
  fi
  exit 0
}

# Refuse to end the turn; $1 becomes Claude's next instruction.
keep_going() {
  printf '%s  GO    iteration %s\n' "$(stamp)" "$2" >>"$log"
  "$JQ" -n --arg r "$1" --arg s "autobuild_iteration_$2" '{
    hookSpecificOutput: {
      hookEventName: "Stop",
      decision: "continue",
      reason: $r,
      stopReason: $s
    }
  }'
  exit 0
}

# --- 1. is the loop armed, and is it this conversation's loop? ----------------

[ -f "$flag" ] || exit 0

if [ -f "$state/STOP" ]; then
  /bin/rm -f "$flag" "$state/STOP"
  allow_stop "kill switch: .claude/autobuild/STOP"
fi

armed_session=$(/bin/cat "$flag" 2>/dev/null || echo "")
this_session=$("$JQ" -r '.session_id // ""' <<<"$input")

# The skill arms the loop by touching an empty ACTIVE; the first Stop that sees
# it claims the loop for that session. Any other conversation ends normally,
# even while the loop is armed.
if [ -z "$armed_session" ]; then
  echo "$this_session" >"$flag"
  armed_session="$this_session"
fi
[ "$armed_session" = "$this_session" ] || exit 0

# --- 2. hard iteration cap ---------------------------------------------------

max=$(/bin/cat "$state/max-iterations" 2>/dev/null || echo 10)
n=$(/bin/cat "$state/iterations" 2>/dev/null || echo 0)
n=$((n + 1))
echo "$n" >"$state/iterations"

if [ "$n" -gt "$max" ]; then
  /bin/rm -f "$flag"
  allow_stop "hit the $max-iteration cap"
fi

# --- 3. verification streak --------------------------------------------------
#
# The hook never runs the build itself. Stop hooks sit in the path of every turn
# ending, and `tsc && vite build` is far too slow to put there. The skill runs
# the build and records "pass" or "fail <item>"; the hook only reads the verdict.

verdict=$(/bin/cat "$state/last-verify" 2>/dev/null || echo pass)
if [ "${verdict%% *}" = "fail" ]; then
  item="${verdict#fail }"
  prev=$(/bin/cat "$state/fail-item" 2>/dev/null || echo "")
  streak=$(/bin/cat "$state/fail-streak" 2>/dev/null || echo 0)
  if [ "$item" = "$prev" ]; then streak=$((streak + 1)); else streak=1; fi
  echo "$item" >"$state/fail-item"
  echo "$streak" >"$state/fail-streak"
  if [ "$streak" -ge 2 ]; then
    /bin/rm -f "$flag"
    allow_stop "verification failed twice running on: $item"
  fi
else
  echo 0 >"$state/fail-streak"
  : >"$state/fail-item"
fi

# --- 4. what is left to build ------------------------------------------------
#
# Only `- [ ]` counts as buildable. `- [~]` is parked and deliberately invisible
# here, so the owner can keep a backlog in the same file without feeding it to
# the loop.

if [ ! -f "$queue" ]; then
  /bin/rm -f "$flag"
  allow_stop "no docs/QUEUE.md to work from"
fi

next=$(/usr/bin/grep -m1 -E '^[[:space:]]*- \[ \]' "$queue" || true)
if [ -z "$next" ]; then
  /bin/rm -f "$flag"
  allow_stop "queue is empty - every item is ticked or parked"
fi

item_text=$(echo "$next" | /usr/bin/sed -E 's/^[[:space:]]*- \[ \][[:space:]]*//')

case "$next" in
  *"[decision]"*)
    /bin/rm -f "$flag"
    allow_stop "next item is yours to call: $item_text"
    ;;
esac

# --- 5. keep building --------------------------------------------------------

open_count=$(/usr/bin/grep -cE '^[[:space:]]*- \[ \]' "$queue" || echo 0)

keep_going "Continue autobuild - iteration $n of $max, $open_count item(s) still open.

NEXT ITEM: $item_text

Follow .claude/skills/autobuild/SKILL.md. Implement this one item only. Verify it, write the verdict to .claude/autobuild/last-verify, tick its box in docs/QUEUE.md, and commit. Do not start a second item in the same turn. If it turns out to need a judgement only the owner can make, append [decision] to its line in docs/QUEUE.md and stop." "$n"
