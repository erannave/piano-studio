import { useCallback, useEffect, useRef } from "react";
import { useAppStore } from "../store/appStore.ts";

function midiToFreq(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

/**
 * Lightweight Web Audio API piano-like synthesizer for song playback.
 * Uses a fundamental triangle + soft 2nd harmonic sine through a gentle low-pass filter.
 */
export function useAudioSynth() {
  const ctxRef = useRef<AudioContext | null>(null);
  const activeNodesRef = useRef<Set<OscillatorNode>>(new Set());

  const ensureContext = useCallback((): AudioContext | null => {
    if (typeof window === "undefined") return null;
    if (!ctxRef.current) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      ctxRef.current = new AudioCtx();
    }
    if (ctxRef.current.state === "suspended") {
      ctxRef.current.resume().catch(() => {});
    }
    return ctxRef.current;
  }, []);

  const playNote = useCallback(
    (midi: number, durationSec: number, velocity = 0.75) => {
      const { isMuted, volume } = useAppStore.getState();
      if (isMuted || volume <= 0.001) return;

      const ctx = ensureContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      const freq = midiToFreq(midi);
      const gainPeak = Math.min(0.28, Math.max(0.03, velocity * 0.22 * volume));
      const holdDur = Math.max(0.08, Math.min(4.0, durationSec));
      const releaseDur = 0.25;

      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(Math.min(5500, freq * 6), now);
      filter.frequency.exponentialRampToValueAtTime(Math.max(400, freq * 2.2), now + holdDur + releaseDur);

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

      activeNodesRef.current.add(osc1);
      activeNodesRef.current.add(osc2);

      const stopAt = now + holdDur + releaseDur + 0.04;
      osc1.start(now);
      osc2.start(now);
      osc1.stop(stopAt);
      osc2.stop(stopAt);

      osc1.onended = () => {
        activeNodesRef.current.delete(osc1);
        osc1.disconnect();
        filter.disconnect();
        env.disconnect();
      };
      osc2.onended = () => {
        activeNodesRef.current.delete(osc2);
        osc2.disconnect();
        harmonicGain.disconnect();
      };
    },
    [ensureContext]
  );

  const stopAll = useCallback(() => {
    for (const osc of activeNodesRef.current) {
      try {
        osc.stop();
      } catch {
        // already stopped
      }
    }
    activeNodesRef.current.clear();
  }, []);

  useEffect(() => {
    return () => {
      stopAll();
      if (ctxRef.current) {
        ctxRef.current.close().catch(() => {});
        ctxRef.current = null;
      }
    };
  }, [stopAll]);

  return { playNote, stopAll, unlockAudio: ensureContext };
}
