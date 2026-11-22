import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAudioSynth } from "../hooks/useAudioSynth.ts";
import { computeAutoZoomRange, midiToNoteName } from "../shared/keyboardRange.ts";
import { useAppStore } from "../store/appStore.ts";
import { FallingNotesCanvas } from "./FallingNotesCanvas.tsx";
import { PianoKeyboard } from "./PianoKeyboard.tsx";

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
  const isPlaying = useAppStore((s) => s.isPlaying);
  const tempo = useAppStore((s) => s.tempo);
  const volume = useAppStore((s) => s.volume);
  const setIsPlaying = useAppStore((s) => s.setIsPlaying);
  const setActiveSongNotes = useAppStore((s) => s.setActiveSongNotes);
  const setTempo = useAppStore((s) => s.setTempo);
  const setVolume = useAppStore((s) => s.setVolume);
  const clearCurrentSong = useAppStore((s) => s.clearCurrentSong);

  const { playNote, stopAll, unlockAudio } = useAudioSynth();

  const [currentTimeSec, setCurrentTimeSec] = useState(0);

  const timeRef = useRef(0);
  const lastFrameRef = useRef<number | null>(null);
  const nextNoteIdxRef = useRef(0);
  const prevActiveKeyRef = useRef("");
  const tempoRef = useRef(tempo);
  tempoRef.current = tempo;

  // Reset timeline when song changes
  useEffect(() => {
    timeRef.current = 0;
    nextNoteIdxRef.current = 0;
    lastFrameRef.current = null;
    prevActiveKeyRef.current = "";
    setCurrentTimeSec(0);
    setActiveSongNotes(new Set());
    stopAll();
  }, [currentSong, setActiveSongNotes, stopAll]);

  const seekTo = useCallback(
    (targetSec: number) => {
      if (!currentSong) return;
      const clamped = Math.max(0, Math.min(currentSong.durationSec, targetSec));
      stopAll();
      timeRef.current = clamped;
      setCurrentTimeSec(clamped);

      // Advance note trigger cursor to first note at or after targetSec
      const idx = currentSong.notes.findIndex((n) => n.time >= clamped);
      nextNoteIdxRef.current = idx === -1 ? currentSong.notes.length : idx;
      prevActiveKeyRef.current = "";
      setActiveSongNotes(new Set());
    },
    [currentSong, setActiveSongNotes, stopAll]
  );

  const handleTogglePlay = () => {
    if (!currentSong) return;
    unlockAudio();
    if (!isPlaying && timeRef.current >= currentSong.durationSec - 0.05) {
      seekTo(0);
    }
    setIsPlaying(!isPlaying);
  };

  const handleRestart = () => {
    unlockAudio();
    seekTo(0);
    setIsPlaying(true);
  };

  // Synchronized requestAnimationFrame playback loop
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

      const nextTime = timeRef.current + dtSec * tempoRef.current;
      timeRef.current = nextTime;
      setCurrentTimeSec(nextTime);

      // Trigger Web Audio notes crossing playhead
      while (
        nextNoteIdxRef.current < notes.length &&
        notes[nextNoteIdxRef.current]!.time <= nextTime
      ) {
        const note = notes[nextNoteIdxRef.current]!;
        playNote(note.midi, note.duration / tempoRef.current, note.velocity);
        nextNoteIdxRef.current++;
      }

      // Compute active target keys for keyboard lighting
      const active = new Set<number>();
      for (const note of notes) {
        if (note.time <= nextTime && note.time + note.duration >= nextTime) {
          active.add(note.midi);
        } else if (note.time > nextTime) {
          break;
        }
      }

      const activeKey = [...active].sort((a, b) => a - b).join(",");
      if (activeKey !== prevActiveKeyRef.current) {
        prevActiveKeyRef.current = activeKey;
        setActiveSongNotes(active);
      }

      if (nextTime >= totalDur + 0.3) {
        setIsPlaying(false);
        setActiveSongNotes(new Set());
        return;
      }

      rafId = requestAnimationFrame(frame);
    };

    rafId = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(rafId);
      stopAll();
    };
  }, [isPlaying, currentSong, playNote, stopAll, setActiveSongNotes, setIsPlaying]);

  const visibleRange = useMemo(() => {
    if (!currentSong) {
      return computeAutoZoomRange(null, null, profile.keyboardRange);
    }
    return computeAutoZoomRange(
      currentSong.metadata.fittedMinNote,
      currentSong.metadata.fittedMaxNote,
      profile.keyboardRange
    );
  }, [currentSong, profile.keyboardRange]);

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

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      {/* Transport & Tempo Control Bar */}
      <div className="shrink-0 px-5 py-3 bg-slate-900/95 border-b border-slate-800 flex items-center justify-between gap-4">
        {/* Song title + transport buttons */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={handleTogglePlay}
            className="min-h-[48px] min-w-[112px] px-5 rounded-xl bg-sky-500 hover:bg-sky-400 active:bg-sky-300 text-slate-950 font-extrabold text-base flex items-center justify-center gap-2 transition cursor-pointer shrink-0"
          >
            <span>{isPlaying ? "⏸" : "▶"}</span>
            <span>{isPlaying ? "Pause" : "Play"}</span>
          </button>

          <button
            type="button"
            onClick={handleRestart}
            className="min-h-[48px] px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 font-semibold text-sm transition cursor-pointer shrink-0"
          >
            ↺ Restart
          </button>

          <div className="min-w-0 ml-1">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-white truncate">{metadata.title}</h2>
              <span className="px-2 py-0.5 rounded-full bg-slate-800 text-sky-300 text-xs font-bold shrink-0">
                L{metadata.difficultyLevel}
              </span>
              {metadata.transposeSemitones !== 0 && (
                <span className="px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-200 text-xs font-semibold shrink-0">
                  {metadata.transposeSemitones > 0 ? "+" : ""}
                  {metadata.transposeSemitones / 12} oct
                </span>
              )}
            </div>
            <div className="text-xs text-slate-400 truncate">
              {metadata.composer} · View {midiToNoteName(visibleRange.minNote)}–
              {midiToNoteName(visibleRange.maxNote)}
            </div>
          </div>
        </div>

        {/* Timeline scrubber */}
        <div className="flex-1 max-w-md flex items-center gap-3">
          <span className="font-mono text-xs text-slate-300 w-10 text-right">
            {formatTime(currentTimeSec)}
          </span>
          <input
            type="range"
            min={0}
            max={Math.max(1, currentSong.durationSec)}
            step={0.05}
            value={Math.min(currentSong.durationSec, currentTimeSec)}
            onChange={(e) => seekTo(Number(e.target.value))}
            aria-label="Song progress"
            className="flex-1 h-2.5 accent-sky-400 cursor-pointer"
          />
          <span className="font-mono text-xs text-slate-400 w-10">
            {formatTime(currentSong.durationSec)}
          </span>
        </div>

        {/* Tempo & Volume controls */}
        <div className="flex items-center gap-4 shrink-0">
          <div className="flex items-center gap-2 bg-slate-950/70 px-3 py-1.5 rounded-xl border border-slate-800">
            <span className="text-xs font-semibold text-slate-400">Tempo</span>
            <input
              type="range"
              min={0.5}
              max={1.25}
              step={0.05}
              value={tempo}
              onChange={(e) => setTempo(Number(e.target.value))}
              aria-label="Tempo speed"
              className="w-24 h-2 accent-sky-400 cursor-pointer"
            />
            <span className="font-mono text-xs font-bold text-white w-10 text-right">
              {Math.round(tempo * 100)}%
            </span>
          </div>

          <div className="hidden xl:flex items-center gap-2 bg-slate-950/70 px-3 py-1.5 rounded-xl border border-slate-800">
            <span className="text-xs font-semibold text-slate-400">Vol</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              aria-label="Audio volume"
              className="w-16 h-2 accent-emerald-400 cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* Legend bar */}
      <div className="shrink-0 px-5 py-1.5 bg-slate-950 border-b border-slate-900 flex items-center justify-end gap-5 text-xs text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-sky-400" /> Right Hand
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-indigo-400" /> Left Hand
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-amber-400" /> Your MIDI Input
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-emerald-400" /> Matched Hit
        </span>
      </div>

      {/* Falling Notes Visualizer */}
      <FallingNotesCanvas
        notes={currentSong.notes}
        currentTimeSec={currentTimeSec}
        minNote={visibleRange.minNote}
        maxNote={visibleRange.maxNote}
        activeUserNotes={activeUserNotes}
      />

      {/* Auto-zoomed Piano Keyboard strictly clamped to calibrated KeyboardRange */}
      <PianoKeyboard
        minNote={visibleRange.minNote}
        maxNote={visibleRange.maxNote}
        activeUserNotes={activeUserNotes}
        activeSongNotes={activeSongNotes}
        heightClass="h-44"
      />
    </div>
  );
}
