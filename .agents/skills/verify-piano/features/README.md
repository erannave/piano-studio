# Piano Studio verification map

This directory is the maintained source for verifying the user-facing behavior of Piano Studio (`piano-learning-app`). Read this index before driving the app, then follow the matching feature file.

## Baseline preconditions

- Start from the repo root with `.agents/skills/verify-piano/scripts/piano-verify` executable.
- Launch an isolated run with `piano-verify --run-id <run-id> launch` (ephemeral port, disposable SQLite DB at `/tmp/verify-piano-run-<run-id>/piano.db`, `AI_ENDPOINT=off`, `1340x800` browser viewport).
- Run `piano-verify --run-id <run-id> doctor` and require every check to pass before driving a feature.
- Confirm the Song Catalog has 10 seeded Songs, including 3 Calibration Pieces (`Ode to Joy`, `Prelude in C Major (BWV 846)`, `Für Elise (Main Theme)`).
- Never drive an instance that was not started by this verification run.

## Driving conventions

- Start every recipe from a fresh isolated instance unless its preconditions state a calibrated profile.
- Prefer ARIA roles, accessible names, and slider `aria-label`s via `piano-verify click` and `piano-verify set-range`.
- Treat every quoted label literally, including en-dashes (`–`, U+2013) in note ranges like `Keys C2–C7` and `Recommended (L1–L2)`.
- Pass `--exact` when clicking single-digit Skill Level buttons (`"1"` through `"10"`) so `"1"` does not match `"10"`.
- For MIDI-dependent journeys in headless Chromium, attach the virtual Web MIDI boundary with `piano-verify virtual-midi enable` rather than calling store internals.
- Run `piano-verify --run-id <run-id> cleanup` after every run (including failed runs) and confirm proof files remain in `/tmp/verify-piano-evidence-<run-id>/`.

## Proof and skip reporting

- Capture both the user action and the resulting state, not only the final screen.
- UI proof includes an ARIA snapshot and a PNG screenshot showing the `Piano Studio` header and active Stage.
- Persisted mutation proof includes a page reload (`piano-verify browser reload`) and a read-only SQLite check (`piano-verify db`).
- Record the feature ID and entry point used with every artifact.
- Report an unreachable path with the attempted command and the unmet precondition; never report a skipped entry point as verified through a different path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior, followed by exactly four H2 sections in this order:

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with piano-verify` starts with `Preconditions:` and uses labeled bullets pairing each user action with an exact command and observable result.
4. `Gotchas` lists traps that can waste or invalidate a verification run.

## Features

- [Keyboard Range Setup](./keyboard-range.md) covers first-run onboarding, preset selection, MIDI key detection, recalibration, and Song transposition/filtering.
- [Skill Calibration](./skill-calibration.md) covers the 3 Calibration Pieces, MIDI-triggered recording, skipping all pieces, manual Skill Level selection, scoring results, and re-running calibration.
- [Song Library & Skill Level Filtering](./song-library.md) covers Recommended vs All Songs filtering, top-bar Skill Level adjustment, calibration coaching feedback banner, and opening a Song.
- [Song Player & Audio Controls](./song-player.md) covers falling-notes playback, auto-zoomed keyboard bounds, transport controls, timeline scrubbing, tempo/volume/mute controls, live MIDI hits, and returning to Library.
