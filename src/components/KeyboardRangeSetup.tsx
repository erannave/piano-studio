import { useEffect, useState } from "react";
import { midiToNoteName, PIANO_MAX_NOTE, PIANO_MIN_NOTE } from "../shared/keyboardRange.ts";
import { subscribeMidiEvents, useAppStore } from "../store/appStore.ts";
import { PianoKeyboard } from "./PianoKeyboard.tsx";

const KEYBOARD_PRESETS = [
  { label: "88 Keys (Full Piano)", min: 21, max: 108 },
  { label: "76 Keys", min: 28, max: 103 },
  { label: "61 Keys", min: 36, max: 96 },
  { label: "49 Keys", min: 36, max: 84 },
] as const;

export function KeyboardRangeSetup() {
  const profile = useAppStore((s) => s.profile);
  const midiStatus = useAppStore((s) => s.midiStatus);
  const activeUserNotes = useAppStore((s) => s.activeUserNotes);
  const saveKeyboardRange = useAppStore((s) => s.saveKeyboardRange);

  const [step, setStep] = useState<"low" | "high" | "confirm">("low");
  const [lowNote, setLowNote] = useState<number | null>(null);
  const [highNote, setHighNote] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    return subscribeMidiEvents((event) => {
      if (event.type !== "noteOn" || event.velocity <= 0) return;

      if (step === "low") {
        setLowNote(event.midi);
        setStep("high");
      } else if (step === "high") {
        setHighNote(event.midi);
        setStep("confirm");
      }
    });
  }, [step]);

  const handleConfirmDetected = async () => {
    if (lowNote === null || highNote === null) return;
    setSaving(true);
    try {
      const min = Math.min(lowNote, highNote);
      const max = Math.max(lowNote, highNote);
      await saveKeyboardRange(min, max, true);
    } finally {
      setSaving(false);
    }
  };

  const handlePreset = async (min: number, max: number) => {
    setSaving(true);
    try {
      await saveKeyboardRange(min, max, true);
    } finally {
      setSaving(false);
    }
  };

  const resetCapture = () => {
    setLowNote(null);
    setHighNote(null);
    setStep("low");
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col justify-between">
      <div className="flex-1 min-h-0 overflow-y-auto px-8 py-6 flex flex-col items-center justify-center">
        <div className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-3xl p-7 shadow-2xl">
          <div className="flex items-start justify-between gap-6 mb-6">
            <div>
              <span className="inline-block px-3 py-1 rounded-full bg-violet-500/20 border border-violet-400/30 text-violet-200 text-xs font-bold uppercase tracking-wider mb-2">
                Step 1 · Keyboard Range Setup
              </span>
              <h2 className="text-3xl font-bold text-white">Calibrate Your Physical Keyboard</h2>
              <p className="text-slate-300 text-lg mt-1.5">
                Press the lowest and highest keys on your MIDI keyboard so we hide unavailable keys
                and adapt songs to fit your instrument.
              </p>
            </div>
            {profile.keyboardRange.calibrated && (
              <div className="text-right shrink-0">
                <div className="text-xs text-slate-400 uppercase tracking-wider">Current Range</div>
                <div className="text-lg font-mono font-bold text-violet-300">
                  {midiToNoteName(profile.keyboardRange.minNote)} –{" "}
                  {midiToNoteName(profile.keyboardRange.maxNote)}
                </div>
              </div>
            )}
          </div>

          {/* Interactive MIDI detection cards */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div
              className={`rounded-2xl p-5 border-2 transition ${
                step === "low"
                  ? "border-violet-400 bg-violet-950/40"
                  : lowNote !== null
                    ? "border-emerald-500/50 bg-emerald-950/30"
                    : "border-slate-800 bg-slate-950/60"
              }`}
            >
              <div className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
                1. Lowest Key
              </div>
              <div className="text-3xl font-bold font-mono text-white mt-2">
                {lowNote !== null
                  ? midiToNoteName(lowNote)
                  : step === "low"
                    ? "Press lowest key…"
                    : "—"}
              </div>
              <div className="text-sm text-slate-400 mt-1">
                {midiStatus === "connected"
                  ? "Play the leftmost key on your piano"
                  : "Connect a MIDI keyboard, or pick a preset below"}
              </div>
            </div>

            <div
              className={`rounded-2xl p-5 border-2 transition ${
                step === "high"
                  ? "border-violet-400 bg-violet-950/40"
                  : highNote !== null
                    ? "border-emerald-500/50 bg-emerald-950/30"
                    : "border-slate-800 bg-slate-950/60"
              }`}
            >
              <div className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
                2. Highest Key
              </div>
              <div className="text-3xl font-bold font-mono text-white mt-2">
                {highNote !== null
                  ? midiToNoteName(highNote)
                  : step === "high"
                    ? "Press highest key…"
                    : "Waiting…"}
              </div>
              <div className="text-sm text-slate-400 mt-1">
                Play the rightmost key on your piano
              </div>
            </div>
          </div>

          {step === "confirm" && lowNote !== null && highNote !== null && (
            <div className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-emerald-950/40 border border-emerald-500/40 mb-6">
              <div className="text-base text-emerald-100">
                Detected{" "}
                <strong className="font-mono">
                  {midiToNoteName(Math.min(lowNote, highNote))} –{" "}
                  {midiToNoteName(Math.max(lowNote, highNote))}
                </strong>{" "}
                ({Math.abs(highNote - lowNote) + 1} keys)
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={resetCapture}
                  className="min-h-[44px] px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold cursor-pointer"
                >
                  Retry
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleConfirmDetected}
                  className="min-h-[44px] px-6 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold cursor-pointer disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save Keyboard Range"}
                </button>
              </div>
            </div>
          )}

          {/* Quick presets for testing without hardware or standard keyboards */}
          <div className="border-t border-slate-800 pt-5">
            <div className="text-sm font-semibold text-slate-400 mb-3">
              Or choose a standard keyboard size directly:
            </div>
            <div className="grid grid-cols-4 gap-3">
              {KEYBOARD_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  disabled={saving}
                  onClick={() => handlePreset(preset.min, preset.max)}
                  className="min-h-[52px] px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 active:bg-slate-600 border border-slate-700 text-left transition cursor-pointer disabled:opacity-50"
                >
                  <div className="text-sm font-bold text-white">{preset.label}</div>
                  <div className="text-xs font-mono text-slate-400">
                    {midiToNoteName(preset.min)} – {midiToNoteName(preset.max)}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Full 88-key reference preview during hardware range calibration */}
      <PianoKeyboard
        minNote={PIANO_MIN_NOTE}
        maxNote={PIANO_MAX_NOTE}
        activeUserNotes={activeUserNotes}
        activeSongNotes={new Set()}
        highlightRange={{ low: lowNote, high: highNote }}
        heightClass="h-36"
      />
    </div>
  );
}
