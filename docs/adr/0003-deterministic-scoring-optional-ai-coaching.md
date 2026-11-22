# Use Deterministic Local Scoring With Optional AI Coaching Feedback

Because Skill Calibration uses known Calibration Pieces with exact expected MIDI notes and timestamps, the server computes performance metrics (pitch accuracy, timing offset, completion, and velocity control) and assigns the 1–10 Skill Level deterministically without an LLM. The configured AI endpoint (`claude-haiku-5-5` via Anthropic Messages API) is called optionally to turn those metrics into concise natural-language coaching feedback, falling back cleanly to a local summary when offline or unconfigured.
