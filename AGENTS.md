## Agent skills

### Project skills

Store project-local skills in `.agents/skills/<name>/` and symlink `.claude/skills/<name>` -> `../../.agents/skills/<name>` so both Antigravity and Claude Code discover them.

### Issue tracker

Issues and specs live as local markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
