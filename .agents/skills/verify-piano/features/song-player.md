# Song Player & Audio Controls

Song Player renders a parsed MIDI Song as falling note bars synchronized with an auto-zoomed on-screen piano keyboard, provides Play/Pause/Restart transport, timeline scrubbing, tempo and volume sliders, audio mute toggling, and live MIDI key/hit highlighting.

## Sub-features

- `player-load-and-autozoom` displays Song metadata, legend (`Right Hand`, `Left Hand`, `Your MIDI Input`, `Matched Hit`), falling-notes canvas, and an auto-zoomed keyboard clamped to the learner's Keyboard Range.
- `player-transport` toggles playback with `▶ Play` / `⏸ Pause` and resets/plays from `0:00` with `↺ Restart`.
- `player-scrub-and-tempo` seeks along the timeline via the `Song progress` slider and scales playback speed (`50%`–`125%`) via the `Tempo speed` slider.
- `player-audio-controls` mutes/unmutes Web Audio synthesis via the top-bar `Mute piano audio` / `Unmute piano audio` button and adjusts gain via the `Audio volume` slider.
- `player-midi-match-and-back` lights pressed MIDI keys (amber) and matched active Song notes (emerald) on the keyboard/canvas, and stops playback when returning via `← Library`.

## How to get to it (user POV)

- Click any Song card in the Song Library (loads the Song's `.mid` file and opens the Player Stage).

## Driving it with piano-verify

Preconditions:

- `piano-verify --run-id $RUN_ID launch` succeeded (viewport `1340x800`) and `piano-verify --run-id $RUN_ID doctor` passed.
- Set `V=.agents/skills/verify-piano/scripts/piano-verify` and `EV=/tmp/verify-piano-evidence-$RUN_ID/song-player`.

- **Open a beginner Song (`Twinkle, Twinkle, Little Star`).** Complete setup at Level 1 and open the Song. Run:
  - `$V --run-id $RUN_ID click button "88 Keys (Full Piano) A0 – C8"`
  - `$V --run-id $RUN_ID wait-text "Skill Calibration · Piece 1 of 3"`
  - `$V --run-id $RUN_ID click button "Pick Level Manually"`
  - `$V --run-id $RUN_ID click button "1" --exact`
  - `$V --run-id $RUN_ID wait-text "Song Library"`
  - `$V --run-id $RUN_ID click button "Twinkle, Twinkle, Little Star"`
  - `$V --run-id $RUN_ID wait-role button "▶ Play"`
  Player displays `Twinkle, Twinkle, Little Star`, badge `L1`, auto-zoomed range subtitle (`Traditional · View F3–F5`), `0:00`, `0:28`, `100%` tempo, and the `<canvas>` visualizer above the keyboard.
- **Capture paused initial state.** Run `$V --run-id $RUN_ID snapshot "$EV/01-paused.aria.yml"` and `$V --run-id $RUN_ID screenshot "$EV/01-paused.png"`.
- **Start playback and pause.** Click `▶ Play`, verify playback toggles to `⏸ Pause` and advances past `0:00`, then click `⏸ Pause`. Run:
  - `$V --run-id $RUN_ID click button "▶ Play"`
  - `$V --run-id $RUN_ID wait-role button "⏸ Pause"`
  - `$V --run-id $RUN_ID wait-text "0:01"`
  - `$V --run-id $RUN_ID screenshot "$EV/02-playing.png"`
  - `$V --run-id $RUN_ID click button "⏸ Pause"`
  - `$V --run-id $RUN_ID wait-role button "▶ Play"`
  The playhead advances and pauses cleanly.
- **Scrub timeline and adjust tempo, volume, and mute.** Set `Song progress` to `12`, `Tempo speed` to `0.75`, `Audio volume` to `0.4`, and toggle mute. Run:
  - `$V --run-id $RUN_ID set-range "Song progress" 12`
  - `$V --run-id $RUN_ID wait-text "0:12"`
  - `$V --run-id $RUN_ID set-range "Tempo speed" 0.75`
  - `$V --run-id $RUN_ID wait-text "75%"`
  - `$V --run-id $RUN_ID set-range "Audio volume" 0.4`
  - `$V --run-id $RUN_ID click button "Mute piano audio"`
  - `$V --run-id $RUN_ID wait-role button "Unmute piano audio"`
  - `$V --run-id $RUN_ID snapshot "$EV/03-controls-updated.aria.yml"`
  - `$V --run-id $RUN_ID screenshot "$EV/03-controls-updated.png"`
  Timer reads `0:12`, tempo reads `75%`, and top-bar audio button switches to `Unmute piano audio` (`Muted`).
- **Restart playback and return to Library.** Unmute, click `↺ Restart`, verify playhead resets to `0:00` and plays (`⏸ Pause`), then return to Library. Run:
  - `$V --run-id $RUN_ID click button "Unmute piano audio"`
  - `$V --run-id $RUN_ID click button "↺ Restart"`
  - `$V --run-id $RUN_ID wait-text "0:00"`
  - `$V --run-id $RUN_ID wait-role button "⏸ Pause"`
  - `$V --run-id $RUN_ID click button "← Library"`
  - `$V --run-id $RUN_ID wait-text "Song Library"`
  Playback stops and `Song Library` returns.
- **Proof.** Check console errors and confirm artifacts exist. Run `$V --run-id $RUN_ID console error` and `ls -la "$EV"`.

## Gotchas

- The `▶ Play` / `⏸ Pause` button renders its icon and label in separate `<span>` elements; wait for it with `wait-role button "▶ Play"` or `wait-role button "⏸ Pause"` rather than `wait-text`.
- The `Audio volume` slider is hidden below Tailwind's `xl` breakpoint (`1280px`). `piano-verify launch` sets the viewport to `1340x800` so `Audio volume` is visible; narrowing the viewport hides it.
- Opening a Song resets `tempo` to `100%` (`1`), while `isMuted` and `volume` persist across Songs in Zustand until page reload.
- `↺ Restart` both seeks to `0:00` and immediately starts playing (`isPlaying = true`), even if the player was paused.
- Because `Twinkle, Twinkle, Little Star` spans only `C4–A4` (9 semitones), auto-zoom enforces the minimum 2-octave span and snaps to white keys (`View F3–F5`).
- In headless Chromium, Web Audio creates an `AudioContext` without physical audio output hardware; verify audio controls via button state (`Audio` / `Muted`), slider values, and zero Web Audio exceptions in `console error`.
