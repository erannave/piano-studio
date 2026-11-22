import type { FittedSong, KeyGeometry, KeyboardRange, SongMetadata } from "./types.ts";

export const PIANO_MIN_NOTE = 21; // A0
export const PIANO_MAX_NOTE = 108; // C8
export const IDLE_DEFAULT_MIN = 36; // C2
export const IDLE_DEFAULT_MAX = 96; // C7
export const MIN_AUTO_ZOOM_SPAN = 24; // 2 octaves (25 keys)
const AUTO_ZOOM_PADDING = 3;

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;
const BLACK_PITCH_CLASSES = new Set([1, 3, 6, 8, 10]);

export function isBlackKey(midi: number): boolean {
  return BLACK_PITCH_CLASSES.has(((midi % 12) + 12) % 12);
}

export function midiToNoteName(midi: number): string {
  const pitchClass = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return `${NOTE_NAMES[pitchClass]}${octave}`;
}

export function clampKeyboardRange(
  minNote: number,
  maxNote: number,
): { minNote: number; maxNote: number } {
  const clampedMin = Math.max(PIANO_MIN_NOTE, Math.min(PIANO_MAX_NOTE, Math.round(minNote)));
  const clampedMax = Math.max(PIANO_MIN_NOTE, Math.min(PIANO_MAX_NOTE, Math.round(maxNote)));
  if (clampedMin <= clampedMax) {
    return { minNote: clampedMin, maxNote: clampedMax };
  }
  return { minNote: clampedMax, maxNote: clampedMin };
}

function snapToWhiteKeyWithinBounds(
  note: number,
  direction: "down" | "up",
  boundMin: number,
  boundMax: number,
): number {
  let n = Math.max(boundMin, Math.min(boundMax, note));
  if (!isBlackKey(n)) return n;

  if (direction === "down") {
    if (n - 1 >= boundMin && !isBlackKey(n - 1)) return n - 1;
    if (n + 1 <= boundMax && !isBlackKey(n + 1)) return n + 1;
  } else {
    if (n + 1 <= boundMax && !isBlackKey(n + 1)) return n + 1;
    if (n - 1 >= boundMin && !isBlackKey(n - 1)) return n - 1;
  }
  return n;
}

/**
 * Computes the visible keyboard range for the on-screen piano and falling-notes canvas.
 * Always stays strictly within the calibrated hardware KeyboardRange.
 */
export function computeAutoZoomRange(
  songMinNote: number | null,
  songMaxNote: number | null,
  hardwareRange: Pick<KeyboardRange, "minNote" | "maxNote">,
): { minNote: number; maxNote: number } {
  const hw = clampKeyboardRange(hardwareRange.minNote, hardwareRange.maxNote);

  let minNote: number;
  let maxNote: number;

  if (songMinNote === null || songMaxNote === null) {
    minNote = Math.max(hw.minNote, IDLE_DEFAULT_MIN);
    maxNote = Math.min(hw.maxNote, IDLE_DEFAULT_MAX);
    if (minNote > maxNote) {
      minNote = hw.minNote;
      maxNote = hw.maxNote;
    }
  } else {
    minNote = Math.max(hw.minNote, songMinNote - AUTO_ZOOM_PADDING);
    maxNote = Math.min(hw.maxNote, songMaxNote + AUTO_ZOOM_PADDING);

    // Ensure minimum 2-octave span where hardware permits
    const currentSpan = maxNote - minNote;
    if (currentSpan < MIN_AUTO_ZOOM_SPAN) {
      const deficit = MIN_AUTO_ZOOM_SPAN - currentSpan;
      const expandLeft = Math.floor(deficit / 2);
      const expandRight = deficit - expandLeft;
      minNote = Math.max(hw.minNote, minNote - expandLeft);
      maxNote = Math.min(hw.maxNote, maxNote + expandRight);

      // If one side hit hardware boundary, give leftover to the other side
      const remaining = MIN_AUTO_ZOOM_SPAN - (maxNote - minNote);
      if (remaining > 0) {
        if (minNote > hw.minNote) {
          minNote = Math.max(hw.minNote, minNote - remaining);
        } else if (maxNote < hw.maxNote) {
          maxNote = Math.min(hw.maxNote, maxNote + remaining);
        }
      }
    }
  }

  minNote = snapToWhiteKeyWithinBounds(minNote, "down", hw.minNote, hw.maxNote);
  maxNote = snapToWhiteKeyWithinBounds(maxNote, "up", hw.minNote, hw.maxNote);

  return { minNote, maxNote };
}

/**
 * Fits a Song into the learner's calibrated KeyboardRange.
 * - If it already fits, returns transposeSemitones = 0.
 * - Otherwise attempts whole-octave shifts (±12 semitones), choosing the smallest shift.
 * - Returns null if no whole-octave shift fits the hardware range.
 */
export function fitSongToKeyboardRange(
  song: SongMetadata,
  hardwareRange: Pick<KeyboardRange, "minNote" | "maxNote">,
): FittedSong | null {
  const hw = clampKeyboardRange(hardwareRange.minNote, hardwareRange.maxNote);

  if (song.minNote >= hw.minNote && song.maxNote <= hw.maxNote) {
    return {
      ...song,
      transposeSemitones: 0,
      fittedMinNote: song.minNote,
      fittedMaxNote: song.maxNote,
    };
  }

  // Try whole-octave shifts in increasing order of magnitude
  const candidateOctaves = [1, -1, 2, -2, 3, -3, 4, -4];
  for (const oct of candidateOctaves) {
    const shift = oct * 12;
    const shiftedMin = song.minNote + shift;
    const shiftedMax = song.maxNote + shift;
    if (shiftedMin >= hw.minNote && shiftedMax <= hw.maxNote) {
      return {
        ...song,
        transposeSemitones: shift,
        fittedMinNote: shiftedMin,
        fittedMaxNote: shiftedMax,
      };
    }
  }

  return null;
}

/**
 * Computes normalized horizontal [0..1] geometry for all keys in [minNote, maxNote].
 * Shared by PianoKeyboard and FallingNotesCanvas so notes align pixel-perfectly.
 */
export function computeKeyLayout(minNote: number, maxNote: number): KeyGeometry[] {
  const { minNote: start, maxNote: end } = clampKeyboardRange(minNote, maxNote);
  const whiteNotes: number[] = [];
  for (let midi = start; midi <= end; midi++) {
    if (!isBlackKey(midi)) {
      whiteNotes.push(midi);
    }
  }

  const whiteCount = Math.max(1, whiteNotes.length);
  const whiteWidth = 1 / whiteCount;
  const blackWidth = whiteWidth * 0.62;

  const whiteIndexByMidi = new Map<number, number>();
  whiteNotes.forEach((midi, idx) => whiteIndexByMidi.set(midi, idx));

  const keys: KeyGeometry[] = [];
  for (let midi = start; midi <= end; midi++) {
    const black = isBlackKey(midi);
    if (!black) {
      const idx = whiteIndexByMidi.get(midi) ?? 0;
      keys.push({
        midi,
        name: midiToNoteName(midi),
        isBlack: false,
        x: idx * whiteWidth,
        width: whiteWidth,
      });
    } else {
      // Position black key centered on the boundary between the previous white key and the next
      const prevWhiteIdx = whiteIndexByMidi.get(midi - 1);
      const nextWhiteIdx = whiteIndexByMidi.get(midi + 1);
      let center: number;
      if (prevWhiteIdx !== undefined) {
        center = (prevWhiteIdx + 1) * whiteWidth;
      } else if (nextWhiteIdx !== undefined) {
        center = nextWhiteIdx * whiteWidth;
      } else {
        center = 0.5;
      }
      keys.push({
        midi,
        name: midiToNoteName(midi),
        isBlack: true,
        x: Math.max(0, Math.min(1 - blackWidth, center - blackWidth / 2)),
        width: blackWidth,
      });
    }
  }

  return keys;
}
