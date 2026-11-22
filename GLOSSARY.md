# Piano Learning App

A local, tablet-optimized piano learning application that calibrates a learner's starting proficiency via Web MIDI and provides a visual play-along song library matched to their level.

## Language

**Skill Calibration**:
A guided evaluation where the learner plays a short set of Calibration Pieces across different Difficulty Levels to determine their starting Skill Level and receive coaching feedback; repeatable manually on demand.
_Avoid_: Onboarding test, assessment quiz, audition

**Keyboard Range**:
The physical lowest and highest MIDI note numbers available on the learner's connected piano, established by pressing both end keys during initial setup (or manual preset). The on-screen keyboard hides keys outside this range, and Songs are adapted or filtered to fit it.
_Avoid_: Key span, hardware bounds, piano size

**Calibration Piece**:
A short benchmark Song used during Skill Calibration to gauge the learner's proficiency at a specific Difficulty Level.
_Avoid_: Test track, sample song, audition piece

**Skill Level**:
An integer from 1 to 10 representing the learner's current piano proficiency, persisted on the server across devices and set via Skill Calibration or manual adjustment.
_Avoid_: Rank, tier, grade

**Song**:
A playable musical piece stored as a MIDI file and listed in the Song Catalog with a target Difficulty Level.
_Avoid_: Track, lesson, exercise

**Difficulty Level**:
An integer from 1 to 10 assigned to a Song in the Song Catalog, compared against the learner's Skill Level (±1) to surface appropriately challenging pieces.
_Avoid_: Complexity, rating

**Song Catalog**:
The metadata registry of available Songs (title, composer, Difficulty Level, MIDI file path) powering the Library view.
_Avoid_: Playlist, song database

**Stage**:
One of the three primary views in the app workflow: Calibration, Library, or Player.
_Avoid_: Screen, mode, page

**Active Note**:
A piano pitch currently engaged, categorized by source: live MIDI input from the learner, a scheduled target note from the playing Song, or a matched hit where both overlap.
_Avoid_: Pressed key, playing note
