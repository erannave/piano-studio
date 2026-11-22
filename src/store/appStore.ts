import { create } from "zustand";
import { PIANO_MAX_NOTE, PIANO_MIN_NOTE } from "../shared/keyboardRange.ts";
import { loadParsedSong } from "../shared/midiLoader.ts";
import type {
  CalibrationPieceAttempt,
  CalibrationResult,
  FittedSong,
  LearnerProfile,
  MidiDeviceInfo,
  MidiEventRecord,
  ParsedSong,
  PlayerViewMode,
  PracticeHandMode,
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
  midiDevices: MidiDeviceInfo[];
  selectedMidiDeviceId: string | null; // null = all connected devices
  activeUserNotes: Set<number>;
  physicalUserNotes: Set<number>;
  sustainPedalDown: boolean;

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
  tempo: number; // 0.25 .. 1.5

  // Tier 1 Practice & View Settings
  viewMode: PlayerViewMode; // default "score"
  showNoteNames: boolean;
  waitMode: boolean;
  practiceHand: PracticeHandMode;
  muteOtherHand: boolean;
  metronomeEnabled: boolean;
  countInEnabled: boolean;

  // Audio Synth
  isMuted: boolean;
  volume: number; // 0 .. 1

  // Actions
  setMidiStatus: (status: MidiStatus, devices: MidiDeviceInfo[]) => void;
  setSelectedMidiDeviceId: (deviceId: string | null) => void;
  handleMidiNoteOn: (midi: number, velocity: number) => void;
  handleMidiNoteOff: (midi: number) => void;
  setSustainPedal: (down: boolean) => void;
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
  setViewMode: (mode: PlayerViewMode) => void;
  setShowNoteNames: (show: boolean) => void;
  setWaitMode: (enabled: boolean) => void;
  setPracticeHand: (hand: PracticeHandMode) => void;
  setMuteOtherHand: (muted: boolean) => void;
  setMetronomeEnabled: (enabled: boolean) => void;
  setCountInEnabled: (enabled: boolean) => void;
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
  selectedMidiDeviceId: null,
  activeUserNotes: new Set<number>(),
  physicalUserNotes: new Set<number>(),
  sustainPedalDown: false,

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

  viewMode: "score",
  showNoteNames: false,
  waitMode: false,
  practiceHand: "both",
  muteOtherHand: false,
  metronomeEnabled: false,
  countInEnabled: true,

  isMuted: false,
  volume: 0.75,

  setMidiStatus: (status, devices) => {
    const currentSelected = get().selectedMidiDeviceId;
    const stillPresent = currentSelected && devices.some((d) => d.id === currentSelected);
    const nextSelected = stillPresent ? currentSelected : null;
    const activeDevice = nextSelected ? devices.find((d) => d.id === nextSelected) : devices[0];

    set({
      midiStatus: status,
      midiDevices: devices,
      selectedMidiDeviceId: nextSelected,
      connectedDeviceName: activeDevice?.name ?? null,
    });
  },

  setSelectedMidiDeviceId: (deviceId) => {
    const devices = get().midiDevices;
    const chosen = deviceId ? devices.find((d) => d.id === deviceId) : devices[0];
    set({
      selectedMidiDeviceId: deviceId,
      connectedDeviceName: chosen?.name ?? null,
      activeUserNotes: new Set<number>(),
      physicalUserNotes: new Set<number>(),
      sustainPedalDown: false,
    });
  },

  handleMidiNoteOn: (midi, velocity) => {
    const nextPhysical = new Set(get().physicalUserNotes);
    nextPhysical.add(midi);
    const nextActive = new Set(get().activeUserNotes);
    nextActive.add(midi);
    set({ physicalUserNotes: nextPhysical, activeUserNotes: nextActive });

    const event: MidiEventRecord = {
      type: "noteOn",
      midi,
      velocity,
      timestampMs: performance.now(),
    };
    for (const listener of midiListeners) listener(event);
  },

  handleMidiNoteOff: (midi) => {
    const nextPhysical = new Set(get().physicalUserNotes);
    nextPhysical.delete(midi);

    if (get().sustainPedalDown) {
      // Keep note visually/musically active while sustain pedal is held
      set({ physicalUserNotes: nextPhysical });
    } else {
      const nextActive = new Set(get().activeUserNotes);
      nextActive.delete(midi);
      set({ physicalUserNotes: nextPhysical, activeUserNotes: nextActive });
    }

    const event: MidiEventRecord = {
      type: "noteOff",
      midi,
      velocity: 0,
      timestampMs: performance.now(),
    };
    for (const listener of midiListeners) listener(event);
  },

  setSustainPedal: (down) => {
    if (down) {
      set({ sustainPedalDown: true });
    } else {
      // Release any sustained notes that are no longer physically held
      const physical = new Set(get().physicalUserNotes);
      set({ sustainPedalDown: false, activeUserNotes: physical });
    }
  },

  clearActiveUserNotes: () =>
    set({
      activeUserNotes: new Set<number>(),
      physicalUserNotes: new Set<number>(),
      sustainPedalDown: false,
    }),

  bootstrap: async () => {
    set({ songsLoading: true });
    try {
      const [profileRes, songsRes] = await Promise.all([
        fetch("/api/profile"),
        fetch("/api/songs"),
      ]);
      const profile = profileRes.ok
        ? ((await profileRes.json()) as LearnerProfile)
        : DEFAULT_PROFILE;
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
  setTempo: (tempo) => set({ tempo: Math.max(0.25, Math.min(1.5, tempo)) }),
  setViewMode: (viewMode) => set({ viewMode }),
  setShowNoteNames: (showNoteNames) => set({ showNoteNames }),
  setWaitMode: (waitMode) => set({ waitMode }),
  setPracticeHand: (practiceHand) => set({ practiceHand }),
  setMuteOtherHand: (muteOtherHand) => set({ muteOtherHand }),
  setMetronomeEnabled: (metronomeEnabled) => set({ metronomeEnabled }),
  setCountInEnabled: (countInEnabled) => set({ countInEnabled }),
  toggleMute: () => set((s) => ({ isMuted: !s.isMuted })),
  setVolume: (volume) => set({ volume: Math.max(0, Math.min(1, volume)) }),
}));
