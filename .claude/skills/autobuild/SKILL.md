---
name: autobuild
description: Build the next item in docs/QUEUE.md without being asked to continue. Arms a Stop hook that keeps the turn alive until the queue empties, the iteration cap is hit, an item needs an owner decision, or verification fails twice running.
disable-model-invocation: true
allowed-tools: Bash, Read, Edit, Write, Glob, Grep
---

# autobuild

Works the top of `docs/QUEUE.md` down, one item per turn, without the owner
typing "continue".

The skill is the judgement half. The enforcement half is
`.claude/hooks/autobuild-stop.sh`, a `Stop` hook that refuses to let the turn end
while work remains. Neither half works alone: a skill cannot stop Claude from
stopping, and a hook cannot decide what "done" means.

## Commands

| Invocation | Do this |
| --- | --- |
| `/autobuild` | Arm the loop and start on the topmost ready item. |
| `/autobuild stop` | Disarm: `rm -f .claude/autobuild/ACTIVE`. Confirm it is off. |
| `/autobuild status` | Print the ready count, iteration count/cap, last verdict, and the last 10 lines of the log. Change nothing. |
| `/autobuild <n>` | Arm with a cap of `<n>` iterations instead of the default 10. |

## Arming

```bash
cd "$CLAUDE_PROJECT_DIR"
mkdir -p .claude/autobuild
echo 0  > .claude/autobuild/iterations
echo 0  > .claude/autobuild/fail-streak
echo 10 > .claude/autobuild/max-iterations   # or the requested cap
echo pass > .claude/autobuild/last-verify
rm -f .claude/autobuild/STOP
: > .claude/autobuild/ACTIVE                 # empty: the first Stop claims it
```

`ACTIVE` must be created **empty**. The hook writes the session id into it on its
first fire, which is what keeps the loop from hijacking other conversations in
this repo.

Then say plainly that the loop is armed, what the cap is, and that `/autobuild
stop` or Esc ends it — before starting work, so the owner can veto.

## One iteration

Take the item the hook named. One item. Not the next one too, however small it
looks — the queue order is the owner's, and a turn that quietly does three
things is a turn they cannot review.

1. **Read the context.** The queue line is a pointer; the reasoning is in
   `docs/PLAN.md`. Read the relevant section before writing code. If PLAN.md
   already rejected the approach you are about to take, it says so and why.
2. **Implement it.**
3. **Verify.** `/Users/haoxuanlong/.local/lib/node/bin/npm run build`
   (`tsc && vite build`). Absolute path: spawned processes do not get the
   interactive PATH. Where the change is visible in the browser, also verify it
   there per the repo's own practice — PLAN.md section F2 is a long account of
   what shipping an unverified visual change cost, and it is worth not repeating.
4. **Record the verdict**, because the hook reads this and nothing else:
   ```bash
   echo pass                 > .claude/autobuild/last-verify   # build green
   echo "fail <queue-item>"  > .claude/autobuild/last-verify   # build red
   ```
   Two consecutive `fail` verdicts on the same item disarm the loop. That is the
   intended behaviour — it is the difference between a loop that stops and one
   that spends eight iterations re-attempting a broken approach.
5. **Tick the box** in `docs/QUEUE.md`: `- [ ]` → `- [x]`, move the line to Done,
   append the commit hash.
6. **Commit.** One item, one commit, message in the repo's existing voice — the
   log reads `Dran Sword, actually fixed: clone() does not rebind skeletons`,
   not `fix: update model loader`. Say what was wrong and what is now true.

Then end the turn normally. The hook decides whether there is a next iteration;
do not call it yourself, and do not pre-emptively start one.

## When to stop rather than guess

Append `[decision]` to the item's line in `docs/QUEUE.md`, say why in one or two
sentences, and end the turn. The hook halts the loop on it.

Do that when the item has more than one defensible answer and they lead to
different amounts of work or deletion — PLAN.md's B2 ("**Needs a decision before
B1 lands** — the two answers lead to different amounts of deletion") is the
model. Also stop for: anything touching the save format or a migration, anything
that would delete a subsystem, and any item whose queue line turns out to
describe work the code has already done.

Do **not** stop for an ordinary implementation choice with a defensible default.
Pick it, say which you picked in the commit message, and keep going.

## Never

- **Never invent queue items.** The loop builds what the owner queued. If you
  notice something worth doing, add it to Ready as `- [~]` (parked) and mention
  it — do not park it silently, and do not build it.
- **Never tick a box on a red build.** The tick means verified.
- **Never re-arm after the loop disarms itself.** It stopped for a stated
  reason; putting `ACTIVE` back is overriding the owner's brake.
- **Never edit `docs/PLAN.md` to make an item look done.** Update it to record
  what was learned, the way the existing sections do.

## State

All under `.claude/autobuild/`, gitignored, safe to delete when the loop is off.

| File | Meaning |
| --- | --- |
| `ACTIVE` | Present = armed. Contains the session id that owns the loop. |
| `iterations` | Continuations so far this run. |
| `max-iterations` | The cap. Default 10. |
| `last-verify` | `pass`, or `fail <item>`. The hook reads only this. |
| `fail-streak`, `fail-item` | Consecutive failures on one item. |
| `STOP` | Create it to kill the loop from outside the session. |
| `log` | Append-only: every continue and every disarm, with a reason. |

## Kill switches

Esc or Ctrl+C interrupts the turn. `/autobuild stop` disarms. From another
terminal, `touch .claude/autobuild/STOP`. Deleting `.claude/autobuild/ACTIVE`
works from anywhere. Any one of them is enough.
