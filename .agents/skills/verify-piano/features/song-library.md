# Song Library & Skill Level Filtering

Song Library displays playable Songs from the seeded Song Catalog matched to the learner's Keyboard Range and Skill Level, supports switching between Recommended (±1 level) and All Songs views, allows instant Skill Level adjustment from the top bar, surfaces the last calibration coaching feedback, and launches any Song in the Player Stage.

## Sub-features

- `library-recommended-filter` defaults to `Recommended (L<min>–L<max>)`, showing only Songs within `±1` Difficulty Level of the learner's Skill Level.
- `library-all-songs` switches to `All Songs (<N>)`, listing all Keyboard-Range-compatible Songs sorted from Level 1 to Level 10.
- `library-manual-level-picker` opens the top-bar `Level N ▼` popover, persists a new Skill Level (`1`–`10`) across reload, and immediately updates the Recommended filter and card highlights.
- `library-feedback-banner` renders `Last Calibration Feedback (Local)` (or `(AI)`) with a `Re-calibrate` button whenever calibration feedback is stored.
- `library-open-song` loads a clicked Song's `.mid` file and transitions to the Song Player Stage.

## How to get to it (user POV)

- Finish Skill Calibration and click `Open Song Library →` (or choose a level via `Pick Level Manually`).
- Open Piano Studio when both `keyboardRange.calibrated` is `true` and `skillLevel` is non-null (auto-lands on Song Library).
- Click `← Library` in the top bar from the Song Player Stage or from re-opened Calibration.

## Driving it with piano-verify

Preconditions:

- `piano-verify --run-id $RUN_ID launch` succeeded and `piano-verify --run-id $RUN_ID doctor` passed.
- Set `V=.agents/skills/verify-piano/scripts/piano-verify` and `EV=/tmp/verify-piano-evidence-$RUN_ID/song-library`.

- **Reach Library at Level 2.** Pick `88 Keys (Full Piano)`, then open `Pick Level Manually` and pick `2`. Run:
  - `$V --run-id $RUN_ID click button "88 Keys (Full Piano) A0 – C8"`
  - `$V --run-id $RUN_ID wait-text "Skill Calibration · Piece 1 of 3"`
  - `$V --run-id $RUN_ID click button "Pick Level Manually"`
  - `$V --run-id $RUN_ID click button "2" --exact`
  - `$V --run-id $RUN_ID wait-text "Song Library"`
  Header shows `Level 2 ▼`, `Recommended (L1–L3)` is active, and 3 Songs appear (`Twinkle, Twinkle, Little Star`, `Ode to Joy`, `Aura Lee (Two Hands)`).
- **Capture Recommended view.** Run `$V --run-id $RUN_ID snapshot "$EV/01-recommended-l2.aria.yml"` and `$V --run-id $RUN_ID screenshot "$EV/01-recommended-l2.png"`.
- **Switch to All Songs.** Click `All Songs (10)`. Run `$V --run-id $RUN_ID click button "All Songs (10)"` and `$V --run-id $RUN_ID wait-text "Rondo Alla Turca (Excerpt)"`. Subtitle updates to `Showing 10 playable songs for your A0–C8 keyboard` and all 10 catalog Songs (Level 1 through Level 10) are listed.
- **Adjust Skill Level from top-bar popover and verify persistence.** Switch back to Recommended, change Skill Level to `7`, reload, and verify SQLite. Run:
  - `$V --run-id $RUN_ID click button "Recommended (L1–L3)"`
  - `$V --run-id $RUN_ID click button "Level 2 ▼"`
  - `$V --run-id $RUN_ID click button "7" --exact`
  - `$V --run-id $RUN_ID wait-text "Recommended (L6–L8)"`
  - `$V --run-id $RUN_ID browser reload`
  - `$V --run-id $RUN_ID wait-text "Recommended (L6–L8)"`
  - `$V --run-id $RUN_ID db > "$EV/02-db-l7.json"`
  After reload, header still displays `Level 7 ▼`, Recommended lists `Canon in D (Excerpt)` (L6), `Gymnopédie No. 1 (Excerpt)` (L7), and `Für Elise (Main Theme)` (L8), and SQLite `learner_profile.skill_level` is `7`.
- **Open a Song into the Player Stage.** Click `Für Elise (Main Theme)`. Run `$V --run-id $RUN_ID click button "Für Elise (Main Theme)"` and `$V --run-id $RUN_ID wait-role button "▶ Play"`. The Song Player Stage loads `Für Elise (Main Theme)` with `← Library` in the top bar.
- **Proof.** Capture the updated Library (before clicking into Player) or return via `← Library` and capture. Run `$V --run-id $RUN_ID click button "← Library"`, `$V --run-id $RUN_ID wait-text "Song Library"`, `$V --run-id $RUN_ID snapshot "$EV/03-library-l7.aria.yml"`, `$V --run-id $RUN_ID screenshot "$EV/03-library-l7.png"`, and `$V --run-id $RUN_ID console error`.

## Gotchas

- `Recommended` falls back to showing all fitted Songs if zero Songs fall within `±1` of the learner's Skill Level (for example, on a very narrow keyboard that hides all neighboring-difficulty songs).
- The top-bar `← Library` button is hidden whenever `profile.skillLevel === null` (initial unrated onboarding).
- Clicking a Song card matches its full button accessible name (which includes `Level N`, title, composer, description, range, and `Play →`); Playwright substring matching with `click button "Für Elise (Main Theme)"` (without `--exact`) targets the card reliably.
- Switching Skill Level via the top-bar popover closes the popover and moves off Calibration to Library if you were on the Calibration Stage.
