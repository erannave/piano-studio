---- MODULE SkillCalibration ----
EXTENDS Naturals, Sequences

(*
  Formal model of the Skill Calibration lifecycle and Skill Level persistence.

  Code correspondence:
  - src/components/SkillCalibration.tsx:
      pieceIdx, phase, parsedPiece, finishingRef, attemptsRef, recordedEventsRef,
      finishCurrentPiece(), subscribeMidiEvents(), Re-run Calibration, Pick Level Manually
  - src/store/appStore.ts:
      currentStage, levelWriteSeq, calibrationAbortController,
      submitCalibration(), setManualSkillLevel(), setStage()
  - src/components/Layout.tsx:
      header Skill Level picker (setManualSkillLevel + setStage("library"))
  - server.ts & src/server/db.ts:
      POST /api/calibration/evaluate -> getLevelVersion() + saveCalibrationResultIfCurrent()
      PATCH /api/profile/level       -> updateSkillLevel() (increments level_version)
*)

CONSTANT NumPieces

ASSUME NumPieces \in Nat /\ NumPieces >= 1

VARIABLES
  currentStage,         \* appStore.currentStage: "calibration" | "library"
  pieceIdx,             \* SkillCalibration.pieceIdx: 0 .. NumPieces - 1
  phase,                \* SkillCalibration.phase: "ready" | "armed" | "recording" | "submitting" | "results"
  pieceLoaded,          \* SkillCalibration.parsedPiece !== null
  finishing,            \* SkillCalibration.finishingRef.current
  attempts,             \* SkillCalibration.attemptsRef.current (sequence of pieceIdx values)
  recordedCount,        \* SkillCalibration.recordedCount > 0 (0 or 1)
  submitInFlight,       \* In-flight POST /api/calibration/evaluate
  submitSnapshot,       \* Snapshot of attemptsRef.current sent to submitCalibration()
  submitSuperseded,     \* TRUE iff a newer Skill Level write invalidated level_version / levelWriteSeq / AbortController
  manualChosen,         \* Learner explicitly chose a manual Skill Level in this session
  dbLevelSource,        \* Last writer to learner_profile.skill_level: "none" | "calibration" | "manual"
  storeLevelSource,     \* Last writer to useAppStore.profile.skillLevel: "none" | "calibration" | "manual"
  dbCalibrationPayload  \* Last attempts sequence persisted to calibration_history

vars == <<
  currentStage, pieceIdx, phase, pieceLoaded, finishing, attempts,
  recordedCount, submitInFlight, submitSnapshot, submitSuperseded,
  manualChosen, dbLevelSource, storeLevelSource, dbCalibrationPayload
>>

TypeOK ==
  /\ currentStage \in {"calibration", "library"}
  /\ pieceIdx \in 0..(NumPieces - 1)
  /\ phase \in {"ready", "armed", "recording", "submitting", "results"}
  /\ pieceLoaded \in BOOLEAN
  /\ finishing \in BOOLEAN
  /\ recordedCount \in {0, 1}
  /\ submitInFlight \in BOOLEAN
  /\ submitSuperseded \in BOOLEAN
  /\ manualChosen \in BOOLEAN
  /\ dbLevelSource \in {"none", "calibration", "manual"}
  /\ storeLevelSource \in {"none", "calibration", "manual"}

Init ==
  /\ currentStage = "calibration"
  /\ pieceIdx = 0
  /\ phase = "ready"
  /\ pieceLoaded = FALSE
  /\ finishing = FALSE
  /\ attempts = << >>
  /\ recordedCount = 0
  /\ submitInFlight = FALSE
  /\ submitSnapshot = << >>
  /\ submitSuperseded = FALSE
  /\ manualChosen = FALSE
  /\ dbLevelSource = "none"
  /\ storeLevelSource = "none"
  /\ dbCalibrationPayload = << >>

\* loadParsedSong(currentMeta).then(...) in SkillCalibration.tsx:74-90
LoadPieceComplete ==
  /\ currentStage = "calibration"
  /\ phase \in {"ready", "armed"}
  /\ ~pieceLoaded
  /\ pieceLoaded' = TRUE
  /\ UNCHANGED <<
       currentStage, pieceIdx, phase, finishing, attempts,
       recordedCount, submitInFlight, submitSnapshot, submitSuperseded,
       manualChosen, dbLevelSource, storeLevelSource, dbCalibrationPayload
     >>

\* Start Piece button (disabled={!parsedPiece}) in SkillCalibration.tsx:346-359
ClickStartPiece ==
  /\ currentStage = "calibration"
  /\ phase = "ready"
  /\ pieceLoaded
  /\ phase' = "armed"
  /\ UNCHANGED <<
       currentStage, pieceIdx, pieceLoaded, finishing, attempts,
       recordedCount, submitInFlight, submitSnapshot, submitSuperseded,
       manualChosen, dbLevelSource, storeLevelSource, dbCalibrationPayload
     >>

\* First MIDI noteOn in armed phase in SkillCalibration.tsx:151-164
MidiFirstNote ==
  /\ currentStage = "calibration"
  /\ phase = "armed"
  /\ phase' = "recording"
  /\ recordedCount' = 1
  /\ UNCHANGED <<
       currentStage, pieceIdx, pieceLoaded, finishing, attempts,
       submitInFlight, submitSnapshot, submitSuperseded,
       manualChosen, dbLevelSource, storeLevelSource, dbCalibrationPayload
     >>

\* finishCurrentPiece(skipped) for non-final piece in SkillCalibration.tsx:92-135
\* Writes attempt at index pieceIdx (attemptsRef.current.slice(0, pieceIdx) + [attempt]).
FinishPieceNonFinal ==
  /\ currentStage = "calibration"
  /\ phase \in {"ready", "armed", "recording"}
  /\ ~finishing
  /\ pieceIdx + 1 < NumPieces
  /\ attempts' = Append(SubSeq(attempts, 1, pieceIdx), pieceIdx)
  /\ recordedCount' = 0
  /\ pieceIdx' = pieceIdx + 1
  /\ phase' = "ready"
  /\ pieceLoaded' = FALSE
  /\ UNCHANGED <<
       currentStage, finishing, submitInFlight, submitSnapshot, submitSuperseded,
       manualChosen, dbLevelSource, storeLevelSource, dbCalibrationPayload
     >>

\* finishCurrentPiece(skipped) for final piece up to await submitCalibration()
\* in SkillCalibration.tsx:92-145 and appStore.ts:submitCalibration().
\* Captures expectedLevelVersion on server and levelWriteSeq + AbortController on client.
FinishFinalPieceStartSubmit ==
  /\ currentStage = "calibration"
  /\ phase \in {"ready", "armed", "recording"}
  /\ ~finishing
  /\ pieceIdx + 1 = NumPieces
  /\ ~submitInFlight
  /\ LET nextAttempts == Append(SubSeq(attempts, 1, pieceIdx), pieceIdx)
     IN /\ finishing' = TRUE
        /\ attempts' = nextAttempts
        /\ recordedCount' = 0
        /\ phase' = "submitting"
        /\ submitInFlight' = TRUE
        /\ submitSnapshot' = nextAttempts
        /\ submitSuperseded' = FALSE
  /\ UNCHANGED <<
       currentStage, pieceIdx, pieceLoaded, manualChosen,
       dbLevelSource, storeLevelSource, dbCalibrationPayload
     >>

\* In-flight POST /api/calibration/evaluate reaches DB commit in server.ts.
\* If not superseded, saveCalibrationResultIfCurrent() commits and store updates.
\* If superseded (level_version changed / AbortController / levelWriteSeq mismatch),
\* server returns 409 without writing DB, and client throws CalibrationSupersededError
\* without updating store, trimming attemptsRef back to pieceIdx.
SubmitCalibrationSucceed ==
  /\ submitInFlight
  /\ submitInFlight' = FALSE
  /\ finishing' = FALSE
  /\ submitSuperseded' = FALSE
  /\ IF ~submitSuperseded THEN
       /\ dbLevelSource' = "calibration"
       /\ dbCalibrationPayload' = submitSnapshot
       /\ storeLevelSource' = "calibration"
       /\ phase' = IF currentStage = "calibration" THEN "results" ELSE phase
       /\ UNCHANGED attempts
     ELSE
       /\ attempts' = SubSeq(attempts, 1, pieceIdx)
       /\ UNCHANGED << dbLevelSource, dbCalibrationPayload, storeLevelSource, phase >>
  /\ UNCHANGED <<
       currentStage, pieceIdx, pieceLoaded, recordedCount, submitSnapshot, manualChosen
     >>

\* In-flight POST /api/calibration/evaluate fails (network/500).
\* catch block trims attemptsRef.current back to pieceIdx and resets phase to "ready".
SubmitCalibrationFail ==
  /\ submitInFlight
  /\ submitInFlight' = FALSE
  /\ finishing' = FALSE
  /\ submitSuperseded' = FALSE
  /\ attempts' = SubSeq(attempts, 1, pieceIdx)
  /\ phase' = IF currentStage = "calibration" THEN "ready" ELSE phase
  /\ UNCHANGED <<
       currentStage, pieceIdx, pieceLoaded, recordedCount, submitSnapshot,
       manualChosen, dbLevelSource, storeLevelSource, dbCalibrationPayload
     >>

\* Learner picks a Skill Level manually via SkillCalibration.tsx or Layout.tsx.
\* Increments levelWriteSeq + aborts calibrationAbortController in appStore.ts,
\* and increments level_version in db.updateSkillLevel(), superseding any in-flight calibration.
PickManualLevel ==
  /\ currentStage = "calibration"
  /\ phase # "results"
  /\ manualChosen' = TRUE
  /\ dbLevelSource' = "manual"
  /\ storeLevelSource' = "manual"
  /\ currentStage' = "library"
  /\ submitSuperseded' = IF submitInFlight THEN TRUE ELSE submitSuperseded
  /\ UNCHANGED <<
       pieceIdx, phase, pieceLoaded, finishing, attempts,
       recordedCount, submitInFlight, submitSnapshot, dbCalibrationPayload
     >>

\* "Re-run Calibration" button in SkillCalibration.tsx
ReRunCalibration ==
  /\ currentStage = "calibration"
  /\ phase = "results"
  /\ attempts' = << >>
  /\ pieceIdx' = 0
  /\ phase' = "ready"
  /\ pieceLoaded' = FALSE
  /\ recordedCount' = 0
  /\ manualChosen' = FALSE
  /\ UNCHANGED <<
       currentStage, finishing, submitInFlight, submitSnapshot, submitSuperseded,
       dbLevelSource, storeLevelSource, dbCalibrationPayload
     >>

\* "Open Song Library ->" button in SkillCalibration.tsx
GoToLibraryFromResults ==
  /\ currentStage = "calibration"
  /\ phase = "results"
  /\ currentStage' = "library"
  /\ UNCHANGED <<
       pieceIdx, phase, pieceLoaded, finishing, attempts,
       recordedCount, submitInFlight, submitSnapshot, submitSuperseded,
       manualChosen, dbLevelSource, storeLevelSource, dbCalibrationPayload
     >>

\* Terminal stuttering step once learner is in the Library and no calibration request is in flight.
Done ==
  /\ currentStage = "library"
  /\ ~submitInFlight
  /\ UNCHANGED vars

Next ==
  \/ LoadPieceComplete
  \/ ClickStartPiece
  \/ MidiFirstNote
  \/ FinishPieceNonFinal
  \/ FinishFinalPieceStartSubmit
  \/ SubmitCalibrationSucceed
  \/ SubmitCalibrationFail
  \/ PickManualLevel
  \/ ReRunCalibration
  \/ GoToLibraryFromResults
  \/ Done

Spec == Init /\ [][Next]_vars

\* State-space bound: keep attempts bounded past any bug so TLC terminates when continuing past violations.
StateBound == Len(attempts) <= NumPieces + 1

\* ---- Invariants ----

\* Property 1: Every calibration submission contains at most one attempt per Calibration Piece,
\* and any persisted calibration result covers pieces 0..(NumPieces-1) exactly once in order.
UniqueAttemptsPerPiece ==
  /\ Len(attempts) <= NumPieces
  /\ \A i, j \in 1..Len(attempts) : i # j => attempts[i] # attempts[j]
  /\ (dbCalibrationPayload # << >>) =>
       (Len(dbCalibrationPayload) = NumPieces /\
        \A k \in 1..NumPieces : dbCalibrationPayload[k] = k - 1)

\* Property 2: Once the learner picks a manual Skill Level, an older in-flight calibration
\* submission must never overwrite that Skill Level in SQLite or in Zustand.
ManualLevelNotClobbered ==
  manualChosen => (dbLevelSource = "manual" /\ storeLevelSource = "manual")

\* Property 3: finishingRef is held if and only if a calibration submission is in flight.
FinishingGuardMatchesSubmit ==
  finishing <=> submitInFlight

====
