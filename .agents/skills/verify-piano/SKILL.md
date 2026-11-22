---
name: verify-piano
description: "Drive and prove Piano Studio (piano-learning-app) end to end — Bun + React web UI at 1340x800, bun:sqlite persistence, Song Catalog playback, and Web MIDI flows. Use when verifying UI changes, proving a bug fix or feature works like a real user, or inspecting live browser and database state."
---

# Verify Piano Studio

Piano Studio is a local, tablet-optimized (`1340x800`) web application served by Bun (`server.ts`) with a React 18 SPA (`src/`), a `bun:sqlite` learner profile database, MIDI files in `public/songs/`, Web Audio synthesis, and Web MIDI input.

All verification runs through the executable helper `.agents/skills/verify-piano/scripts/piano-verify`, which isolates every run on its own port, SQLite database, and Playwright browser session (`playwright-cli`).

Before driving any feature, read the maintained feature map in [`features/README.md`](features/README.md) and follow the matching feature recipe.

## Launch

Start an isolated verification instance from the repo root:

```bash
.agents/skills/verify-piano/scripts/piano-verify --run-id <run-id> launch
```

Pass `--prod` to run `bun run build` and boot `NODE_ENV=production bun server.ts` instead of development mode. Pass `--port <port>` to pin a port; otherwise an ephemeral free port is selected.

What `launch` does to reach a usable state from an empty data dir:

1. Refuses to overwrite an already-running instance for the same `--run-id`.
2. Installs `node_modules` via `bun install` if missing and runs `bun run seed` if `public/songs/songs.json` is missing.
3. Creates scratch directory `/tmp/verify-piano-run-<run-id>/` with an isolated `DB_PATH=/tmp/verify-piano-run-<run-id>/piano.db` (never touching `data/piano.db`) and `AI_ENDPOINT=off` (disabling the default LAN coaching endpoint `http://192.168.0.101:8317/v1/messages`).
4. Starts `bun server.ts` in the background, recording its exact PID and metadata in `/tmp/verify-piano-run-<run-id>/instance.env`.
5. Waits for the startup log line (`Piano Learning App running at ...`), a valid `GET /api/profile` JSON response (`PianoDatabase` auto-creates `learner_profile` and `calibration_history` and seeds row `id = 1`), and a non-empty `GET /api/songs` catalog.
6. Opens a dedicated `playwright-cli` browser session (`piano-<run-id>`), resizes the viewport to `1340x800`, and waits until `Loading Piano Studio…` disappears and the `Piano Studio` heading is visible.

Multiple runs can execute side by side by passing distinct `--run-id` values.

## Doctor

Run this read-only check before driving any journey and whenever anything looks off:

```bash
.agents/skills/verify-piano/scripts/piano-verify --run-id <run-id> doctor
```

Doctor verifies:

- Recorded server PID is alive and owns the recorded TCP port.
- `DB_PATH` exists inside `/tmp/verify-piano-run-<run-id>/` (isolated from repo `data/piano.db`).
- `GET /` serves `<title>Piano Learning Studio</title>`.
- `GET /api/profile` returns valid learner profile JSON and `GET /api/songs` returns the seeded Song Catalog (10 songs, 3 calibration pieces).
- Browser session `piano-<run-id>` is attached to `Piano Learning Studio`.

Abort and inspect `/tmp/verify-piano-run-<run-id>/server.log` if doctor fails. Never drive an instance started outside this run.

## Drive

Drive the app through user-visible handles — ARIA roles, accessible names, and slider `aria-label` attributes — rather than coordinates, CSS classes, or internal Zustand setters:

- **Click buttons by role and accessible name:**
  ```bash
  .agents/skills/verify-piano/scripts/piano-verify --run-id <run-id> click button "61 Keys C2 – C7"
  ```
  Pass `--exact` when a label is a prefix of another button (e.g., `"1"` vs `"10"` in the Skill Level picker).
- **Adjust sliders by `aria-label`:** `Song progress`, `Tempo speed`, `Audio volume`:
  ```bash
  .agents/skills/verify-piano/scripts/piano-verify --run-id <run-id> set-range "Tempo speed" 0.75
  ```
- **Wait on observable roles or text instead of sleeping:**
  ```bash
  .agents/skills/verify-piano/scripts/piano-verify --run-id <run-id> wait-text "Song Library"
  .agents/skills/verify-piano/scripts/piano-verify --run-id <run-id> wait-role button "▶ Play"
  ```
- **Drive Web MIDI without hardware (hardware boundary only):**
  Headless Chromium rejects `navigator.requestMIDIAccess()` by default (header pill displays `MIDI Permission Denied`). To prove MIDI-driven journeys (`Keyboard Range` key detection, `Skill Calibration` live playing, `Song Player` matched hits), attach a virtual MIDI input at the browser `navigator.requestMIDIAccess` boundary before reload and send standard MIDI bytes `[0x90, midi, vel]` / `[0x80, midi, 0]`:
  ```bash
  .agents/skills/verify-piano/scripts/piano-verify --run-id <run-id> virtual-midi enable
  .agents/skills/verify-piano/scripts/piano-verify --run-id <run-id> virtual-midi note 60 100 120
  ```
  This exercises the real `useMidi` listener, Zustand store, and React UI without calling internal store setters.

Follow the exact journeys and handles documented in [`features/README.md`](features/README.md).

## Evidence

Store proof artifacts in `/tmp/verify-piano-evidence-<run-id>/<feature>/` (the directory created and printed as `EVIDENCE_DIR` on launch). Evidence lives outside `/tmp/verify-piano-run-<run-id>/` and outside the git working tree so it survives cleanup without dirtying `git status`.

Proof standards:

- **Real user path:** Drive the rendered UI (and browser Web MIDI boundary when MIDI hardware is absent). Never mutate state via Zustand internals or skip UI flows with direct `PUT`/`PATCH`/`POST` calls unless explicitly testing an API contract.
- **Action plus resulting state:** Capture before/after or transition snapshots alongside screenshots so the action and its observable result are both proven.
- **Side-effect verification:** After any mutation (Keyboard Range save, Skill Calibration evaluation, manual Skill Level change), confirm persistence both in a second user-facing view (reload via `browser reload`) and directly in SQLite via `db`.
- **Console cleanliness:** Run `console error` and confirm no unexpected errors occurred. Note one known benign error: headless Chromium logs a `404` for `/favicon.ico` because `server.ts` serves no favicon.
- **AI coaching boundary (`AI_ENDPOINT=off`):** Verify `feedbackSource` is `"local"` in both the UI (`Local Assessment` / `(Local)`) and SQLite (`learner_profile.feedback_source` and `calibration_history.feedback_source`), proving remote LAN calls were skipped.

## Cleanup

Tear down the instance after every run — including failed iterations — so processes and ports are never stranded:

```bash
.agents/skills/verify-piano/scripts/piano-verify --run-id <run-id> cleanup
```

Cleanup closes the `piano-<run-id>` Playwright session, terminates **only** the exact server PID recorded in `instance.env` (never killing by process name), and deletes `/tmp/verify-piano-run-<run-id>/`. It **never** deletes `/tmp/verify-piano-evidence-<run-id>/`. Verify the proof files still exist after cleanup.

## Helpers

All verification operations live in one executable script: `.agents/skills/verify-piano/scripts/piano-verify`.

| Command | Purpose |
| --- | --- |
| `piano-verify --run-id <id> launch [--port P] [--prod] [--evidence-dir D]` | Start isolated server + `1340x800` browser session |
| `piano-verify --run-id <id> doctor` | Read-only health check of server, port, DB, catalog, and browser |
| `piano-verify --run-id <id> click <role> <name> [--exact]` | Click element by ARIA role and accessible name |
| `piano-verify --run-id <id> set-range <aria-label> <value>` | Set `<input type="range">` by `aria-label` |
| `piano-verify --run-id <id> wait-text <text> [--timeout MS]` | Wait for visible text |
| `piano-verify --run-id <id> wait-role <role> <name> [--exact] [--timeout MS]` | Wait for visible ARIA role + accessible name |
| `piano-verify --run-id <id> snapshot [file]` | Capture ARIA snapshot (stdout or file) |
| `piano-verify --run-id <id> screenshot <file>` | Save viewport PNG screenshot |
| `piano-verify --run-id <id> console [min-level]` | Inspect browser console messages |
| `piano-verify --run-id <id> db` | Read-only JSON dump of `learner_profile` and `calibration_history` |
| `piano-verify --run-id <id> api <METHOD> <PATH> [JSON]` | Query the running server's HTTP API |
| `piano-verify --run-id <id> virtual-midi enable [name]` | Inject virtual Web MIDI port at `navigator.requestMIDIAccess` and reload |
| `piano-verify --run-id <id> virtual-midi note <midi> [vel] [ms]` | Send MIDI `noteOn`/`noteOff` through the virtual port |
| `piano-verify --run-id <id> browser <playwright-cli args...>` | Run any raw `playwright-cli` command (e.g. `reload`, `requests`, `eval`) |
| `piano-verify --run-id <id> cleanup` | Close browser, kill recorded server PID, remove scratch dir, keep evidence |
