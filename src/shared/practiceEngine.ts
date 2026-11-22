import type { Hand, PracticeHandMode, SongMeasure, SongNote } from "./types.ts";

export interface WaitChordGroup {
  time: number;
  notes: SongNote[];
  requiredPitches: Set<number>;
  endIndex: number; // exclusive index in sorted notes array
}

export interface StaffNotePosition {
  /** Diatonic step offset relative to C4 (Middle C = 0, D4 = 1, B3 = -1, etc.) */
  diatonicFromC4: number;
  /** Accidental to draw if it differs from the active key signature */
  accidental: "sharp" | "flat" | "natural" | null;
  /** Clef assignment */
  clef: "treble" | "bass";
  /** Note letter name e.g. "C#4", "Bb3" */
  label: string;
}

const SHARP_SPELLINGS: Array<{ letter: number; acc: number; name: string }> = [
  { letter: 0, acc: 0, name: "C" },
  { letter: 0, acc: 1, name: "C#" },
  { letter: 1, acc: 0, name: "D" },
  { letter: 1, acc: 1, name: "D#" },
  { letter: 2, acc: 0, name: "E" },
  { letter: 3, acc: 0, name: "F" },
  { letter: 3, acc: 1, name: "F#" },
  { letter: 4, acc: 0, name: "G" },
  { letter: 4, acc: 1, name: "G#" },
  { letter: 5, acc: 0, name: "A" },
  { letter: 5, acc: 1, name: "A#" },
  { letter: 6, acc: 0, name: "B" },
];

const FLAT_SPELLINGS: Array<{ letter: number; acc: number; name: string }> = [
  { letter: 0, acc: 0, name: "C" },
  { letter: 1, acc: -1, name: "Db" },
  { letter: 1, acc: 0, name: "D" },
  { letter: 2, acc: -1, name: "Eb" },
  { letter: 2, acc: 0, name: "E" },
  { letter: 3, acc: 0, name: "F" },
  { letter: 4, acc: -1, name: "Gb" },
  { letter: 4, acc: 0, name: "G" },
  { letter: 5, acc: -1, name: "Ab" },
  { letter: 5, acc: 0, name: "A" },
  { letter: 6, acc: -1, name: "Bb" },
  { letter: 6, acc: 0, name: "B" },
];

// Order of sharps (F, C, G, D, A, E, B) as letter indices (C=0..B=6)
const SHARP_ORDER = [3, 0, 4, 1, 5, 2, 6];
// Order of flats (B, E, A, D, G, C, F)
const FLAT_ORDER = [6, 2, 5, 1, 4, 0, 3];

/**
 * Returns the default accidental (+1 sharp, -1 flat, 0 natural) for each diatonic letter (0=C..6=B)
 * under the given key signature fifths (-7..+7).
 */
export function getKeySignatureAlterations(fifths: number): number[] {
  const alts = [0, 0, 0, 0, 0, 0, 0];
  const clamped = Math.max(-7, Math.min(7, Math.round(fifths)));
  if (clamped > 0) {
    for (let i = 0; i < clamped; i++) {
      alts[SHARP_ORDER[i]!] = 1;
    }
  } else if (clamped < 0) {
    for (let i = 0; i < -clamped; i++) {
      alts[FLAT_ORDER[i]!] = -1;
    }
  }
  return alts;
}

/**
 * Converts a MIDI note number + hand + key signature into a diatonic grand-staff position
 * and accidental relative to the key signature.
 */
export function midiToStaffPosition(
  midi: number,
  hand: Hand,
  keySignatureFifths = 0,
): StaffNotePosition {
  const useFlats = keySignatureFifths < 0;
  const pc = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  const spelling = (useFlats ? FLAT_SPELLINGS : SHARP_SPELLINGS)[pc]!;
  const diatonicFromC4 = (octave - 4) * 7 + spelling.letter;
  const keyAlts = getKeySignatureAlterations(keySignatureFifths);
  const expectedAcc = keyAlts[spelling.letter] ?? 0;

  let accidental: "sharp" | "flat" | "natural" | null = null;
  if (spelling.acc !== expectedAcc) {
    if (spelling.acc === 1) accidental = "sharp";
    else if (spelling.acc === -1) accidental = "flat";
    else accidental = "natural";
  }

  return {
    diatonicFromC4,
    accidental,
    clef: hand === "left" ? "bass" : "treble",
    label: `${spelling.name}${octave}`,
  };
}

/**
 * Determines whether a note belongs to the hand(s) the learner is currently practicing.
 */
export function isPracticedHand(hand: Hand, mode: PracticeHandMode): boolean {
  if (mode === "both") return true;
  return hand === mode;
}

/**
 * Finds the next group of simultaneous (chord) target notes for Wait Mode starting at `startIndex`.
 * Notes within `chordWindowSec` (default 45ms) are grouped together as one chord.
 */
export function findNextWaitGroup(
  notes: SongNote[],
  startIndex: number,
  practiceHand: PracticeHandMode,
  chordWindowSec = 0.045,
): WaitChordGroup | null {
  let idx = startIndex;
  while (idx < notes.length && !isPracticedHand(notes[idx]!.hand, practiceHand)) {
    idx++;
  }
  if (idx >= notes.length) return null;

  const first = notes[idx]!;
  const groupTime = first.time;
  const groupNotes: SongNote[] = [first];
  const requiredPitches = new Set<number>([first.midi]);
  idx++;

  while (idx < notes.length) {
    const candidate = notes[idx]!;
    if (candidate.time - groupTime > chordWindowSec) break;
    if (isPracticedHand(candidate.hand, practiceHand)) {
      groupNotes.push(candidate);
      requiredPitches.add(candidate.midi);
    }
    idx++;
  }

  return {
    time: groupTime,
    notes: groupNotes,
    requiredPitches,
    endIndex: idx,
  };
}

/**
 * Checks whether all required pitches in a Wait Mode chord group have been pressed.
 */
export function isWaitGroupSatisfied(
  requiredPitches: ReadonlySet<number>,
  pressedNotes: ReadonlySet<number>,
): boolean {
  for (const pitch of requiredPitches) {
    if (!pressedNotes.has(pitch)) return false;
  }
  return true;
}

/**
 * Builds evenly spaced measure markers from song duration, BPM, and time signature.
 */
export function buildSongMeasures(
  durationSec: number,
  bpm: number,
  numerator: number,
  denominator: number,
): SongMeasure[] {
  const safeBpm = Math.max(20, Math.min(300, bpm || 100));
  const beats = Math.max(1, numerator || 4);
  const beatType = Math.max(1, denominator || 4);
  const beatDurSec = (60 / safeBpm) * (4 / beatType);
  const measureDurSec = Math.max(0.25, beats * beatDurSec);

  const measures: SongMeasure[] = [];
  let t = 0;
  let num = 1;
  const limit = Math.max(durationSec, measureDurSec);
  while (t < limit + 0.001) {
    measures.push({
      number: num,
      time: t,
      duration: measureDurSec,
      beats,
      beatType,
    });
    t += measureDurSec;
    num++;
  }
  return measures;
}

/**
 * Computes the current beat index (0-based) and beat-within-measure (0-based) at `timeSec`.
 */
export function getBeatAtTime(
  timeSec: number,
  bpm: number,
  numerator: number,
  denominator: number,
): { beatIndex: number; beatInMeasure: number } {
  const safeBpm = Math.max(20, Math.min(300, bpm || 100));
  const beatDurSec = (60 / safeBpm) * (4 / Math.max(1, denominator || 4));
  const beatIndex = Math.floor(Math.max(0, timeSec) / beatDurSec);
  const beatInMeasure = beatIndex % Math.max(1, numerator || 4);
  return { beatIndex, beatInMeasure };
}
