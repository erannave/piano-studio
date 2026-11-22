import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAudioSynth } from "../hooks/useAudioSynth.ts";
import { computeAutoZoomRange, midiToNoteName } from "../shared/keyboardRange.ts";
import {
  findNextWaitGroup,
  getBeatAtTime,
  isPracticedHand,
  isWaitGroupSatisfied,
} from "../shared/practiceEngine.ts";
import { useAppStore } from "../store/appStore.ts";
import { FallingNotesCanvas } from "./FallingNotesCanvas.tsx";
import { PianoKeyboard } from "./PianoKeyboard.tsx";
import { ScoreCanvas } from "./ScoreCanvas.tsx";

function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const mins = Math.floor(s / 60);
  const rem = s % 60;
  return `${mins}:${rem.toString().padStart(2, "0")}`;
}

export function SongPlayer() {
  const currentSong = useAppStore((s) => s.currentSong);
  const profile = useAppStore((s) => s.profile);
  const activeUserNotes = useAppStore((s) => s.activeUserNotes);
  const activeSongNotes = useAppStore((s) => s.activeSongNotes);
  const sustainPedalDown = useAppStore((s) => s.sustainPedalDown);
  const isPlaying = useAppStore((s) => s.isPlaying);
  const tempo = useAppStore((s) => s.tempo);
  const volume = useAppStore((s) => s.volume);
  const viewMode = useAppStore((s) => s.viewMode);
  const showNoteNames = useAppStore((s) => s.showNoteNames);
  const waitMode = useAppStore((s) => s.waitMode);
  const practiceHand = useAppStore((s) => s.practiceHand);
  const muteOtherHand = useAppStore((s) => s.muteOtherHand);
  const metronomeEnabled = useAppStore((s) => s.metronomeEnabled);
  const countInEnabled = useAppStore((s) => s.countInEnabled);

  const setIsPlaying = useAppStore((s) => s.setIsPlaying);
  const setActiveSongNotes = useAppStore((s) => s.setActiveSongNotes);
  const setTempo = useAppStore((s) => s.setTempo);
  const setVolume = useAppStore((s) => s.setVolume);
  const setViewMode = useAppStore((s) => s.setViewMode);
  const setShowNoteNames = useAppStore((s) => s.setShowNoteNames);
  const setWaitMode = useAppStore((s) => s.setWaitMode);
  const setPracticeHand = useAppStore((s) => s.setPracticeHand);
  const setMuteOtherHand = useAppStore((s) => s.setMuteOtherHand);
  const setMetronomeEnabled = useAppStore((s) => s.setMetronomeEnabled);
  const setCountInEnabled = useAppStore((s) => s.setCountInEnabled);
  const handleMidiNoteOn = useAppStore((s) => s.handleMidiNoteOn);
  const handleMidiNoteOff = useAppStore((s) => s.handleMidiNoteOff);
  const clearCurrentSong = useAppStore((s) => s.clearCurrentSong);

  const {
    playNote,
    noteOn,
    noteOff,
    setSustain,
    playMetronomeClick,
    stopAll,
    unlockAudio,
    engineMode,
  } = useAudioSynth();

  // Sync sustain pedal state to sampled piano audio
  useEffect(() => {
    setSustain(sustainPedalDown);
  }, [sustainPedalDown, setSustain]);

  const [currentTimeSec, setCurrentTimeSec] = useState(0);
  const [waitingNotes, setWaitingNotes] = useState<Set<number>>(new Set());
  const [countInBeat, setCountInBeat] = useState<number | null>(null);
  const [loopStart, setLoopStart] = useState<number | null>(null);
  const [loopEnd, setLoopEnd] = useState<number | null>(null);
  const [loopActive, setLoopActive] = useState(false);

  const timeRef = useRef(0);
  const lastFrameRef = useRef<number | null>(null);
  const nextNoteIdxRef = useRef(0);
  const waitCursorRef = useRef(0);
  const lastMetronomeBeatRef = useRef<number>(-1);
  const prevActiveKeyRef = useRef("");
  const prevWaitingKeyRef = useRef("");
  const countInTimersRef = useRef<number[]>([]);

  // Live refs for RAF loop
  const tempoRef = useRef(tempo);
  tempoRef.current = tempo;
  const activeUserNotesRef = useRef(activeUserNotes);
  activeUserNotesRef.current = activeUserNotes;
  const waitModeRef = useRef(waitMode);
  waitModeRef.current = waitMode;
  const practiceHandRef = useRef(practiceHand);
  practiceHandRef.current = practiceHand;
  const muteOtherHandRef = useRef(muteOtherHand);
  muteOtherHandRef.current = muteOtherHand;
  const metronomeRef = useRef(metronomeEnabled);
  metronomeRef.current = metronomeEnabled;
  const loopRef = useRef({ start: loopStart, end: loopEnd, active: loopActive });
  loopRef.current = { start: loopStart, end: loopEnd, active: loopActive };

  const cancelCountIn = useCallback(() => {
    for (const id of countInTimersRef.current) {
      window.clearTimeout(id);
    }
    countInTimersRef.current = [];
    setCountInBeat(null);
  }, []);

  // Reset timeline & loop when song changes
  useEffect(() => {
    cancelCountIn();
    timeRef.current = 0;
    nextNoteIdxRef.current = 0;
    waitCursorRef.current = 0;
    lastMetronomeBeatRef.current = -1;
    lastFrameRef.current = null;
    prevActiveKeyRef.current = "";
    prevWaitingKeyRef.current = "";
    setCurrentTimeSec(0);
    setWaitingNotes(new Set());
    setActiveSongNotes(new Set());
    setLoopStart(null);
    setLoopEnd(null);
    setLoopActive(false);
    stopAll();
  }, [currentSong, setActiveSongNotes, stopAll, cancelCountIn]);

  // Cleanup count-in timers on unmount
  useEffect(() => cancelCountIn, [cancelCountIn]);

  const seekTo = useCallback(
    (targetSec: number) => {
      if (!currentSong) return;
      cancelCountIn();
      const clamped = Math.max(0, Math.min(currentSong.durationSec, targetSec));
      stopAll();
      timeRef.current = clamped;
      setCurrentTimeSec(clamped);

      const idx = currentSong.notes.findIndex((n) => n.time >= clamped - 0.01);
      const nextIdx = idx === -1 ? currentSong.notes.length : idx;
      nextNoteIdxRef.current = nextIdx;
      waitCursorRef.current = nextIdx;
      lastMetronomeBeatRef.current = -1;
      prevActiveKeyRef.current = "";
      prevWaitingKeyRef.current = "";
      setWaitingNotes(new Set());
      setActiveSongNotes(new Set());
    },
    [currentSong, setActiveSongNotes, stopAll, cancelCountIn],
  );

  // When practiceHand or waitMode changes mid-song, realign wait cursor cleanly
  useEffect(() => {
    if (!currentSong) return;
    const idx = currentSong.notes.findIndex((n) => n.time >= timeRef.current - 0.01);
    waitCursorRef.current = idx === -1 ? currentSong.notes.length : idx;
    prevWaitingKeyRef.current = "";
    setWaitingNotes(new Set());
  }, [practiceHand, waitMode, currentSong]);

  const startPlaybackWithOptionalCountIn = useCallback(() => {
    if (!currentSong) return;
    unlockAudio();
    cancelCountIn();

    if (!countInEnabled) {
      setIsPlaying(true);
      return;
    }

    const beats = Math.max(1, currentSong.timeSignature.numerator || 4);
    const beatMs =
      ((60 / Math.max(40, currentSong.bpm || 100)) *
        (4 / Math.max(1, currentSong.timeSignature.denominator || 4)) *
        1000) /
      tempoRef.current;

    // Beat 1 immediately so the overlay appears synchronously on click
    setCountInBeat(1);
    playMetronomeClick(true);

    const timers: number[] = [];
    for (let b = 1; b < beats; b++) {
      const id = window.setTimeout(
        () => {
          setCountInBeat(b + 1);
          playMetronomeClick(false);
        },
        Math.round(b * beatMs),
      );
      timers.push(id);
    }

    const startId = window.setTimeout(
      () => {
        countInTimersRef.current = [];
        setCountInBeat(null);
        setIsPlaying(true);
      },
      Math.round(beats * beatMs),
    );
    timers.push(startId);
    countInTimersRef.current = timers;
  }, [currentSong, unlockAudio, cancelCountIn, countInEnabled, playMetronomeClick, setIsPlaying]);

  const handleTogglePlay = () => {
    if (!currentSong) return;
    if (countInBeat !== null) {
      cancelCountIn();
      return;
    }
    if (isPlaying) {
      setIsPlaying(false);
      return;
    }
    if (timeRef.current >= currentSong.durationSec - 0.05) {
      seekTo(loopActive && loopStart !== null ? loopStart : 0);
    }
    startPlaybackWithOptionalCountIn();
  };

  const handleRestart = () => {
    const startTarget = loopActive && loopStart !== null ? loopStart : 0;
    seekTo(startTarget);
    startPlaybackWithOptionalCountIn();
  };

  // A-B Loop controls
  const handleSetLoopA = () => {
    const t = Math.max(0, Math.round(timeRef.current * 20) / 20);
    setLoopStart(t);
    if (loopEnd !== null && loopEnd <= t + 0.2) {
      setLoopEnd(null);
      setLoopActive(false);
    }
  };

  const handleSetLoopB = () => {
    const t = Math.max(0.25, Math.round(timeRef.current * 20) / 20);
    const effectiveA = loopStart !== null && loopStart < t - 0.15 ? loopStart : 0;
    setLoopStart(effectiveA);
    setLoopEnd(t);
    setLoopActive(true);
  };

  const handleClearLoop = () => {
    setLoopStart(null);
    setLoopEnd(null);
    setLoopActive(false);
  };

  // Interactive on-screen keyboard handlers (triggers both MIDI store + audio)
  const handleVirtualKeyDown = useCallback(
    (midi: number) => {
      unlockAudio();
      handleMidiNoteOn(midi, 96);
      noteOn(midi, 0.78);
    },
    [unlockAudio, handleMidiNoteOn, noteOn],
  );

  const handleVirtualKeyUp = useCallback(
    (midi: number) => {
      handleMidiNoteOff(midi);
      noteOff(midi);
    },
    [handleMidiNoteOff, noteOff],
  );

  // Synchronized requestAnimationFrame playback loop (Wait Mode + Hand Isolation + Loop + Metronome)
  useEffect(() => {
    if (!isPlaying || !currentSong) {
      lastFrameRef.current = null;
      stopAll();
      return;
    }

    let rafId = 0;
    const notes = currentSong.notes;
    const totalDur = currentSong.durationSec;

    const frame = (now: number) => {
      if (lastFrameRef.current === null) {
        lastFrameRef.current = now;
      }
      const dtSec = Math.min(0.1, (now - lastFrameRef.current) / 1000);
      lastFrameRef.current = now;

      let nextTime = timeRef.current + dtSec * tempoRef.current;

      // A-B Loop wrap check
      const loop = loopRef.current;
      if (loop.active && loop.start !== null && loop.end !== null && nextTime >= loop.end) {
        stopAll();
        nextTime = loop.start;
        const idx = notes.findIndex((n) => n.time >= loop.start! - 0.01);
        const nextIdx = idx === -1 ? notes.length : idx;
        nextNoteIdxRef.current = nextIdx;
        waitCursorRef.current = nextIdx;
        lastMetronomeBeatRef.current = -1;
      }

      // Wait Mode gate: pause playhead at the next unplayed practiced-hand chord until satisfied
      let isWaitingNow = false;
      let currentWaitSet = new Set<number>();

      if (waitModeRef.current) {
        const group = findNextWaitGroup(notes, waitCursorRef.current, practiceHandRef.current);
        if (group && nextTime >= group.time) {
          if (isWaitGroupSatisfied(group.requiredPitches, activeUserNotesRef.current)) {
            waitCursorRef.current = group.endIndex;
          } else {
            nextTime = group.time;
            isWaitingNow = true;
            currentWaitSet = group.requiredPitches;
          }
        }
      }

      const waitKey = [...currentWaitSet].sort((a, b) => a - b).join(",");
      if (waitKey !== prevWaitingKeyRef.current) {
        prevWaitingKeyRef.current = waitKey;
        setWaitingNotes(currentWaitSet);
      }

      timeRef.current = nextTime;
      setCurrentTimeSec(nextTime);

      // Metronome click on beat boundaries (skip while frozen in Wait Mode)
      if (metronomeRef.current && !isWaitingNow) {
        const { beatIndex, beatInMeasure } = getBeatAtTime(
          nextTime,
          currentSong.bpm,
          currentSong.timeSignature.numerator,
          currentSong.timeSignature.denominator,
        );
        if (beatIndex !== lastMetronomeBeatRef.current) {
          lastMetronomeBeatRef.current = beatIndex;
          playMetronomeClick(beatInMeasure === 0);
        }
      }

      // Trigger audio notes crossing playhead
      while (
        nextNoteIdxRef.current < notes.length &&
        notes[nextNoteIdxRef.current]!.time <= nextTime + (isWaitingNow ? -0.0001 : 0)
      ) {
        const note = notes[nextNoteIdxRef.current]!;
        const practiced = isPracticedHand(note.hand, practiceHandRef.current);
        const shouldPlay = practiced
          ? !waitModeRef.current // in Wait Mode, let the learner play their own hand
          : !muteOtherHandRef.current;

        if (shouldPlay) {
          const vel = practiced ? note.velocity : note.velocity * 0.65;
          playNote(note.midi, note.duration / tempoRef.current, vel);
        }
        nextNoteIdxRef.current++;
      }

      // Compute active target keys for keyboard lighting
      const active = new Set<number>();
      for (const note of notes) {
        if (note.time <= nextTime && note.time + note.duration >= nextTime) {
          if (isPracticedHand(note.hand, practiceHandRef.current)) {
            active.add(note.midi);
          }
        } else if (note.time > nextTime) {
          break;
        }
      }

      const activeKey = [...active].sort((a, b) => a - b).join(",");
      if (activeKey !== prevActiveKeyRef.current) {
        prevActiveKeyRef.current = activeKey;
        setActiveSongNotes(active);
      }

      if (!isWaitingNow && nextTime >= totalDur + 0.3) {
        setIsPlaying(false);
        setActiveSongNotes(new Set());
        setWaitingNotes(new Set());
        return;
      }

      rafId = requestAnimationFrame(frame);
    };

    rafId = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(rafId);
      stopAll();
    };
  }, [
    isPlaying,
    currentSong,
    playNote,
    playMetronomeClick,
    stopAll,
    setActiveSongNotes,
    setIsPlaying,
  ]);

  const visibleRange = useMemo(() => {
    if (!currentSong) {
      return computeAutoZoomRange(null, null, profile.keyboardRange);
    }
    return computeAutoZoomRange(
      currentSong.metadata.fittedMinNote,
      currentSong.metadata.fittedMaxNote,
      profile.keyboardRange,
    );
  }, [currentSong, profile.keyboardRange]);

  const loopRangeObj = useMemo(
    () => ({ start: loopStart, end: loopEnd, active: loopActive }),
    [loopStart, loopEnd, loopActive],
  );

  if (!currentSong) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <p className="text-lg text-slate-300">No song selected.</p>
        <button
          type="button"
          onClick={clearCurrentSong}
          className="min-h-[44px] px-5 rounded-xl bg-sky-500 text-slate-950 font-bold cursor-pointer"
        >
          Back to Library
        </button>
      </div>
    );
  }

  const { metadata } = currentSong;
  const durationSafe = Math.max(1, currentSong.durationSec);
  const loopLeftPct = loopStart !== null ? (loopStart / durationSafe) * 100 : 0;
  const loopWidthPct =
    loopStart !== null && loopEnd !== null
      ? Math.max(0, ((loopEnd - loopStart) / durationSafe) * 100)
      : 0;

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      {/* Row 1: Transport, Song Info, Timeline Scrubber, Tempo & Volume */}
      <div className="shrink-0 px-4 py-2.5 bg-slate-900/95 border-b border-slate-800 flex items-center justify-between gap-3">
        {/* Song title + transport buttons */}
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={handleTogglePlay}
            className="min-h-[44px] min-w-[104px] px-4 rounded-xl bg-sky-500 hover:bg-sky-400 active:bg-sky-300 text-slate-950 font-extrabold text-sm flex items-center justify-center gap-1.5 transition cursor-pointer shrink-0"
          >
            <span>{isPlaying || countInBeat !== null ? "⏸" : "▶"}</span>
            <span>{countInBeat !== null ? "Cancel" : isPlaying ? "Pause" : "Play"}</span>
          </button>

          <button
            type="button"
            onClick={handleRestart}
            className="min-h-[44px] px-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 font-semibold text-sm transition cursor-pointer shrink-0"
          >
            ↺
          </button>

          <div className="min-w-0 ml-0.5 max-w-[260px]">
            <div className="flex items-center gap-1.5">
              <h2 className="text-base font-bold text-white truncate">{metadata.title}</h2>
              <span className="px-2 py-0.5 rounded-full bg-slate-800 text-sky-300 text-[11px] font-bold shrink-0">
                L{metadata.difficultyLevel}
              </span>
            </div>
            <div className="text-xs text-slate-400 truncate">
              {metadata.composer} · {currentSong.bpm} BPM · {currentSong.timeSignature.numerator}/
              {currentSong.timeSignature.denominator}
            </div>
          </div>
        </div>

        {/* Timeline scrubber with A-B loop indicator */}
        <div className="flex-1 max-w-md flex items-center gap-2.5">
          <span className="font-mono text-xs text-slate-300 w-10 text-right">
            {formatTime(currentTimeSec)}
          </span>
          <div className="relative flex-1 flex items-center">
            {loopStart !== null && loopEnd !== null && (
              <div
                style={{ left: `${loopLeftPct}%`, width: `${loopWidthPct}%` }}
                className={`pointer-events-none absolute h-2.5 rounded-full ${
                  loopActive ? "bg-sky-400/45 border border-sky-300/60" : "bg-slate-600/40"
                }`}
              />
            )}
            <input
              type="range"
              min={0}
              max={durationSafe}
              step={0.05}
              value={Math.min(currentSong.durationSec, currentTimeSec)}
              onChange={(e) => seekTo(Number(e.target.value))}
              aria-label="Song progress"
              className="relative z-10 w-full h-2.5 accent-sky-400 cursor-pointer"
            />
          </div>
          <span className="font-mono text-xs text-slate-400 w-10">
            {formatTime(currentSong.durationSec)}
          </span>
        </div>

        {/* Tempo & Volume controls */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="flex items-center gap-2 bg-slate-950/70 px-2.5 py-1.5 rounded-xl border border-slate-800">
            <span className="text-xs font-semibold text-slate-400">Speed</span>
            <input
              type="range"
              min={0.25}
              max={1.5}
              step={0.05}
              value={tempo}
              onChange={(e) => setTempo(Number(e.target.value))}
              aria-label="Tempo speed"
              className="w-20 h-2 accent-sky-400 cursor-pointer"
            />
            <span className="font-mono text-xs font-bold text-white w-9 text-right">
              {Math.round(tempo * 100)}%
            </span>
          </div>

          <div className="hidden xl:flex items-center gap-1.5 bg-slate-950/70 px-2.5 py-1.5 rounded-xl border border-slate-800">
            <span className="text-xs font-semibold text-slate-400">Vol</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              aria-label="Audio volume"
              className="w-14 h-2 accent-emerald-400 cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* Row 2: Tier 1 Practice Bar (View Toggle, Wait Mode, Hand Isolation, A-B Loop, Count-In, Metronome) */}
      <div className="shrink-0 px-4 py-1.5 bg-slate-950 border-b border-slate-800/90 flex items-center justify-between gap-2 overflow-x-auto text-xs">
        <div className="flex items-center gap-2 shrink-0">
          {/* Score / Piano Roll toggle */}
          <div className="flex items-center bg-slate-900 p-0.5 rounded-lg border border-slate-800">
            <button
              type="button"
              onClick={() => setViewMode("score")}
              className={`px-2.5 py-1 rounded-md font-bold transition cursor-pointer ${
                viewMode === "score"
                  ? "bg-sky-500 text-slate-950"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              𝄞 Score
            </button>
            <button
              type="button"
              onClick={() => setViewMode("piano-roll")}
              className={`px-2.5 py-1 rounded-md font-bold transition cursor-pointer ${
                viewMode === "piano-roll"
                  ? "bg-sky-500 text-slate-950"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              Piano Roll
            </button>
          </div>

          {/* Note Labels toggle */}
          <button
            type="button"
            onClick={() => setShowNoteNames(!showNoteNames)}
            className={`px-2.5 py-1 rounded-lg border font-semibold transition cursor-pointer ${
              showNoteNames
                ? "border-sky-400/50 bg-sky-500/20 text-sky-200"
                : "border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200"
            }`}
          >
            Names
          </button>

          {/* Wait Mode toggle */}
          <button
            type="button"
            onClick={() => setWaitMode(!waitMode)}
            title="Pause playback until you press the target note(s)"
            className={`px-2.5 py-1 rounded-lg border font-bold transition cursor-pointer ${
              waitMode
                ? "border-amber-400/60 bg-amber-500/20 text-amber-200"
                : "border-slate-800 bg-slate-900 text-slate-300 hover:text-white"
            }`}
          >
            {waitMode ? "● Wait Mode" : "Wait Mode"}
          </button>

          {/* Hand Isolation selector */}
          <div className="flex items-center bg-slate-900 p-0.5 rounded-lg border border-slate-800">
            {(
              [
                ["both", "Both"],
                ["right", "RH"],
                ["left", "LH"],
              ] as const
            ).map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => setPracticeHand(val)}
                className={`px-2 py-1 rounded-md font-bold transition cursor-pointer ${
                  practiceHand === val
                    ? "bg-indigo-500 text-white"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {practiceHand !== "both" && (
            <button
              type="button"
              onClick={() => setMuteOtherHand(!muteOtherHand)}
              className={`px-2 py-1 rounded-lg border font-semibold transition cursor-pointer ${
                muteOtherHand
                  ? "border-rose-400/40 bg-rose-950/50 text-rose-200"
                  : "border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200"
              }`}
            >
              {muteOtherHand ? "Accomp Muted" : "Accomp On"}
            </button>
          )}
        </div>

        {/* Right side: A-B Loop, Count-In, Metronome, Audio Engine status */}
        <div className="flex items-center gap-2 shrink-0">
          {/* A-B Loop */}
          <div className="flex items-center gap-1 bg-slate-900 px-1.5 py-0.5 rounded-lg border border-slate-800">
            <button
              type="button"
              onClick={handleSetLoopA}
              title="Set loop start A at current time"
              className={`px-2 py-0.5 rounded font-bold transition cursor-pointer ${
                loopStart !== null
                  ? "bg-sky-500/25 text-sky-200"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              {loopStart !== null ? `A ${formatTime(loopStart)}` : "Set A"}
            </button>
            <button
              type="button"
              onClick={handleSetLoopB}
              title="Set loop end B at current time"
              className={`px-2 py-0.5 rounded font-bold transition cursor-pointer ${
                loopEnd !== null ? "bg-sky-500/25 text-sky-200" : "text-slate-300 hover:text-white"
              }`}
            >
              {loopEnd !== null ? `B ${formatTime(loopEnd)}` : "Set B"}
            </button>
            {loopStart !== null && loopEnd !== null && (
              <>
                <button
                  type="button"
                  onClick={() => setLoopActive((v) => !v)}
                  className={`px-2 py-0.5 rounded font-bold transition cursor-pointer ${
                    loopActive
                      ? "bg-sky-500 text-slate-950"
                      : "bg-slate-800 text-slate-300 hover:text-white"
                  }`}
                >
                  Loop {loopActive ? "On" : "Off"}
                </button>
                <button
                  type="button"
                  onClick={handleClearLoop}
                  aria-label="Clear loop"
                  className="px-1.5 py-0.5 text-slate-400 hover:text-white cursor-pointer"
                >
                  ✕
                </button>
              </>
            )}
          </div>

          {/* Count-In toggle */}
          <button
            type="button"
            onClick={() => setCountInEnabled(!countInEnabled)}
            title="Play a 1-bar count-in before starting"
            className={`px-2.5 py-1 rounded-lg border font-semibold transition cursor-pointer ${
              countInEnabled
                ? "border-emerald-500/40 bg-emerald-950/50 text-emerald-200"
                : "border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200"
            }`}
          >
            Count-In
          </button>

          {/* Metronome toggle */}
          <button
            type="button"
            onClick={() => setMetronomeEnabled(!metronomeEnabled)}
            title="Toggle beat metronome"
            className={`px-2.5 py-1 rounded-lg border font-semibold transition cursor-pointer ${
              metronomeEnabled
                ? "border-violet-400/50 bg-violet-500/20 text-violet-200"
                : "border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200"
            }`}
          >
            Metronome
          </button>

          {/* Sampled Piano engine badge */}
          <span
            className={`hidden 2xl:inline-flex items-center px-2 py-1 rounded-lg border text-[11px] font-semibold ${
              engineMode === "sampled"
                ? "border-emerald-500/30 bg-emerald-950/30 text-emerald-300"
                : "border-slate-800 bg-slate-900 text-slate-400"
            }`}
          >
            {engineMode === "sampled"
              ? "Grand Piano"
              : engineMode === "loading"
                ? "Loading Piano…"
                : "Synth"}
          </span>
        </div>
      </div>

      {/* Main Visualizer Area (Score default, Piano Roll option) + Overlays */}
      <div className="relative flex-1 min-h-0 flex flex-col overflow-hidden">
        {viewMode === "score" ? (
          <ScoreCanvas
            notes={currentSong.notes}
            measures={currentSong.measures}
            currentTimeSec={currentTimeSec}
            bpm={currentSong.bpm}
            keySignatureFifths={currentSong.keySignatureFifths}
            timeSignature={currentSong.timeSignature}
            activeUserNotes={activeUserNotes}
            waitingNotes={waitingNotes}
            practiceHand={practiceHand}
            showNoteNames={showNoteNames}
            loopRange={loopRangeObj}
          />
        ) : (
          <FallingNotesCanvas
            notes={currentSong.notes}
            currentTimeSec={currentTimeSec}
            minNote={visibleRange.minNote}
            maxNote={visibleRange.maxNote}
            activeUserNotes={activeUserNotes}
            waitingNotes={waitingNotes}
            practiceHand={practiceHand}
            showNoteNames={showNoteNames}
            loopRange={loopRangeObj}
          />
        )}

        {/* Wait Mode live prompt pill */}
        {waitingNotes.size > 0 && (
          <div className="pointer-events-none absolute top-3 right-4 z-20 px-3.5 py-1.5 rounded-full bg-amber-500 text-slate-950 font-extrabold text-xs shadow-lg flex items-center gap-2">
            <span>Waiting for:</span>
            <span className="font-mono">
              {[...waitingNotes]
                .sort((a, b) => a - b)
                .map(midiToNoteName)
                .join(" + ")}
            </span>
          </div>
        )}

        {/* Count-In overlay */}
        {countInBeat !== null && (
          <div className="pointer-events-none absolute inset-0 z-30 bg-slate-950/45 backdrop-blur-[2px] flex flex-col items-center justify-center">
            <div className="text-xs font-bold uppercase tracking-widest text-sky-300 mb-1">
              Get Ready
            </div>
            <div className="text-7xl font-black text-white drop-shadow-lg tabular-nums">
              {countInBeat}
            </div>
            <div className="text-sm text-slate-300 mt-1">
              of {currentSong.timeSignature.numerator}
            </div>
          </div>
        )}
      </div>

      {/* Auto-zoomed Interactive Piano Keyboard strictly clamped to calibrated KeyboardRange */}
      <PianoKeyboard
        minNote={visibleRange.minNote}
        maxNote={visibleRange.maxNote}
        activeUserNotes={activeUserNotes}
        activeSongNotes={activeSongNotes}
        waitingNotes={waitingNotes}
        sustainPedalDown={sustainPedalDown}
        onKeyDown={handleVirtualKeyDown}
        onKeyUp={handleVirtualKeyUp}
        heightClass="h-40"
      />
    </div>
  );
}
