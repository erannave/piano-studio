# Song Player & Audio Controls

Song Player renders a parsed MIDI Song in a default grand-staff Score view (`ScoreCanvas`) or toggleable falling-notes Piano Roll (`FallingNotesCanvas`) synchronized with an auto-zoomed clickable on-screen piano keyboard, provides Play/Pause/Cancel/Restart transport, timeline scrubbing, tempo and volume sliders, audio mute toggling, a Tier 1 Practice Bar (Wait Mode, Hand Isolation, A-B Loop, Count-In, Metronome, note Names), and live MIDI key/hit highlighting.

## Sub-features

- `player-load-and-views` displays Song metadata (`L<N>`, `{composer} · {bpm} BPM · {num}/{den}`), defaults to `𝄞 Score` notation (`ScoreCanvas`), toggles to `Piano Roll` (`FallingNotesCanvas`) and `Names` note labels, and auto-zooms the clickable keyboard clamped to the learner's Keyboard Range.
- `player-transport-and-countin` defaults `Count-In` to enabled (clicking `▶ Play` shows `Get Ready` and `⏸ Cancel` for 1 bar before playing); disabling `Count-In` switches `▶ Play` directly to `⏸ Pause`, and `↺` resets/plays from `0:00`.
- `player-scrub-and-tempo` seeks along the timeline via the `Song progress` slider and scales playback speed (`25%`–`150%`) via the `Tempo speed` slider.
- `player-practice-tools` provides `Wait Mode` (`● Wait Mode` + `Waiting for:` prompt), Hand Isolation (`Both` / `RH` / `LH` + conditional `Accomp On` / `Accomp Muted`), A-B Loop (`Set A`, `Set B`, `Loop On` / `Loop Off`, `Clear loop`), and `Metronome`.
- `player-audio-controls` mutes/unmutes piano audio (`smplr` `SplendidGrandPiano` with Web Audio oscillator fallback) via top-bar `Mute piano audio` / `Unmute piano audio` and adjusts gain via the `Audio volume` slider.
- `player-midi-match-and-back` lights pressed MIDI or clicked keys (amber) and matched active Song notes (emerald) on the keyboard/canvas, and stops playback when returning via `← Library`.

## How to get to it (user POV)

- Click any Song card in the Song Library (loads the Song's `.mid` file and opens the Player Stage).

## Driving it with piano-verify

Preconditions:

- `piano-verify --run-id $RUN_ID launch` succeeded (viewport `1340x800`) and `piano-verify --run-id $RUN_ID doctor` passed.
- Set `V=.agents/skills/verify-piano/scripts/piano-verify` and `EV=/tmp/verify-piano-evidence-$RUN_ID/song-player` (`mkdir -p "$EV"`).

- **Open a beginner Song (`Twinkle Twinkle Little Star`).** Complete setup at Level 1 and open the Song. Run:
  - `$V --run-id $RUN_ID click button "88 Keys (Full Piano) A0 – C8"`
  - `$V --run-id $RUN_ID wait-text "Skill Calibration · Piece 1 of 3"`
  - `$V --run-id $RUN_ID click button "Pick Level Manually"`
  - `$V --run-id $RUN_ID click button "1" --exact`
  - `$V --run-id $RUN_ID wait-text "Song Library"`
  - `$V --run-id $RUN_ID click button "Twinkle Twinkle Little Star"`
  - `$V --run-id $RUN_ID wait-role button "▶ Play"`
  Player displays `Twinkle Twinkle Little Star`, badge `L1`, subtitle `Trad. · 80 BPM · 4/4`, `0:00`, `0:36`, `100%` tempo, and the default `𝄞 Score` view above the auto-zoomed keyboard.
- **Capture paused Score view.** Run `$V --run-id $RUN_ID snapshot "$EV/01-score-paused.aria.yml"` and `$V --run-id $RUN_ID screenshot "$EV/01-score-paused.png"`.
- **Verify default Count-In, then switch to Piano Roll and play/pause.** Confirm `Count-In` triggers `⏸ Cancel` on `▶ Play`, cancel it, switch to `Piano Roll`, disable `Count-In`, start playback, verify playhead advances past `0:00`, and pause. Run:
  - `$V --run-id $RUN_ID click button "▶ Play"`
  - `$V --run-id $RUN_ID wait-role button "⏸ Cancel"`
  - `$V --run-id $RUN_ID click button "⏸ Cancel"`
  - `$V --run-id $RUN_ID wait-role button "▶ Play"`
  - `$V --run-id $RUN_ID click button "Piano Roll"`
  - `$V --run-id $RUN_ID click button "Count-In"`
  - `$V --run-id $RUN_ID click button "▶ Play"`
  - `$V --run-id $RUN_ID wait-role button "⏸ Pause"`
  - `$V --run-id $RUN_ID wait-text "0:01"`
  - `$V --run-id $RUN_ID click button "⏸ Pause"`
  - `$V --run-id $RUN_ID wait-role button "▶ Play"`
  Count-In starts/cancels cleanly, `Piano Roll` renders, and playback advances and pauses cleanly.
- **Scrub timeline and exercise audio + Tier 1 Practice Bar controls.** Set `Song progress` to `12`, `Tempo speed` to `0.75`, `Audio volume` to `0.4`, mute audio, and toggle `Wait Mode`, `RH` hand isolation, `Set A`, `Names`, and `Metronome`. Run:
  - `$V --run-id $RUN_ID set-range "Song progress" 12`
  - `$V --run-id $RUN_ID wait-text "0:12"`
  - `$V --run-id $RUN_ID set-range "Tempo speed" 0.75`
  - `$V --run-id $RUN_ID wait-text "75%"`
  - `$V --run-id $RUN_ID set-range "Audio volume" 0.4`
  - `$V --run-id $RUN_ID click button "Mute piano audio"`
  - `$V --run-id $RUN_ID wait-role button "Unmute piano audio"`
  - `$V --run-id $RUN_ID click button "Wait Mode"`
  - `$V --run-id $RUN_ID wait-role button "● Wait Mode"`
  - `$V --run-id $RUN_ID click button "RH"`
  - `$V --run-id $RUN_ID wait-role button "Accomp On"`
  - `$V --run-id $RUN_ID click button "Set A"`
  - `$V --run-id $RUN_ID wait-text "A 0:12"`
  - `$V --run-id $RUN_ID click button "Names"`
  - `$V --run-id $RUN_ID click button "Metronome"`
  - `$V --run-id $RUN_ID snapshot "$EV/02-controls-updated.aria.yml"`
  - `$V --run-id $RUN_ID screenshot "$EV/02-controls-updated.png"`
  Timer reads `0:12`, tempo reads `75%`, top-bar audio button switches to `Unmute piano audio` (`Muted`), `● Wait Mode` and `Accomp On` appear, and loop start reads `A 0:12`.
- **Restart playback and return to Library.** Unmute, click `↺` (`--exact`), verify playhead resets to `0:00`, then return to Library. Run:
  - `$V --run-id $RUN_ID click button "Unmute piano audio"`
  - `$V --run-id $RUN_ID click button "↺" --exact`
  - `$V --run-id $RUN_ID wait-text "0:00"`
  - `$V --run-id $RUN_ID click button "← Library"`
  - `$V --run-id $RUN_ID wait-text "Song Library"`
  Playback stops and `Song Library` returns.
- **Proof.** Check console errors and confirm artifacts exist. Run `$V --run-id $RUN_ID console error` and `ls -la "$EV"`.

## Gotchas

- `Count-In` is enabled by default (`countInEnabled: true`), so clicking `▶ Play` or `↺` first enters a 1-bar `Get Ready` count-in (`⏸ Cancel`) before transitioning to `⏸ Pause`. Click `Count-In` to toggle it off when testing immediate playback.
- The Restart button's accessible name is just `↺` (no `"Restart"` text); target it with `click button "↺" --exact`.
- The `▶ Play` / `⏸ Pause` / `⏸ Cancel` button renders its icon and label in separate `<span>` elements; wait for it with `wait-role button "▶ Play"` or `wait-role button "⏸ Pause"` rather than `wait-text`.
- The `Audio volume` slider is hidden below Tailwind's `xl` breakpoint (`1280px`). `piano-verify launch` sets the viewport to `1340x800` so `Audio volume` is visible; narrowing the viewport hides it.
- Opening a Song resets `tempo` to `100%` (`1`), while `isMuted`, `volume`, and practice toggles (`viewMode`, `countInEnabled`, `waitMode`, `practiceHand`, `metronomeEnabled`, `showNoteNames`) persist across Songs in Zustand until page reload.
- In headless Chromium, Web Audio creates an `AudioContext` without physical audio output hardware; verify audio controls via button state (`Audio` / `Muted`), slider values, and zero Web Audio exceptions in `console error`.
