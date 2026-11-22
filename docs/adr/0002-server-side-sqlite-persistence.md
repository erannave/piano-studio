# Persist Learner State in Server-Side SQLite (`bun:sqlite`)

We store the learner's persisted state (Skill Level, Keyboard Range, and calibration results) in a local `bun:sqlite` database on the Bun server rather than browser `localStorage`. Although this is a single-learner app in v1, server-side persistence lets state stay in sync across devices (such as a desktop browser and the Samsung Galaxy A9 tablet) and provides an atomic foundation if multi-profile or song-history tracking is added later.
