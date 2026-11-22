# Skill Calibration

Skill Calibration guides a learner through 3 benchmark Calibration Pieces across Difficulty Levels 2, 5, and 8 (or lets them skip pieces or pick a Skill Level manually), scores played MIDI notes deterministically on the server, persists the resulting Skill Level and calibration history in SQLite, and presents coaching feedback.

## Sub-features

- `calibration-skip-all` skips all 3 Calibration Pieces via `Too Hard — Skip`, evaluates on the server, assigns `Level 1` with `Local Assessment`, records a `calibration_history` row, and displays the results screen.
- `calibration-midi-play` arms a piece via `Start Piece`, starts recording on the first MIDI `noteOn`, plays target notes on the canvas/keyboard, and finishes via `Finish Early` (or the 15-second timer) to record non-zero accuracy and matched notes on the results screen.
- `calibration-manual-level` opens the `Pick Level Manually` inline drawer and jumps directly to `Song Library` at the chosen Skill Level.
- `calibration-rerun` restarts calibration from the results screen (`Re-run Calibration`), the Library coaching banner (`Re-calibrate`), or the top-bar Skill Level popover (`Re-run Skill Calibration`).

## How to get to it (user POV)

- Complete Step 1 (`Keyboard Range Setup`) on a fresh profile (automatically enters Skill Calibration).
- Click `Re-calibrate` in the Song Library's `Last Calibration Feedback` banner.
- Click the top-bar `Level N ▼` (or `Unrated ▼`) button and choose `Re-run Skill Calibration`.
- Click `Re-run Calibration` on the `Skill Calibration Complete` results screen.

## Driving it with piano-verify

Preconditions:

- `piano-verify --run-id $RUN_ID launch` succeeded (with `AI_ENDPOINT=off`) and `piano-verify --run-id $RUN_ID doctor` passed.
- Set `V=.agents/skills/verify-piano/scripts/piano-verify` and `EV=/tmp/verify-piano-evidence-$RUN_ID/skill-calibration` (`mkdir -p "$EV"`).

- **Complete Keyboard Range to enter Skill Calibration.** Select `88 Keys (Full Piano)`. Run `$V --run-id $RUN_ID click button "88 Keys (Full Piano) A0 – C8"` and `$V --run-id $RUN_ID wait-text "Ode to Joy (Calibration) — Ludwig van Beethoven"`. Piece 1 of 3 (`Difficulty 2`) loads with `Start Piece`, `Too Hard — Skip`, and `Pick Level Manually` buttons.
- **Skip all 3 Calibration Pieces (no-MIDI path).** Capture initial state, then skip all 3 pieces. Run:
  - `$V --run-id $RUN_ID snapshot "$EV/01-piece1-ready.aria.yml"`
  - `$V --run-id $RUN_ID click button "Too Hard — Skip"`
  - `$V --run-id $RUN_ID wait-text "Prelude in C Major (Calibration) — Johann Sebastian Bach"`
  - `$V --run-id $RUN_ID click button "Too Hard — Skip"`
  - `$V --run-id $RUN_ID wait-text "Für Elise (Calibration) — Ludwig van Beethoven"`
  - `$V --run-id $RUN_ID click button "Too Hard — Skip"`
  - `$V --run-id $RUN_ID wait-text "Skill Calibration Complete"`
  The results screen renders `Your Starting Skill Level: Level 1`, `Local Assessment`, and 3 `Skipped` piece cards; top-bar updates to `Level 1 ▼`.
- **Confirm skip-all persistence and enter Library.** Capture results proof and check SQLite. Run:
  - `$V --run-id $RUN_ID snapshot "$EV/02-results-skip.aria.yml"`
  - `$V --run-id $RUN_ID screenshot "$EV/02-results-skip.png"`
  - `$V --run-id $RUN_ID db > "$EV/02-db-skip.json"`
  - `$V --run-id $RUN_ID click button "Open Song Library →"`
  - `$V --run-id $RUN_ID wait-text "Last Calibration Feedback (Local)"`
  SQLite has `learner_profile.skill_level = 1`, `feedback_source = "local"`, and 1 row in `calibration_history` with `piece_count: 3`.
- **Re-run calibration with virtual MIDI notes.** Enable virtual MIDI, click `Re-calibrate`, arm Piece 1 (`Ode to Joy (Calibration)`), play its opening notes (`E4=64, E4=64, F4=65, G4=67`), finish early, and skip pieces 2 and 3. Run:
  - `$V --run-id $RUN_ID virtual-midi enable`
  - `$V --run-id $RUN_ID click button "Re-calibrate"`
  - `$V --run-id $RUN_ID wait-text "Ode to Joy (Calibration) — Ludwig van Beethoven"`
  - `$V --run-id $RUN_ID click button "Start Piece"`
  - `$V --run-id $RUN_ID wait-text "Play your first note on the piano to start!"`
  - `$V --run-id $RUN_ID virtual-midi note 64 100 120`
  - `$V --run-id $RUN_ID wait-text "Finish Early"`
  - `$V --run-id $RUN_ID virtual-midi note 64 100 120`
  - `$V --run-id $RUN_ID virtual-midi note 65 100 120`
  - `$V --run-id $RUN_ID virtual-midi note 67 100 120`
  - `$V --run-id $RUN_ID click button "Finish Early"`
  - `$V --run-id $RUN_ID wait-text "Prelude in C Major (Calibration) — Johann Sebastian Bach"`
  - `$V --run-id $RUN_ID click button "Too Hard — Skip"`
  - `$V --run-id $RUN_ID wait-text "Für Elise (Calibration) — Ludwig van Beethoven"`
  - `$V --run-id $RUN_ID click button "Too Hard — Skip"`
  - `$V --run-id $RUN_ID wait-text "Skill Calibration Complete"`
  The results screen shows non-zero accuracy on `Ode to Joy (Calibration)` (`<N>% acc`, `<matched>/<expected> notes`), `Local Assessment`, and SQLite now has 2 rows in `calibration_history`.
- **Verify manual level drawer.** Click `Re-run Calibration`, open `Pick Level Manually`, and pick Level `6`. Run:
  - `$V --run-id $RUN_ID click button "Re-run Calibration"`
  - `$V --run-id $RUN_ID click button "Pick Level Manually"`
  - `$V --run-id $RUN_ID click button "6" --exact`
  - `$V --run-id $RUN_ID wait-text "Recommended (L5–L7)"`
  Library opens with `Level 6 ▼` in the header and `skill_level: 6` in SQLite.
- **Proof.** Capture final snapshot, screenshot, DB dump, and console check. Run `$V --run-id $RUN_ID snapshot "$EV/03-after-manual.aria.yml"`, `$V --run-id $RUN_ID screenshot "$EV/03-after-manual.png"`, `$V --run-id $RUN_ID db > "$EV/03-db-final.json"`, and `$V --run-id $RUN_ID console error`.

## Gotchas

- `Start Piece` stays disabled briefly while the current Calibration Piece's `.mid` file loads over HTTP. Wait for the piece heading and ensure `Start Piece` is enabled before clicking.
- Without `AI_ENDPOINT=off`, playing even one note causes `POST /api/calibration/evaluate` to attempt a network call to `http://192.168.0.101:8317/v1/messages` and stall for up to 8 seconds before falling back to local feedback. Always launch with `piano-verify` (which sets `AI_ENDPOINT=off`) unless specifically testing an AI coaching endpoint.
- In `armed` phase without MIDI connected, the prompt reads `Connect MIDI piano, or use Skip / Pick Level` instead of `Play your first note on the piano to start!`.
- Each Calibration Piece auto-finishes at 15 seconds (or earlier if the piece is shorter, minimum 8s). Use `Finish Early` during short verification drives to keep runs fast and deterministic; playing only 4 opening notes still scores `Level 1` while recording non-zero accuracy and matched notes.
- `Pick Level Manually` does not insert a `calibration_history` row; it calls `PATCH /api/profile/level` and preserves any existing `feedback` banner.
