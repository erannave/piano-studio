import { describe, expect, test } from "bun:test";
import {
  buildSongMeasures,
  findNextWaitGroup,
  getBeatAtTime,
  isPracticedHand,
  isWaitGroupSatisfied,
  midiToStaffPosition,
} from "../src/shared/practiceEngine.ts";
import type { SongNote } from "../src/shared/types.ts";

function note(midi: number, time: number, hand: "right" | "left" = "right"): SongNote {
  return { midi, time, duration: 0.5, velocity: 0.75, track: hand === "right" ? 0 : 1, hand };
}

describe("practiceEngine", () => {
  test("groups simultaneous chord notes within chordWindowSec for Wait Mode", () => {
    const notes: SongNote[] = [
      note(48, 1.0, "left"),
      note(60, 1.01, "right"),
      note(64, 1.02, "right"),
      note(67, 1.5, "right"),
    ];

    const bothGroup = findNextWaitGroup(notes, 0, "both");
    expect(bothGroup).not.toBeNull();
    expect(bothGroup!.requiredPitches).toEqual(new Set([48, 60, 64]));
    expect(bothGroup!.endIndex).toBe(3);

    // Satisfied only when all 3 pitches are held
    expect(isWaitGroupSatisfied(bothGroup!.requiredPitches, new Set([48, 60]))).toBe(false);
    expect(isWaitGroupSatisfied(bothGroup!.requiredPitches, new Set([48, 60, 64, 72]))).toBe(true);
  });

  test("hand isolation filters Wait Mode targets cleanly", () => {
    const notes: SongNote[] = [
      note(48, 1.0, "left"),
      note(60, 1.01, "right"),
      note(64, 1.02, "right"),
      note(55, 2.0, "left"),
    ];

    const rhGroup = findNextWaitGroup(notes, 0, "right");
    expect(rhGroup!.requiredPitches).toEqual(new Set([60, 64]));

    const lhGroup = findNextWaitGroup(notes, 0, "left");
    expect(lhGroup!.requiredPitches).toEqual(new Set([48]));
    expect(isPracticedHand("left", "right")).toBe(false);
    expect(isPracticedHand("right", "right")).toBe(true);
  });

  test("midiToStaffPosition respects key signature accidentals", () => {
    // F#4 (66) in C major (0 fifths) needs a sharp accidental
    const fSharpInC = midiToStaffPosition(66, "right", 0);
    expect(fSharpInC.diatonicFromC4).toBe(3); // F4
    expect(fSharpInC.accidental).toBe("sharp");
    expect(fSharpInC.clef).toBe("treble");

    // F#4 (66) in G major (+1 fifth) needs NO accidental
    const fSharpInG = midiToStaffPosition(66, "right", 1);
    expect(fSharpInG.accidental).toBeNull();

    // F4 natural (65) in G major (+1 fifth) needs a natural accidental
    const fNatInG = midiToStaffPosition(65, "right", 1);
    expect(fNatInG.accidental).toBe("natural");

    // Bb3 (58) in F major (-1 fifth) uses flat spelling with no accidental
    const bFlatInF = midiToStaffPosition(58, "left", -1);
    expect(bFlatInF.accidental).toBeNull();
    expect(bFlatInF.clef).toBe("bass");
    expect(bFlatInF.label).toBe("Bb3");
  });

  test("buildSongMeasures and getBeatAtTime align to BPM and time signature", () => {
    // 120 BPM in 3/4 -> 0.5s per beat, 1.5s per measure
    const measures = buildSongMeasures(4.5, 120, 3, 4);
    expect(measures.length).toBeGreaterThanOrEqual(3);
    expect(measures[0]!.time).toBe(0);
    expect(measures[1]!.time).toBeCloseTo(1.5, 5);

    expect(getBeatAtTime(0.05, 120, 3, 4)).toEqual({ beatIndex: 0, beatInMeasure: 0 });
    expect(getBeatAtTime(0.55, 120, 3, 4)).toEqual({ beatIndex: 1, beatInMeasure: 1 });
    expect(getBeatAtTime(1.55, 120, 3, 4)).toEqual({ beatIndex: 3, beatInMeasure: 0 });
  });
});
