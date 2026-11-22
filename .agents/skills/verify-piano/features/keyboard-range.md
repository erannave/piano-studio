# Keyboard Range Setup

Keyboard Range Setup establishes the physical lowest and highest MIDI keys on the learner's piano via a standard preset or live MIDI end-key capture, persists the range in SQLite, hides out-of-range keys on the on-screen keyboard, and adapts or filters Songs in the Song Library.

## Sub-features

- `range-first-run` lands an uncalibrated learner on `Step 1 · Keyboard Range Setup` with the full 88-key (`A0–C8`) reference keyboard.
- `range-preset` saves a standard keyboard size (`88`, `76`, `61`, or `49` keys), updates the top-bar `Keys` indicator, and advances to Skill Calibration (or Library if already rated).
- `range-midi-detect` captures the lowest and highest pressed MIDI keys, supports `Retry`, and persists the detected span on `Save Keyboard Range`.
- `range-recalibrate` re-opens Keyboard Range Setup from the top-bar `Keys <min>–<max>` button or the Library empty-state `Adjust Keyboard Range` button.
- `range-song-adaptation` transposes Songs by whole octaves (`+1 oct`) or hides Songs wider than a narrow calibrated Keyboard Range.

## How to get to it (user POV)

- Open Piano Studio with a fresh, uncalibrated profile (automatically lands on Keyboard Range Setup).
- Click the `Keys <min>–<max>` button in the top bar from any Stage.
- Click `Adjust Keyboard Range` in the Song Library empty state when no Songs fit the current range.

## Driving it with piano-verify

Preconditions:

- `piano-verify --run-id $RUN_ID launch` succeeded from an empty disposable DB and `piano-verify --run-id $RUN_ID doctor` passed.
- Set `V=.agents/skills/verify-piano/scripts/piano-verify` and `EV=/tmp/verify-piano-evidence-$RUN_ID/keyboard-range`.

- **Confirm first-run landing.** Inspect the initial Stage. Run `$V --run-id $RUN_ID wait-text "Calibrate Your Physical Keyboard"` and `$V --run-id $RUN_ID snapshot "$EV/01-initial.aria.yml"`. Heading `Calibrate Your Physical Keyboard` is visible, top-bar shows `Keys A0–C8` and `Unrated ▼`, and the 4 preset buttons appear.
- **Select 49-key preset.** Choose `49 Keys`. Run `$V --run-id $RUN_ID click button "49 Keys C2 – C6"` and `$V --run-id $RUN_ID wait-text "Skill Calibration · Piece 1 of 3"`. The top-bar button updates to `Keys C2–C6` and the app advances to Skill Calibration.
- **Confirm persistence in SQLite and across reload.** Inspect the DB and reload. Run `$V --run-id $RUN_ID db` and `$V --run-id $RUN_ID browser reload` followed by `$V --run-id $RUN_ID wait-text "Skill Calibration · Piece 1 of 3"`. SQLite shows `keyboard_min_note: 36`, `keyboard_max_note: 84`, `keyboard_calibrated: 1`, and reload stays on Skill Calibration (skipping Step 1) with `Keys C2–C6`.
- **Verify octave transposition in Library.** Set a manual Skill Level of `9` via the top bar so `Moonlight Sonata` (native `F#1–G#4`, MIDI `30–68`) appears in Recommended. Run `$V --run-id $RUN_ID click button "Unrated ▼"`, `$V --run-id $RUN_ID click button "9" --exact`, and `$V --run-id $RUN_ID wait-text "Song Library"`. The Library subtitle shows `Showing 3 playable songs for your C2–C6 keyboard`, and `Moonlight Sonata (1st Mvt. Excerpt)` displays a `+1 oct` badge with range `F#2–G#5`.
- **Re-open and drive MIDI end-key detection (narrow 37-key range).** Attach the virtual MIDI boundary, re-open Keyboard Range Setup, press `C3` (MIDI `48`) and `C6` (MIDI `84`), retry once, then save. Run:
  - `$V --run-id $RUN_ID virtual-midi enable`
  - `$V --run-id $RUN_ID click button "Keys C2–C6"`
  - `$V --run-id $RUN_ID wait-text "Current Range"`
  - `$V --run-id $RUN_ID virtual-midi note 48 100 100`
  - `$V --run-id $RUN_ID wait-text "Press highest key…"`
  - `$V --run-id $RUN_ID virtual-midi note 84 100 100`
  - `$V --run-id $RUN_ID wait-text "Detected C3 – C6 (37 keys)"`
  - `$V --run-id $RUN_ID click button "Save Keyboard Range"`
  - `$V --run-id $RUN_ID wait-text "Song Library"`
  Because a Skill Level is already set, saving returns directly to `Song Library`, top-bar shows `Keys C3–C6`, and the subtitle notes `(4 hidden — wider than keyboard)`.
- **Proof.** Capture the adapted Library state and DB proof. Run `$V --run-id $RUN_ID snapshot "$EV/02-adapted-library.aria.yml"`, `$V --run-id $RUN_ID screenshot "$EV/02-adapted-library.png"`, and `$V --run-id $RUN_ID db > "$EV/02-db.json"`. The artifacts show `Keys C3–C6`, hidden-song notice, and SQLite `keyboard_min_note: 48`, `keyboard_max_note: 84`.

## Gotchas

- Button labels use an en-dash (`–`, U+2013) without spaces in the top bar (`Keys C2–C6`) and with spaces in presets (`49 Keys C2 – C6`). Copy the exact character.
- All 10 seeded Songs fit inside the `49 Keys` (`C2–C6`) preset (with `Moonlight Sonata` transposed `+1 oct`); to observe excluded songs (`hidden — wider than keyboard`), calibrate a span narrower than 38 semitones (such as 37 keys, `C3–C6`).
- Saving Keyboard Range advances to Skill Calibration only while `skillLevel === null`; once a Skill Level is saved, recalibrating returns straight to `Song Library`.
- Pressing keys in reverse order (highest first, then lowest) still works because the component normalizes with `Math.min` / `Math.max` on save.
- `virtual-midi enable` reloads the page to bind `navigator.requestMIDIAccess`; enable it before starting mid-flow UI state you want to preserve.
