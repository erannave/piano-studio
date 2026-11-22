## Agent skills

### Project skills

Store project-local skills in `.agents/skills/<name>/` and symlink `.claude/skills/<name>` -> `../../.agents/skills/<name>` so both Antigravity and Claude Code discover them.

### Issue tracker

Issues and specs live as local markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Code quality checks

Before finishing code changes, run `bun run check` (runs Bun 1.4.5's `bun check` type checker, `oxlint`, and `bun fmt --check`), `bun test`, and `bun run build`. Use `bun run fmt` to auto-format.

### Formal verification

When editing Skill Calibration or Skill Level persistence (`src/components/SkillCalibration.tsx`, `src/store/appStore.ts`, `src/components/Layout.tsx`, `server.ts`, `src/server/db.ts`), run `bun run verify:calibration` and follow the `verify-skill-calibration` skill in `.agents/skills/verify-skill-calibration/SKILL.md`.

### End-to-end UI verification

When changing UI, playback, MIDI, or Song Catalog flows, verify the running app end to end using the `verify-piano` skill in `.agents/skills/verify-piano/SKILL.md` (via `.agents/skills/verify-piano/scripts/piano-verify` or `bun run verify:piano -- --run-id <id> <cmd>`), keeping `launch`, `doctor`, driving steps, and `cleanup` inside a single shell invocation so the background server stays alive and is always torn down cleanly.
