import { useMemo, useState } from "react";
import {
  computeAutoZoomRange,
  fitSongToKeyboardRange,
  midiToNoteName,
} from "../shared/keyboardRange.ts";
import type { FittedSong } from "../shared/types.ts";
import { useAppStore } from "../store/appStore.ts";
import { PianoKeyboard } from "./PianoKeyboard.tsx";

export function SongLibrary() {
  const songs = useAppStore((s) => s.songs);
  const songsLoading = useAppStore((s) => s.songsLoading);
  const songLoading = useAppStore((s) => s.songLoading);
  const profile = useAppStore((s) => s.profile);
  const activeUserNotes = useAppStore((s) => s.activeUserNotes);
  const selectSong = useAppStore((s) => s.selectSong);
  const openCalibration = useAppStore((s) => s.openCalibration);

  const [filterMode, setFilterMode] = useState<"recommended" | "all">("recommended");
  const skillLevel = profile.skillLevel ?? 1;

  const { fittedSongs, excludedCount } = useMemo(() => {
    const fitted: FittedSong[] = [];
    let excluded = 0;
    for (const song of songs) {
      const fit = fitSongToKeyboardRange(song, profile.keyboardRange);
      if (fit) {
        fitted.push(fit);
      } else {
        excluded++;
      }
    }
    fitted.sort((a, b) => a.difficultyLevel - b.difficultyLevel);
    return { fittedSongs: fitted, excludedCount: excluded };
  }, [songs, profile.keyboardRange]);

  const visibleSongs = useMemo(() => {
    if (filterMode === "all") return fittedSongs;
    const rec = fittedSongs.filter((s) => Math.abs(s.difficultyLevel - skillLevel) <= 1);
    return rec.length > 0 ? rec : fittedSongs;
  }, [fittedSongs, filterMode, skillLevel]);

  const idleKeyboardRange = useMemo(
    () => computeAutoZoomRange(null, null, profile.keyboardRange),
    [profile.keyboardRange]
  );

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">
        {/* Coaching feedback banner (when available) */}
        {profile.feedback && (
          <div className="mb-5 p-4 rounded-2xl bg-sky-950/40 border border-sky-500/30 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="text-xs font-bold uppercase tracking-wider text-sky-300 mb-0.5">
                Last Calibration Feedback ({profile.feedbackSource === "ai" ? "AI" : "Local"})
              </div>
              <p className="text-base text-slate-100">{profile.feedback}</p>
            </div>
            <button
              type="button"
              onClick={() => openCalibration("skill")}
              className="min-h-[44px] px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-sky-200 font-semibold text-sm shrink-0 cursor-pointer"
            >
              Re-calibrate
            </button>
          </div>
        )}

        {/* Filter bar */}
        <div className="flex items-center justify-between gap-4 mb-5">
          <div>
            <h2 className="text-2xl font-bold text-white">Song Library</h2>
            <p className="text-sm text-slate-400">
              Showing {visibleSongs.length} playable{" "}
              {visibleSongs.length === 1 ? "song" : "songs"} for your{" "}
              <span className="font-mono text-slate-300">
                {midiToNoteName(profile.keyboardRange.minNote)}–
                {midiToNoteName(profile.keyboardRange.maxNote)}
              </span>{" "}
              keyboard
              {excludedCount > 0 && (
                <span className="text-amber-300">
                  {" "}
                  ({excludedCount} hidden — wider than keyboard)
                </span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2 bg-slate-900 p-1.5 rounded-2xl border border-slate-800">
            <button
              type="button"
              onClick={() => setFilterMode("recommended")}
              className={`min-h-[44px] px-5 rounded-xl font-bold text-sm transition cursor-pointer ${
                filterMode === "recommended"
                  ? "bg-sky-500 text-slate-950 shadow"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              Recommended (L{Math.max(1, skillLevel - 1)}–L{Math.min(10, skillLevel + 1)})
            </button>
            <button
              type="button"
              onClick={() => setFilterMode("all")}
              className={`min-h-[44px] px-5 rounded-xl font-bold text-sm transition cursor-pointer ${
                filterMode === "all"
                  ? "bg-sky-500 text-slate-950 shadow"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              All Songs ({fittedSongs.length})
            </button>
          </div>
        </div>

        {/* Song Grid (3 columns on 1340px tablet) */}
        {songsLoading ? (
          <div className="py-16 text-center text-slate-400 text-lg">Loading Song Catalog…</div>
        ) : visibleSongs.length === 0 ? (
          <div className="py-16 text-center bg-slate-900 border border-slate-800 rounded-3xl">
            <p className="text-lg text-slate-300 mb-3">
              No songs fit your current Keyboard Range.
            </p>
            <button
              type="button"
              onClick={() => openCalibration("keyboard-range")}
              className="min-h-[44px] px-5 rounded-xl bg-violet-500 hover:bg-violet-400 text-slate-950 font-bold cursor-pointer"
            >
              Adjust Keyboard Range
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-4">
            {visibleSongs.map((song) => {
              const isMatch = Math.abs(song.difficultyLevel - skillLevel) <= 1;
              return (
                <button
                  key={song.id}
                  type="button"
                  disabled={songLoading}
                  onClick={() => void selectSong(song)}
                  className={`group text-left rounded-2xl p-5 border transition flex flex-col justify-between min-h-[168px] cursor-pointer disabled:opacity-60 ${
                    isMatch
                      ? "bg-slate-900 border-sky-500/40 hover:border-sky-400 hover:bg-slate-800/90"
                      : "bg-slate-900/70 border-slate-800 hover:border-slate-600 hover:bg-slate-800/80"
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2.5">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider ${
                          isMatch
                            ? "bg-sky-500/20 text-sky-200 border border-sky-400/30"
                            : "bg-slate-800 text-slate-300"
                        }`}
                      >
                        Level {song.difficultyLevel}
                      </span>

                      <div className="flex items-center gap-1.5">
                        {song.transposeSemitones !== 0 && (
                          <span className="px-2.5 py-0.5 rounded-full bg-violet-500/20 border border-violet-400/30 text-violet-200 text-xs font-semibold">
                            {song.transposeSemitones > 0 ? "+" : ""}
                            {song.transposeSemitones / 12} oct
                          </span>
                        )}
                        <span className="text-xs font-mono text-slate-400">
                          {Math.round(song.durationSec)}s · {song.bpm} BPM
                        </span>
                      </div>
                    </div>

                    <h3 className="text-xl font-bold text-white group-hover:text-sky-300 transition">
                      {song.title}
                    </h3>
                    <div className="text-sm text-slate-400 mt-0.5">{song.composer}</div>
                    {song.description && (
                      <p className="text-sm text-slate-300/90 mt-2 line-clamp-2">
                        {song.description}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-800/80">
                    <span className="text-xs font-mono text-slate-400">
                      {midiToNoteName(song.fittedMinNote)}–{midiToNoteName(song.fittedMaxNote)}
                    </span>
                    <span className="text-sm font-bold text-sky-400 group-hover:translate-x-0.5 transition">
                      Play →
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Live idle piano keyboard at bottom */}
      <PianoKeyboard
        minNote={idleKeyboardRange.minNote}
        maxNote={idleKeyboardRange.maxNote}
        activeUserNotes={activeUserNotes}
        activeSongNotes={new Set()}
        heightClass="h-32"
      />
    </div>
  );
}
