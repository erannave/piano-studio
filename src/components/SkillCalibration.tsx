import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAudioSynth } from "../hooks/useAudioSynth.ts";
import { computeAutoZoomRange, fitSongToKeyboardRange } from "../shared/keyboardRange.ts";
import { loadParsedSong } from "../shared/midiLoader.ts";
import type {
  CalibrationPieceAttempt,
  FittedSong,
  MidiEventRecord,
  ParsedSong,
} from "../shared/types.ts";
import { CalibrationSupersededError, subscribeMidiEvents, useAppStore } from "../store/appStore.ts";
import { FallingNotesCanvas } from "./FallingNotesCanvas.tsx";
import { PianoKeyboard } from "./PianoKeyboard.tsx";

const CALIBRATION_DURATION_SEC = 15;

type PiecePhase = "ready" | "armed" | "recording" | "submitting" | "results";

export function SkillCalibration() {
  const songs = useAppStore((s) => s.songs);
  const profile = useAppStore((s) => s.profile);
  const midiStatus = useAppStore((s) => s.midiStatus);
  const activeUserNotes = useAppStore((s) => s.activeUserNotes);
  const lastCalibrationResult = useAppStore((s) => s.lastCalibrationResult);
  const submitCalibration = useAppStore((s) => s.submitCalibration);
  const setManualSkillLevel = useAppStore((s) => s.setManualSkillLevel);
  const setStage = useAppStore((s) => s.setStage);

  const { playNote, stopAll, unlockAudio } = useAudioSynth();

  // Select the 3 calibration pieces fitted to the calibrated KeyboardRange
  const calibrationSongs = useMemo<FittedSong[]>(() => {
    const pieces = songs
      .filter((s) => s.isCalibrationPiece)
      .sort((a, b) => (a.calibrationOrder ?? a.difficultyLevel) - (b.calibrationOrder ?? b.difficultyLevel));

    const fitted: FittedSong[] = [];
    for (const piece of pieces) {
      const fit = fitSongToKeyboardRange(piece, profile.keyboardRange);
      if (fit) {
        fitted.push(fit);
      } else {
        // Fallback: include untransposed if keyboard range is very narrow
        fitted.push({
          ...piece,
          transposeSemitones: 0,
          fittedMinNote: piece.minNote,
          fittedMaxNote: piece.maxNote,
        });
      }
    }
    return fitted;
  }, [songs, profile.keyboardRange]);

  const [pieceIdx, setPieceIdx] = useState(0);
  const [phase, setPhase] = useState<PiecePhase>("ready");
  const [parsedPiece, setParsedPiece] = useState<ParsedSong | null>(null);
  const [currentTimeSec, setCurrentTimeSec] = useState(0);
  const [activeSongNotes, setActiveSongNotes] = useState<Set<number>>(new Set());
  const [recordedCount, setRecordedCount] = useState(0);
  const [showManualPicker, setShowManualPicker] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const attemptsRef = useRef<CalibrationPieceAttempt[]>([]);
  const recordedEventsRef = useRef<MidiEventRecord[]>([]);
  const recordStartPerfRef = useRef<number>(0);
  const triggeredNoteIdxRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);
  const finishingRef = useRef<boolean>(false);

  const currentMeta = calibrationSongs[pieceIdx] ?? null;

  // Load MIDI data whenever the current calibration piece changes
  useEffect(() => {
    if (!currentMeta) return;
    let cancelled = false;
    setParsedPiece(null);
    setCurrentTimeSec(0);
    setActiveSongNotes(new Set());
    loadParsedSong(currentMeta)
      .then((parsed) => {
        if (!cancelled) setParsedPiece(parsed);
      })
      .catch((err) => {
        if (!cancelled) setErrorMsg(String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [currentMeta]);

  const finishCurrentPiece = useCallback(
    async (skipped: boolean) => {
      if (finishingRef.current || !currentMeta) return;
      finishingRef.current = true;

      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      stopAll();
      setActiveSongNotes(new Set());

      const expectedNotes = (parsedPiece?.notes ?? [])
        .filter((n) => n.time <= CALIBRATION_DURATION_SEC)
        .map((n) => ({
          midi: n.midi,
          timeMs: Math.round(n.time * 1000),
          durationMs: Math.round(n.duration * 1000),
        }));

      const nextAttempts = attemptsRef.current.slice(0, pieceIdx);
      nextAttempts[pieceIdx] = {
        songId: currentMeta.id,
        title: currentMeta.title,
        difficultyLevel: currentMeta.difficultyLevel,
        skipped,
        expectedNotes,
        recordedEvents: skipped ? [] : [...recordedEventsRef.current],
      };
      attemptsRef.current = nextAttempts;

      recordedEventsRef.current = [];
      setRecordedCount(0);

      const nextIdx = pieceIdx + 1;
      if (nextIdx < calibrationSongs.length) {
        setPieceIdx(nextIdx);
        setPhase("ready");
        setCurrentTimeSec(0);
        finishingRef.current = false;
      } else {
        setPhase("submitting");
        setErrorMsg(null);
        try {
          await submitCalibration(attemptsRef.current);
          setPhase("results");
        } catch (err) {
          attemptsRef.current = attemptsRef.current.slice(0, pieceIdx);
          if (!(err instanceof CalibrationSupersededError)) {
            setErrorMsg(err instanceof Error ? err.message : "Failed to submit calibration");
            setPhase("ready");
          }
        } finally {
          finishingRef.current = false;
        }
      }
    },
    [calibrationSongs.length, currentMeta, parsedPiece, pieceIdx, stopAll, submitCalibration]
  );

  // Subscribe to MIDI events during "armed" (trigger start on first note) and "recording"
  useEffect(() => {
    if (phase !== "armed" && phase !== "recording") return;

    return subscribeMidiEvents((event) => {
      if (phase === "armed") {
        if (event.type === "noteOn" && event.velocity > 0) {
          unlockAudio();
          recordStartPerfRef.current = event.timestampMs;
          triggeredNoteIdxRef.current = 0;
          recordedEventsRef.current = [
            { ...event, timestampMs: 0 },
          ];
          setRecordedCount(1);
          setPhase("recording");
        }
        return;
      }

      // Recording phase
      const relativeMs = Math.max(0, event.timestampMs - recordStartPerfRef.current);
      recordedEventsRef.current.push({ ...event, timestampMs: Math.round(relativeMs) });
      if (event.type === "noteOn" && event.velocity > 0) {
        setRecordedCount((c) => c + 1);
      }
    });
  }, [phase, unlockAudio]);

  // Playback & 15s countdown animation loop during "recording"
  useEffect(() => {
    if (phase !== "recording" || !parsedPiece) return;

    const maxDuration = Math.min(CALIBRATION_DURATION_SEC, Math.max(8, parsedPiece.durationSec + 0.5));
    const notes = parsedPiece.notes;

    const tick = () => {
      const elapsedSec = (performance.now() - recordStartPerfRef.current) / 1000;
      setCurrentTimeSec(elapsedSec);

      // Fire Web Audio notes as playhead crosses them
      while (
        triggeredNoteIdxRef.current < notes.length &&
        notes[triggeredNoteIdxRef.current]!.time <= elapsedSec
      ) {
        const note = notes[triggeredNoteIdxRef.current]!;
        playNote(note.midi, note.duration, note.velocity * 0.7);
        triggeredNoteIdxRef.current++;
      }

      // Compute currently active target notes
      const active = new Set<number>();
      for (const note of notes) {
        if (note.time <= elapsedSec && note.time + note.duration >= elapsedSec) {
          active.add(note.midi);
        } else if (note.time > elapsedSec) {
          break;
        }
      }
      setActiveSongNotes(active);

      if (elapsedSec >= maxDuration) {
        void finishCurrentPiece(false);
        return;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      stopAll();
    };
  }, [phase, parsedPiece, playNote, stopAll, finishCurrentPiece]);

  const visibleRange = useMemo(
    () =>
      computeAutoZoomRange(
        currentMeta?.fittedMinNote ?? null,
        currentMeta?.fittedMaxNote ?? null,
        profile.keyboardRange
      ),
    [currentMeta, profile.keyboardRange]
  );

  const remainingSec = Math.max(0, Math.ceil(CALIBRATION_DURATION_SEC - currentTimeSec));

  if (phase === "results" && lastCalibrationResult) {
    return (
      <div className="flex-1 min-h-0 overflow-y-auto px-8 py-6 flex items-center justify-center">
        <div className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl">
          <div className="flex items-center justify-between gap-6 mb-6">
            <div>
              <span className="inline-block px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-200 text-xs font-bold uppercase tracking-wider mb-2">
                Skill Calibration Complete
              </span>
              <h2 className="text-3xl font-bold text-white">
                Your Starting Skill Level: Level {lastCalibrationResult.skillLevel}
              </h2>
            </div>
            <div className="w-24 h-24 rounded-2xl bg-sky-500/20 border-2 border-sky-400 flex flex-col items-center justify-center shrink-0">
              <span className="text-xs uppercase tracking-wider text-sky-300 font-bold">Level</span>
              <span className="text-4xl font-extrabold text-white">{lastCalibrationResult.skillLevel}</span>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-slate-950/80 border border-slate-800 mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Teacher Feedback
              </span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300">
                {lastCalibrationResult.feedbackSource === "ai" ? "AI Coaching" : "Local Assessment"}
              </span>
            </div>
            <p className="text-lg text-slate-100 leading-relaxed">{lastCalibrationResult.feedback}</p>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-7">
            {lastCalibrationResult.pieceSummaries.map((p) => (
              <div key={p.songId} className="rounded-2xl bg-slate-950/60 border border-slate-800 p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-sky-300">Level {p.difficultyLevel}</span>
                  <span className="text-xs text-slate-400">
                    {p.skipped ? "Skipped" : `${Math.round(p.pitchAccuracy * 100)}% acc`}
                  </span>
                </div>
                <div className="font-bold text-white truncate">{p.title}</div>
                {!p.skipped && (
                  <div className="text-xs text-slate-400 mt-1.5">
                    {p.matchedCount}/{p.expectedCount} notes · ±{p.avgTimingErrorMs}ms avg
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-end gap-4">
            <button
              type="button"
              onClick={() => {
                attemptsRef.current = [];
                setPieceIdx(0);
                setPhase("ready");
                setCurrentTimeSec(0);
              }}
              className="min-h-[48px] px-5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold cursor-pointer"
            >
              Re-run Calibration
            </button>
            <button
              type="button"
              onClick={() => setStage("library")}
              className="min-h-[48px] px-7 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-lg cursor-pointer"
            >
              Open Song Library →
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      {/* Calibration control strip */}
      <div className="shrink-0 px-6 py-4 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 mb-1">
            <span className="px-2.5 py-0.5 rounded-full bg-sky-500/20 border border-sky-400/30 text-sky-200 text-xs font-bold uppercase tracking-wider">
              Skill Calibration · Piece {pieceIdx + 1} of {Math.max(1, calibrationSongs.length)}
            </span>
            {currentMeta && (
              <span className="px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 text-xs font-semibold">
                Difficulty {currentMeta.difficultyLevel}
              </span>
            )}
            {currentMeta && currentMeta.transposeSemitones !== 0 && (
              <span className="px-2.5 py-0.5 rounded-full bg-violet-500/20 text-violet-200 text-xs font-semibold">
                Transposed {currentMeta.transposeSemitones > 0 ? "+" : ""}
                {currentMeta.transposeSemitones / 12} oct
              </span>
            )}
          </div>
          <h2 className="text-2xl font-bold text-white truncate">
            {currentMeta ? `${currentMeta.title} — ${currentMeta.composer}` : "Loading Calibration Pieces…"}
          </h2>
          {errorMsg && <p className="text-sm text-rose-400 mt-1">{errorMsg}</p>}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {phase === "recording" && (
            <div className="flex items-center gap-4 px-4 py-2 rounded-xl bg-rose-950/60 border border-rose-500/40">
              <span className="w-3 h-3 rounded-full bg-rose-500 animate-pulse" />
              <span className="font-mono text-2xl font-extrabold text-white">{remainingSec}s</span>
              <span className="text-sm text-rose-200">{recordedCount} notes</span>
            </div>
          )}

          {phase === "ready" && (
            <button
              type="button"
              disabled={!parsedPiece}
              onClick={() => {
                unlockAudio();
                setErrorMsg(null);
                setPhase("armed");
              }}
              className="min-h-[48px] px-6 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-base cursor-pointer disabled:opacity-50"
            >
              Start Piece
            </button>
          )}

          {phase === "armed" && (
            <div className="px-4 py-2.5 rounded-xl bg-amber-950/60 border border-amber-400/40 text-amber-200 font-semibold text-base animate-pulse">
              {midiStatus === "connected"
                ? "Play your first note on the piano to start!"
                : "Connect MIDI piano, or use Skip / Pick Level"}
            </div>
          )}

          {phase === "recording" && (
            <button
              type="button"
              onClick={() => void finishCurrentPiece(false)}
              className="min-h-[48px] px-5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-base cursor-pointer"
            >
              Finish Early
            </button>
          )}

          {(phase === "ready" || phase === "armed" || phase === "recording") && (
            <button
              type="button"
              onClick={() => void finishCurrentPiece(true)}
              className="min-h-[48px] px-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold text-sm cursor-pointer"
            >
              Too Hard — Skip
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowManualPicker((v) => !v)}
            className="min-h-[48px] px-4 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 font-semibold text-sm cursor-pointer"
          >
            Pick Level Manually
          </button>
        </div>
      </div>

      {/* Optional manual level picker drawer */}
      {showManualPicker && (
        <div className="shrink-0 px-6 py-4 bg-slate-900 border-b border-slate-700 flex items-center justify-between gap-4">
          <span className="text-sm font-semibold text-slate-300">
            Skip Skill Calibration and start at Level:
          </span>
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={async () => {
                  await setManualSkillLevel(lvl);
                  setShowManualPicker(false);
                  setStage("library");
                }}
                className="min-w-[44px] min-h-[44px] rounded-xl bg-slate-800 hover:bg-sky-500 hover:text-slate-950 text-white font-bold text-base transition cursor-pointer"
              >
                {lvl}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Submitting overlay */}
      {phase === "submitting" ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-200">
          <div className="w-10 h-10 rounded-full border-4 border-sky-400 border-t-transparent animate-spin" />
          <div className="text-xl font-semibold">Scoring your performance…</div>
        </div>
      ) : (
        <>
          <FallingNotesCanvas
            notes={parsedPiece?.notes ?? []}
            currentTimeSec={currentTimeSec}
            minNote={visibleRange.minNote}
            maxNote={visibleRange.maxNote}
            activeUserNotes={activeUserNotes}
          />
          <PianoKeyboard
            minNote={visibleRange.minNote}
            maxNote={visibleRange.maxNote}
            activeUserNotes={activeUserNotes}
            activeSongNotes={activeSongNotes}
            heightClass="h-40"
          />
        </>
      )}
    </div>
  );
}
