import { describe, expect, test } from "bun:test";
import {
  computeAutoZoomRange,
  computeKeyLayout,
  fitSongToKeyboardRange,
  isBlackKey,
  midiToNoteName,
} from "../src/shared/keyboardRange.ts";
import type { SongMetadata } from "../src/shared/types.ts";

const sampleSong = (minNote: number, maxNote: number): SongMetadata => ({
  id: "test-song",
  title: "Test Song",
  composer: "Tester",
  difficultyLevel: 3,
  midiFile: "/songs/test.mid",
  durationSec: 20,
  minNote,
  maxNote,
  bpm: 100,
});

describe("keyboardRange", () => {
  test("maps MIDI numbers to standard note names", () => {
    expect(midiToNoteName(21)).toBe("A0");
    expect(midiToNoteName(60)).toBe("C4");
    expect(midiToNoteName(61)).toBe("C#4");
    expect(midiToNoteName(108)).toBe("C8");
  });

  test("auto-zoom enforces minimum 2-octave span and snaps to white keys", () => {
    // Twinkle-like narrow range C4 (60) to A4 (69) on an 88-key piano
    const range = computeAutoZoomRange(60, 69, { minNote: 21, maxNote: 108 });
    expect(range.maxNote - range.minNote).toBeGreaterThanOrEqual(24);
    expect(isBlackKey(range.minNote)).toBe(false);
    expect(isBlackKey(range.maxNote)).toBe(false);
    expect(range.minNote).toBeLessThanOrEqual(57);
    expect(range.maxNote).toBeGreaterThanOrEqual(72);
  });

  test("auto-zoom never exceeds calibrated hardware KeyboardRange", () => {
    // 49-key keyboard C2 (36) to C6 (84)
    const range = computeAutoZoomRange(36, 84, { minNote: 36, maxNote: 84 });
    expect(range.minNote).toBe(36);
    expect(range.maxNote).toBe(84);

    // Idle range on a 49-key keyboard stays clipped to 36..84
    const idle = computeAutoZoomRange(null, null, { minNote: 36, maxNote: 84 });
    expect(idle.minNote).toBeGreaterThanOrEqual(36);
    expect(idle.maxNote).toBeLessThanOrEqual(84);
  });

  test("fitSongToKeyboardRange returns 0 transpose when song already fits", () => {
    const fitted = fitSongToKeyboardRange(sampleSong(60, 72), { minNote: 36, maxNote: 84 });
    expect(fitted).not.toBeNull();
    expect(fitted!.transposeSemitones).toBe(0);
    expect(fitted!.fittedMinNote).toBe(60);
    expect(fitted!.fittedMaxNote).toBe(72);
  });

  test("fitSongToKeyboardRange transposes by whole octaves when that makes the song fit", () => {
    // Song uses G1 (31) to C4 (60) on a 49-key keyboard (36..84) -> +12 shifts to 43..72
    const fitted = fitSongToKeyboardRange(sampleSong(31, 60), { minNote: 36, maxNote: 84 });
    expect(fitted).not.toBeNull();
    expect(fitted!.transposeSemitones).toBe(12);
    expect(fitted!.fittedMinNote).toBe(43);
    expect(fitted!.fittedMaxNote).toBe(72);
  });

  test("fitSongToKeyboardRange excludes songs wider than the physical keyboard", () => {
    // Song spans 55 semitones on a 49-key (48 semitone) keyboard
    const fitted = fitSongToKeyboardRange(sampleSong(30, 85), { minNote: 36, maxNote: 84 });
    expect(fitted).toBeNull();
  });

  test("computeKeyLayout spans [0, 1] cleanly across all white keys", () => {
    const keys = computeKeyLayout(60, 72); // C4..C5 (8 white keys, 5 black keys)
    const whites = keys.filter((k) => !k.isBlack);
    expect(whites.length).toBe(8);
    expect(whites[0]!.x).toBeCloseTo(0, 5);
    const last = whites[whites.length - 1]!;
    expect(last.x + last.width).toBeCloseTo(1, 5);
  });
});
