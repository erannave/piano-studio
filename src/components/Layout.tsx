import { useState } from "react";
import type { ReactNode } from "react";
import { usePwaInstall } from "../hooks/usePwaInstall.ts";
import { midiToNoteName } from "../shared/keyboardRange.ts";
import { useAppStore } from "../store/appStore.ts";

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const midiStatus = useAppStore((s) => s.midiStatus);
  const connectedDeviceName = useAppStore((s) => s.connectedDeviceName);
  const midiDevices = useAppStore((s) => s.midiDevices);
  const selectedMidiDeviceId = useAppStore((s) => s.selectedMidiDeviceId);
  const setSelectedMidiDeviceId = useAppStore((s) => s.setSelectedMidiDeviceId);
  const sustainPedalDown = useAppStore((s) => s.sustainPedalDown);
  const profile = useAppStore((s) => s.profile);
  const currentStage = useAppStore((s) => s.currentStage);
  const isMuted = useAppStore((s) => s.isMuted);
  const toggleMute = useAppStore((s) => s.toggleMute);
  const clearCurrentSong = useAppStore((s) => s.clearCurrentSong);
  const setStage = useAppStore((s) => s.setStage);
  const openCalibration = useAppStore((s) => s.openCalibration);
  const setManualSkillLevel = useAppStore((s) => s.setManualSkillLevel);

  const [showLevelPicker, setShowLevelPicker] = useState(false);
  const [showMidiPicker, setShowMidiPicker] = useState(false);
  const { canInstall, promptInstall } = usePwaInstall();

  const midiBadge = (() => {
    switch (midiStatus) {
      case "connected":
        return {
          dot: "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]",
          text: connectedDeviceName || "MIDI Connected",
          cls: "border-emerald-500/40 bg-emerald-950/50 text-emerald-200 hover:bg-emerald-900/50",
        };
      case "no-devices":
        return {
          dot: "bg-amber-400",
          text: "No MIDI Piano",
          cls: "border-amber-500/30 bg-amber-950/40 text-amber-200 hover:bg-amber-900/40",
        };
      case "denied":
        return {
          dot: "bg-rose-400",
          text: "MIDI Permission Denied",
          cls: "border-rose-500/40 bg-rose-950/40 text-rose-200",
        };
      case "unsupported":
        return {
          dot: "bg-slate-400",
          text: "Web MIDI Unavailable",
          cls: "border-slate-700 bg-slate-900 text-slate-300",
        };
      default:
        return {
          dot: "bg-sky-400 pulse-motion",
          text: "Checking MIDI...",
          cls: "border-slate-700 bg-slate-900 text-slate-300",
        };
    }
  })();

  const rangeLabel = `${midiToNoteName(profile.keyboardRange.minNote)}–${midiToNoteName(
    profile.keyboardRange.maxNote,
  )}`;

  return (
    <div className="h-dvh w-dvw overflow-hidden flex flex-col bg-slate-950 text-slate-100">
      {/* Top Bar optimized for 1340x800 landscape tablet */}
      <header className="h-16 shrink-0 px-5 border-b border-slate-800 bg-slate-900/98 flex items-center justify-between gap-4 z-30">
        <div className="flex items-center gap-3 min-w-0">
          {currentStage !== "library" && profile.skillLevel !== null && (
            <button
              type="button"
              onClick={() => (currentStage === "player" ? clearCurrentSong() : setStage("library"))}
              className="min-h-[44px] px-4 rounded-xl bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-100 font-semibold text-base flex items-center gap-2 transition cursor-pointer"
            >
              <span>←</span>
              <span>Library</span>
            </button>
          )}

          <div className="flex items-center gap-2.5">
            <span className="text-2xl" aria-hidden="true">
              🎹
            </span>
            <h1 className="text-lg font-bold tracking-tight text-white whitespace-nowrap">
              Piano Studio
            </h1>
          </div>

          {/* MIDI Status + Input Device Selector */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowMidiPicker((v) => !v)}
              className={`px-3 py-1.5 rounded-full border text-sm font-medium flex items-center gap-2 truncate max-w-[260px] transition cursor-pointer ${midiBadge.cls}`}
            >
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${midiBadge.dot}`} />
              <span className="truncate">{midiBadge.text}</span>
              {sustainPedalDown && (
                <span className="px-1.5 py-0.2 rounded bg-amber-400 text-slate-950 text-[10px] font-extrabold">
                  PED
                </span>
              )}
              {midiDevices.length > 0 && <span className="text-[10px] opacity-75">▼</span>}
            </button>

            {showMidiPicker && (
              <div className="absolute left-0 mt-2 w-72 rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl p-3 z-50">
                <div className="flex items-center justify-between mb-2 px-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    MIDI Input Device
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowMidiPicker(false)}
                    className="text-slate-400 hover:text-white text-xs px-1.5 py-0.5 cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
                {midiDevices.length === 0 ? (
                  <p className="text-xs text-slate-400 px-1 py-2">
                    Connect a USB or Bluetooth MIDI piano to play along. You can also click the
                    on-screen keys directly.
                  </p>
                ) : (
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedMidiDeviceId(null);
                        setShowMidiPicker(false);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-xl text-sm font-medium transition cursor-pointer ${
                        selectedMidiDeviceId === null
                          ? "bg-sky-500/20 text-sky-200 border border-sky-400/40"
                          : "hover:bg-slate-800 text-slate-200"
                      }`}
                    >
                      All Connected Devices ({midiDevices.length})
                    </button>
                    {midiDevices.map((dev) => (
                      <button
                        key={dev.id}
                        type="button"
                        onClick={() => {
                          setSelectedMidiDeviceId(dev.id);
                          setShowMidiPicker(false);
                        }}
                        className={`w-full text-left px-3 py-2 rounded-xl text-sm font-medium truncate transition cursor-pointer ${
                          selectedMidiDeviceId === dev.id
                            ? "bg-sky-500/20 text-sky-200 border border-sky-400/40"
                            : "hover:bg-slate-800 text-slate-200"
                        }`}
                      >
                        {dev.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {/* PWA Install button (shown only when browser signals installability) */}
          {canInstall && (
            <button
              type="button"
              onClick={() => void promptInstall()}
              title="Install Piano Studio as a fullscreen app"
              className="min-h-[44px] px-3.5 rounded-xl border border-sky-500/40 bg-sky-500/15 hover:bg-sky-500/25 text-sky-200 text-sm font-semibold flex items-center gap-1.5 transition cursor-pointer"
            >
              <span>⬇</span>
              <span>Install App</span>
            </button>
          )}

          {/* Keyboard Range button */}
          <button
            type="button"
            onClick={() => openCalibration("keyboard-range")}
            title="Calibrate physical Keyboard Range"
            className="min-h-[44px] px-3.5 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-sm font-semibold flex items-center gap-2 transition cursor-pointer"
          >
            <span className="text-slate-400">Keys</span>
            <span className="text-white font-mono">{rangeLabel}</span>
          </button>

          {/* Skill Level pill + quick manual adjuster */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowLevelPicker((v) => !v)}
              className="min-h-[44px] px-4 rounded-xl border border-sky-500/40 bg-sky-950/60 hover:bg-sky-900/60 text-sky-100 text-base font-bold flex items-center gap-2 transition cursor-pointer"
            >
              <span>{profile.skillLevel ? `Level ${profile.skillLevel}` : "Unrated"}</span>
              <span className="text-xs text-sky-300">▼</span>
            </button>

            {showLevelPicker && (
              <div className="absolute right-0 mt-2 w-72 rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl p-4 z-50">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold text-slate-300">Set Skill Level</span>
                  <button
                    type="button"
                    onClick={() => setShowLevelPicker(false)}
                    className="text-slate-400 hover:text-white text-sm px-2 py-1 cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
                <div className="grid grid-cols-5 gap-2 mb-3">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={async () => {
                        await setManualSkillLevel(lvl);
                        setShowLevelPicker(false);
                        if (currentStage === "calibration") setStage("library");
                      }}
                      className={`min-h-[44px] rounded-xl font-bold text-base transition cursor-pointer ${
                        profile.skillLevel === lvl
                          ? "bg-sky-500 text-slate-950"
                          : "bg-slate-800 hover:bg-slate-700 text-slate-200"
                      }`}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowLevelPicker(false);
                    openCalibration("skill");
                  }}
                  className="w-full min-h-[44px] rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sky-300 font-semibold text-sm transition cursor-pointer"
                >
                  Re-run Skill Calibration
                </button>
              </div>
            )}
          </div>

          {/* Audio Synth Mute toggle */}
          <button
            type="button"
            onClick={toggleMute}
            aria-label={isMuted ? "Unmute piano audio" : "Mute piano audio"}
            className={`min-h-[44px] px-3.5 rounded-xl border font-semibold text-sm flex items-center gap-1.5 transition cursor-pointer ${
              isMuted
                ? "border-slate-700 bg-slate-900 text-slate-400"
                : "border-emerald-500/40 bg-emerald-950/40 text-emerald-200 hover:bg-emerald-900/40"
            }`}
          >
            <span>{isMuted ? "🔇" : "🔊"}</span>
            <span>{isMuted ? "Muted" : "Audio"}</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 min-h-0 flex flex-col overflow-hidden">{children}</main>
    </div>
  );
}
