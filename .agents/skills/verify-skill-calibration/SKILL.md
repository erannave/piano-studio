---
name: verify-skill-calibration
description: "Formally model-check the Skill Calibration lifecycle and Skill Level persistence with TLA+ (TLC). Use when changing SkillCalibration, submitCalibration, setManualSkillLevel, Layout's Skill Level picker, or /api/calibration/evaluate and /api/profile/level."
---

# Verify Skill Calibration

Model-checks every interleaving of piece loading, Web MIDI recording, skipping, submission retries, and manual Skill Level selection against `spec/SkillCalibration.tla` using TLC (`tla2tools.jar` v1.7.4).

## Coverage record

- **Sync commit:** `1126af85a048a1ba7cca95c8a1370ea26f2da6d2`
- **Covered files and functions:**
  - `src/components/SkillCalibration.tsx` — `pieceIdx`, `phase`, `parsedPiece`, `finishingRef`, `attemptsRef`, `finishCurrentPiece()`, `subscribeMidiEvents()`, `Start Piece`, `Finish Early`, `Too Hard — Skip`, `Pick Level Manually`, `Re-run Calibration`, `Open Song Library`
  - `src/store/appStore.ts` — `currentStage`, `submitCalibration()`, `setManualSkillLevel()`, `setStage()`
  - `src/components/Layout.tsx` — header Skill Level picker (`setManualSkillLevel` + `setStage("library")`)
  - `server.ts` — `POST /api/calibration/evaluate`, `PATCH /api/profile/level`
  - `src/server/db.ts` — `PianoDatabase.saveCalibrationResult()`, `PianoDatabase.updateSkillLevel()`

## Properties checked

1. **`UniqueAttemptsPerPiece`** — Every calibration submission contains at most one attempt per Calibration Piece, and any persisted calibration result covers pieces `0..NumPieces-1` exactly once in order.
   - *Harm if broken:* Retrying after a failed submit sends duplicate attempts for the same piece, corrupting `calibration_history` and skewing the learner's assigned Skill Level and Teacher Feedback.
2. **`ManualLevelNotClobbered`** — Once the learner explicitly picks a Skill Level manually, an older in-flight calibration submission never overwrites that Skill Level in SQLite or in Zustand.
   - *Harm if broken:* A learner picks their level manually and enters the Song Library, then an 8-second-delayed `/api/calibration/evaluate` response silently overwrites their chosen Skill Level.
3. **`FinishingGuardMatchesSubmit`** — `finishingRef.current` is held if and only if a calibration submission is in flight.
   - *Harm if broken:* A wedged `finishingRef` permanently disables `Finish Early` and `Too Hard — Skip` until page reload.
4. **Deadlock freedom & `TypeOK`** — Every reachable state stays well-typed and can reach the Song Library without deadlocking.

## Bounds and what is left out

- **Bounds:** `NumPieces = 3` (matches the 3 Calibration Pieces in `public/songs/songs.json`); `StateBound` caps `Len(attempts) <= NumPieces + 1` so TLC terminates past duplicate-attempt bugs.
- **Assumptions:** `PATCH /api/profile/level` completes atomically relative to the slower `POST /api/calibration/evaluate` (which waits up to 8s on AI coaching); `recordedCount` is abstracted to `{0, 1}` because the state machine only branches on whether recording started.
- **Not covered:** Deterministic pitch/timing math in `src/shared/calibrationScoring.ts`, keyboard range geometry in `src/shared/keyboardRange.ts`, Web Audio synthesis, and concurrent multi-tab browser sessions.

## Workflow

### 1. Check whether the covered code changed

Compare the current tree against the sync commit above:

```bash
git diff 1126af85a048a1ba7cca95c8a1370ea26f2da6d2 -- \
  src/components/SkillCalibration.tsx \
  src/store/appStore.ts \
  src/components/Layout.tsx \
  server.ts \
  src/server/db.ts
```

If none of the covered functions changed in behavior, no model update is needed; still run step 2 to confirm the baseline.

### 2. Sync the model to the code (if behavior changed)

Before running TLC, update `spec/SkillCalibration.tla` so every action's guard and next-state update still matches the exact indivisible steps in the covered files. Keep comments pointing to the real functions and line ranges.

### 3. Run the model checker

```bash
bun run verify:calibration
# Or pass --all directly to the runner to list every violated invariant in one pass:
.agents/skills/verify-skill-calibration/scripts/check-calibration --all
```

This runs TLC (`-workers 1`, deterministic) in under a second using Java and `tla2tools.jar` v1.7.4 (auto-cached in `~/.cache/tla2tools/` if not already present, or override with `TLA2TOOLS_JAR`).

Read every result with the pstack `/statechart` skill: on any invariant violation, `/statechart` turns the TLC trace into the shortest path in plain words; when all invariants pass, `/statechart` renders the state graph.

### 4. Distinguish a real bug from a modeling error

For any violated invariant, replay the counterexample trace step by step against the real code (by code inspection or a targeted test/repro):

- If each step in the trace is actually possible in the code, it is a **real bug** — report it in the code's terms and keep the invariant intact.
- If a step in the trace is blocked by a guard in the real code that the model omitted, it is a **modeling error** — tighten the model's action guard to match the code and rerun step 3.

### 5. Update the sync commit

Only after confirming that `spec/SkillCalibration.tla` accurately describes the covered code at the new commit and you have recorded any findings, update **Sync commit** in this file to `git rev-parse HEAD`.

## Baseline status

All four invariants (`TypeOK`, `UniqueAttemptsPerPiece`, `ManualLevelNotClobbered`, `FinishingGuardMatchesSubmit`) and deadlock freedom pass:

- `SkillCalibration.tsx` writes each attempt by index (`pieceIdx`) and trims `attemptsRef.current` back to `pieceIdx` on submit failure or superseding, preventing duplicate attempts on retry.
- `appStore.ts` aborts any in-flight `submitCalibration()` and bumps `levelWriteSeq` on `setManualSkillLevel()`, while `server.ts` + `db.ts` guard `POST /api/calibration/evaluate` with optimistic concurrency (`level_version` via `saveCalibrationResultIfCurrent()`), preventing stale calibration responses from overwriting a manual Skill Level.
- `finally { finishingRef.current = false; }` in `SkillCalibration.tsx` keeps `FinishingGuardMatchesSubmit` holding on both success and failure.
