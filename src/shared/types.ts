export type Stage = "calibration" | "library" | "player";

export type Hand = "right" | "left";
export type PracticeHandMode = "both" | "right" | "left";
export type PlayerViewMode = "score" | "piano-roll";

export interface MidiDeviceInfo {
  id: string;
  name: string;
}

export interface KeyboardRange {
  minNote: number;
  maxNote: number;
  calibrated: boolean;
}

export interface LearnerProfile {
  skillLevel: number | null;
  feedback: string | null;
  feedbackSource: "ai" | "local" | null;
  keyboardRange: KeyboardRange;
  calibratedAt: string | null;
  updatedAt: string;
}

export interface SongNote {
  midi: number;
  time: number; // seconds
  duration: number; // seconds
  velocity: number; // 0..1
  track: number;
  hand: Hand;
}

export interface SongMeasure {
  number: number; // 1-based display number
  time: number; // start time in seconds
  duration: number; // seconds
  beats: number; // time signature numerator
  beatType: number; // time signature denominator
}

export interface SongMetadata {
  id: string;
  title: string;
  composer: string;
  difficultyLevel: number; // 1..10
  midiFile: string; // URL path under /songs/...
  durationSec: number;
  minNote: number;
  maxNote: number;
  bpm: number;
  isCalibrationPiece?: boolean;
  calibrationOrder?: number;
  description?: string;
  workTitle?: string;
  workNumber?: string;
  movementNumber?: string;
  source?: string;
  license?: string;
  keySignatureFifths?: number;
  timeSignature?: { numerator: number; denominator: number };
}

export interface FittedSong extends SongMetadata {
  transposeSemitones: number;
  fittedMinNote: number;
  fittedMaxNote: number;
}

export interface ParsedSong {
  metadata: FittedSong;
  notes: SongNote[];
  measures: SongMeasure[];
  durationSec: number;
  bpm: number;
  keySignatureFifths: number;
  timeSignature: { numerator: number; denominator: number };
}

export interface MidiEventRecord {
  type: "noteOn" | "noteOff";
  midi: number;
  velocity: number; // 0..127
  timestampMs: number;
}

export interface ExpectedNote {
  midi: number;
  timeMs: number;
  durationMs: number;
}

export interface CalibrationPieceAttempt {
  songId: string;
  title: string;
  difficultyLevel: number;
  skipped: boolean;
  expectedNotes: ExpectedNote[];
  recordedEvents: MidiEventRecord[];
}

export interface PieceScoreSummary {
  songId: string;
  title: string;
  difficultyLevel: number;
  skipped: boolean;
  expectedCount: number;
  matchedCount: number;
  playedCount: number;
  pitchAccuracy: number; // 0..1
  completionRate: number; // 0..1
  avgTimingErrorMs: number;
  velocitySpread: number; // 0..1
  compositeScore: number; // 0..1
}

export interface CalibrationResult {
  skillLevel: number;
  feedback: string;
  feedbackSource: "ai" | "local";
  pieceSummaries: PieceScoreSummary[];
  calibratedAt: string;
}

export interface ActiveNoteState {
  userNotes: ReadonlySet<number>;
  songNotes: ReadonlySet<number>;
}

export interface KeyGeometry {
  midi: number;
  name: string;
  isBlack: boolean;
  x: number; // normalized 0..1
  width: number; // normalized 0..1
}
