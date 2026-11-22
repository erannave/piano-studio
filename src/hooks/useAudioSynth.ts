import { useCallback, useEffect, useRef, useState } from "react";
import { SplendidGrandPiano } from "smplr";
import { useAppStore } from "../store/appStore.ts";

export type AudioEngineMode = "synth" | "loading" | "sampled";

function midiToFreq(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

/**
 * Shared singleton AudioContext + sampled Grand Piano (smplr) so samples load once
 * across Stage transitions (Calibration <-> Library <-> Player) and never re-download.
 */
let sharedCtx: AudioContext | null = null;
let sharedPiano: SplendidGrandPiano | null = null;
let sharedPianoReady = false;
let sharedPianoLoading = false;
let sharedPianoFailed = false;
const statusListeners = new Set<(mode: AudioEngineMode) => void>();

function notifyStatus(mode: AudioEngineMode) {
  for (const fn of statusListeners) fn(mode);
}

function getSharedContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!sharedCtx) {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    sharedCtx = new AudioCtx();
  }
  if (sharedCtx.state === "suspended") {
    sharedCtx.resume().catch(() => {});
  }
  return sharedCtx;
}

function ensureSampledPiano(): void {
  if (sharedPianoReady || sharedPianoLoading || sharedPianoFailed) return;
  const ctx = getSharedContext();
  if (!ctx) return;

  sharedPianoLoading = true;
  notifyStatus("loading");

  try {
    const piano = new SplendidGrandPiano(ctx, { decayTime: 0.45 });
    sharedPiano = piano;
    piano.load
      .then(() => {
        sharedPianoReady = true;
        sharedPianoLoading = false;
        notifyStatus("sampled");
      })
      .catch(() => {
        sharedPianoFailed = true;
        sharedPianoLoading = false;
        sharedPiano = null;
        notifyStatus("synth");
      });
  } catch {
    sharedPianoFailed = true;
    sharedPianoLoading = false;
    sharedPiano = null;
    notifyStatus("synth");
  }
}

/**
 * Sampled Grand Piano (via smplr SplendidGrandPiano) with automatic fallback
 * to a lightweight Web Audio oscillator synth while loading or offline,
 * plus sustain pedal (CC64) and metronome/count-in click support.
 */
export function useAudioSynth() {
  const activeOscRef = useRef<Set<OscillatorNode>>(new Set());
  const activeSampleStopsRef = useRef<Set<() => void>>(new Set());
  const liveNotesRef = useRef<Map<number, () => void>>(new Map());
  const sustainedReleasesRef = useRef<Set<number>>(new Set());
  const sustainDownRef = useRef(false);

  const [engineMode, setEngineMode] = useState<AudioEngineMode>(() =>
    sharedPianoReady ? "sampled" : sharedPianoLoading ? "loading" : "synth",
  );

  useEffect(() => {
    statusListeners.add(setEngineMode);
    return () => {
      statusListeners.delete(setEngineMode);
    };
  }, []);

  const unlockAudio = useCallback(() => {
    const ctx = getSharedContext();
    if (ctx) {
      ensureSampledPiano();
    }
    return ctx;
  }, []);

  const playOscillatorNote = useCallback(
    (ctx: AudioContext, midi: number, durationSec: number, velocity: number, volume: number) => {
      const now = ctx.currentTime;
      const freq = midiToFreq(midi);
      const gainPeak = Math.min(0.28, Math.max(0.03, velocity * 0.22 * volume));
      const holdDur = Math.max(0.08, Math.min(4.0, durationSec));
      const releaseDur = 0.25;

      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(Math.min(5500, freq * 6), now);
      filter.frequency.exponentialRampToValueAtTime(
        Math.max(400, freq * 2.2),
        now + holdDur + releaseDur,
      );

      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, now);
      env.gain.linearRampToValueAtTime(gainPeak, now + 0.012);
      env.gain.exponentialRampToValueAtTime(gainPeak * 0.45, now + Math.min(0.35, holdDur));
      env.gain.setValueAtTime(gainPeak * 0.4, now + holdDur);
      env.gain.exponentialRampToValueAtTime(0.0001, now + holdDur + releaseDur);

      const osc1 = ctx.createOscillator();
      osc1.type = "triangle";
      osc1.frequency.setValueAtTime(freq, now);

      const osc2 = ctx.createOscillator();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(freq * 2, now);
      const harmonicGain = ctx.createGain();
      harmonicGain.gain.setValueAtTime(0.22, now);

      osc1.connect(filter);
      osc2.connect(harmonicGain);
      harmonicGain.connect(filter);
      filter.connect(env);
      env.connect(ctx.destination);

      activeOscRef.current.add(osc1);
      activeOscRef.current.add(osc2);

      const stopAt = now + holdDur + releaseDur + 0.04;
      osc1.start(now);
      osc2.start(now);
      osc1.stop(stopAt);
      osc2.stop(stopAt);

      const cleanup = () => {
        try {
          osc1.stop();
          osc2.stop();
        } catch {
          // already stopped
        }
      };

      osc1.onended = () => {
        activeOscRef.current.delete(osc1);
        osc1.disconnect();
        filter.disconnect();
        env.disconnect();
      };
      osc2.onended = () => {
        activeOscRef.current.delete(osc2);
        osc2.disconnect();
        harmonicGain.disconnect();
      };

      return cleanup;
    },
    [],
  );

  const playNote = useCallback(
    (midi: number, durationSec: number, velocity = 0.75) => {
      const { isMuted, volume } = useAppStore.getState();
      if (isMuted || volume <= 0.001) return;

      const ctx = unlockAudio();
      if (!ctx) return;

      const clampedDur = Math.max(0.08, Math.min(5.0, durationSec));
      if (sharedPiano && sharedPianoReady) {
        const midiVel = Math.max(12, Math.min(127, Math.round(velocity * volume * 115)));
        const stopFn = sharedPiano.start({
          note: midi,
          velocity: midiVel,
          duration: clampedDur,
        });
        activeSampleStopsRef.current.add(stopFn);
        setTimeout(
          () => {
            activeSampleStopsRef.current.delete(stopFn);
          },
          (clampedDur + 0.6) * 1000,
        );
        return;
      }

      playOscillatorNote(ctx, midi, clampedDur, velocity, volume);
    },
    [unlockAudio, playOscillatorNote],
  );

  /** Interactive noteOn for on-screen keyboard clicks or MIDI monitoring */
  const noteOn = useCallback(
    (midi: number, velocity = 0.78) => {
      const { isMuted, volume } = useAppStore.getState();
      if (isMuted || volume <= 0.001) return;

      const ctx = unlockAudio();
      if (!ctx) return;

      // Stop any existing voice on this pitch
      const prevStop = liveNotesRef.current.get(midi);
      if (prevStop) {
        prevStop();
        liveNotesRef.current.delete(midi);
      }
      sustainedReleasesRef.current.delete(midi);

      if (sharedPiano && sharedPianoReady) {
        const midiVel = Math.max(15, Math.min(127, Math.round(velocity * volume * 120)));
        const stopFn = sharedPiano.start({ note: midi, velocity: midiVel });
        liveNotesRef.current.set(midi, stopFn);
      } else {
        const stopFn = playOscillatorNote(ctx, midi, 3.0, velocity, volume);
        liveNotesRef.current.set(midi, stopFn);
      }
    },
    [unlockAudio, playOscillatorNote],
  );

  const noteOff = useCallback((midi: number) => {
    if (sustainDownRef.current) {
      sustainedReleasesRef.current.add(midi);
      return;
    }
    const stopFn = liveNotesRef.current.get(midi);
    if (stopFn) {
      stopFn();
      liveNotesRef.current.delete(midi);
    }
  }, []);

  const setSustain = useCallback((down: boolean) => {
    sustainDownRef.current = down;
    if (!down) {
      for (const midi of sustainedReleasesRef.current) {
        const stopFn = liveNotesRef.current.get(midi);
        if (stopFn) {
          stopFn();
          liveNotesRef.current.delete(midi);
        }
      }
      sustainedReleasesRef.current.clear();
    }
  }, []);

  /** Crisp Web Audio woodblock click for Metronome & Count-In */
  const playMetronomeClick = useCallback((accent: boolean) => {
    const { isMuted, volume } = useAppStore.getState();
    if (isMuted || volume <= 0.001) return;
    const ctx = getSharedContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(accent ? 1280 : 880, now);
    osc.frequency.exponentialRampToValueAtTime(accent ? 760 : 520, now + 0.04);

    const peak = Math.min(0.35, (accent ? 0.28 : 0.16) * Math.max(0.35, volume));
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(peak, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.055);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.06);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }, []);

  const stopAll = useCallback(() => {
    for (const stopFn of activeSampleStopsRef.current) {
      try {
        stopFn();
      } catch {
        // ignore
      }
    }
    activeSampleStopsRef.current.clear();

    for (const osc of activeOscRef.current) {
      try {
        osc.stop();
      } catch {
        // already stopped
      }
    }
    activeOscRef.current.clear();
  }, []);

  useEffect(() => {
    return () => {
      stopAll();
      for (const stopFn of liveNotesRef.current.values()) {
        try {
          stopFn();
        } catch {
          // ignore
        }
      }
      liveNotesRef.current.clear();
      sustainedReleasesRef.current.clear();
    };
  }, [stopAll]);

  return {
    playNote,
    noteOn,
    noteOff,
    setSustain,
    playMetronomeClick,
    stopAll,
    unlockAudio,
    engineMode,
  };
}
