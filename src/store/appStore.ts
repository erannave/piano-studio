import { create } from "zustand";
import { loadParsedSong } from "../shared/midiLoader.ts";
import { PIANO_MAX_NOTE, PIANO_MIN_NOTE } from "../shared/keyboardRange.ts";
import type {
  CalibrationPieceAttempt,
  CalibrationResult,
  FittedSong,
  LearnerProfile,
  MidiEventRecord,
  ParsedSong,
  SongMetadata,
  Stage,
} from "../shared/types.ts";

export type MidiStatus = "initializing" | "connected" | "no-devices" | "unsupported" | "denied";
export type CalibrationSubStep = "keyboard-range" | "skill";

type MidiListener = (event: MidiEventRecord) => void;
const midiListeners = new Set<MidiListener>();

let levelWriteSeq = 0;
let calibrationAbortController: AbortController | null = null;

export class CalibrationSupersededError extends Error {
  constructor() {
    super("Calibration superseded by a newer Skill Level update");
    this.name = "CalibrationSupersededError";
  }
}

export function subscribeMidiEvents(listener: MidiListener): () => void {
  midiListeners.add(listener);
  return () => {
    midiListeners.delete(listener);
  };
}

interface AppState {
  // MIDI
  midiStatus: MidiStatus;
  connectedDeviceName: string | null;
  midiDevices: string[];
  activeUserNotes: Set<number>;

  // Persisted Learner Profile
  profile: LearnerProfile;
  profileLoaded: boolean;
  lastCalibrationResult: CalibrationResult | null;

  // Navigation
  currentStage: Stage;
  calibrationSubStep: CalibrationSubStep;

  // Song Catalog & Player
  songs: SongMetadata[];
  songsLoading: boolean;
  currentSong: ParsedSong | null;
  songLoading: boolean;
  activeSongNotes: Set<number>;
  isPlaying: boolean;
  tempo: number; // 0.5 .. 1.25

  // Audio Synth
  isMuted: boolean;
  volume: number; // 0 .. 1

  // Actions
  setMidiStatus: (status: MidiStatus, devices: string[]) => void;
  handleMidiNoteOn: (midi: number, velocity: number) => void;
  handleMidiNoteOff: (midi: number) => void;
  clearActiveUserNotes: () => void;

  bootstrap: () => Promise<void>;
  setStage: (stage: Stage) => void;
  openCalibration: (subStep: CalibrationSubStep) => void;
  saveKeyboardRange: (minNote: number, maxNote: number, calibrated?: boolean) => Promise<void>;
  setManualSkillLevel: (level: number) => Promise<void>;
  submitCalibration: (attempts: CalibrationPieceAttempt[]) => Promise<CalibrationResult>;

  selectSong: (song: FittedSong) => Promise<void>;
  clearCurrentSong: () => void;
  setActiveSongNotes: (notes: Set<number>) => void;
  setIsPlaying: (playing: boolean) => void;
  setTempo: (tempo: number) => void;
  toggleMute: () => void;
  setVolume: (volume: number) => void;
}

const DEFAULT_PROFILE: LearnerProfile = {
  skillLevel: null,
  feedback: null,
  feedbackSource: null,
  keyboardRange: { minNote: PIANO_MIN_NOTE, maxNote: PIANO_MAX_NOTE, calibrated: false },
  calibratedAt: null,
  updatedAt: new Date(0).toISOString(),
};

export const useAppStore = create<AppState>((set, get) => ({
  midiStatus: "initializing",
  connectedDeviceName: null,
  midiDevices: [],
  activeUserNotes: new Set<number>(),

  profile: DEFAULT_PROFILE,
  profileLoaded: false,
  lastCalibrationResult: null,

  currentStage: "calibration",
  calibrationSubStep: "keyboard-range",

  songs: [],
  songsLoading: false,
  currentSong: null,
  songLoading: false,
  activeSongNotes: new Set<number>(),
  isPlaying: false,
  tempo: 1,

  isMuted: false,
  volume: 0.75,

  setMidiStatus: (status, devices) =>
    set({
      midiStatus: status,
      midiDevices: devices,
      connectedDeviceName: devices[0] ?? null,
    }),

  handleMidiNoteOn: (midi, velocity) => {
    const next = new Set(get().activeUserNotes);
    next.add(midi);
    set({ activeUserNotes: next });

    const event: MidiEventRecord = {
      type: "noteOn",
      midi,
      velocity,
      timestampMs: performance.now(),
    };
    for (const listener of midiListeners) listener(event);
  },

  handleMidiNoteOff: (midi) => {
    const next = new Set(get().activeUserNotes);
    next.delete(midi);
    set({ activeUserNotes: next });

    const event: MidiEventRecord = {
      type: "noteOff",
      midi,
      velocity: 0,
      timestampMs: performance.now(),
    };
    for (const listener of midiListeners) listener(event);
  },

  clearActiveUserNotes: () => set({ activeUserNotes: new Set<number>() }),

  bootstrap: async () => {
    set({ songsLoading: true });
    try {
      const [profileRes, songsRes] = await Promise.all([fetch("/api/profile"), fetch("/api/songs")]);
      const profile = profileRes.ok ? ((await profileRes.json()) as LearnerProfile) : DEFAULT_PROFILE;
      const songs = songsRes.ok ? ((await songsRes.json()) as SongMetadata[]) : [];

      let currentStage: Stage = "library";
      let calibrationSubStep: CalibrationSubStep = "skill";

      if (!profile.keyboardRange.calibrated) {
        currentStage = "calibration";
        calibrationSubStep = "keyboard-range";
      } else if (profile.skillLevel === null) {
        currentStage = "calibration";
        calibrationSubStep = "skill";
      }

      set({
        profile,
        profileLoaded: true,
        songs,
        songsLoading: false,
        currentStage,
        calibrationSubStep,
      });
    } catch (err) {
      console.error("Bootstrap error:", err);
      set({ profileLoaded: true, songsLoading: false });
    }
  },

  setStage: (stage) => {
    if (stage !== "player") {
      set({ currentStage: stage, isPlaying: false, activeSongNotes: new Set<number>() });
    } else {
      set({ currentStage: stage });
    }
  },

  openCalibration: (subStep) =>
    set({
      currentStage: "calibration",
      calibrationSubStep: subStep,
      isPlaying: false,
      activeSongNotes: new Set<number>(),
      lastCalibrationResult: null,
    }),

  saveKeyboardRange: async (minNote, maxNote, calibrated = true) => {
    const res = await fetch("/api/profile/keyboard-range", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ minNote, maxNote, calibrated }),
    });
    if (!res.ok) throw new Error("Failed to save keyboard range");
    const profile = (await res.json()) as LearnerProfile;
    const nextStage: Stage = profile.skillLevel === null ? "calibration" : "library";
    set({
      profile,
      currentStage: nextStage,
      calibrationSubStep: "skill",
    });
  },

  setManualSkillLevel: async (level) => {
    const seq = ++levelWriteSeq;
    calibrationAbortController?.abort();
    calibrationAbortController = null;

    const res = await fetch("/api/profile/level", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ skillLevel: level }),
    });
    if (!res.ok) throw new Error("Failed to update skill level");
    const profile = (await res.json()) as LearnerProfile;
    if (seq === levelWriteSeq) {
      set({ profile });
    }
  },

  submitCalibration: async (attempts) => {
    const seq = ++levelWriteSeq;
    calibrationAbortController?.abort();
    const controller = new AbortController();
    calibrationAbortController = controller;

    try {
      const res = await fetch("/api/calibration/evaluate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ attempts }),
        signal: controller.signal,
      });
      if (controller.signal.aborted || seq !== levelWriteSeq || res.status === 409) {
        throw new CalibrationSupersededError();
      }
      if (!res.ok) throw new Error("Failed to evaluate calibration");
      const data = (await res.json()) as { result: CalibrationResult; profile: LearnerProfile };
      if (controller.signal.aborted || seq !== levelWriteSeq) {
        throw new CalibrationSupersededError();
      }
      set({
        profile: data.profile,
        lastCalibrationResult: data.result,
      });
      return data.result;
    } catch (err) {
      if (controller.signal.aborted || seq !== levelWriteSeq) {
        throw new CalibrationSupersededError();
      }
      throw err;
    } finally {
      if (calibrationAbortController === controller) {
        calibrationAbortController = null;
      }
    }
  },

  selectSong: async (song) => {
    set({ songLoading: true, isPlaying: false, activeSongNotes: new Set<number>() });
    try {
      const parsed = await loadParsedSong(song);
      set({
        currentSong: parsed,
        songLoading: false,
        currentStage: "player",
        tempo: 1,
      });
    } catch (err) {
      console.error("Failed to load song:", err);
      set({ songLoading: false });
      throw err;
    }
  },

  clearCurrentSong: () =>
    set({
      currentSong: null,
      isPlaying: false,
      activeSongNotes: new Set<number>(),
      currentStage: "library",
    }),

  setActiveSongNotes: (notes) => set({ activeSongNotes: notes }),
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  setTempo: (tempo) => set({ tempo: Math.max(0.5, Math.min(1.25, tempo)) }),
  toggleMute: () => set((s) => ({ isMuted: !s.isMuted })),
  setVolume: (volume) => set({ volume: Math.max(0, Math.min(1, volume)) }),
}));
