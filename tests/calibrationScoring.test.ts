import { describe, expect, test } from "bun:test";
import {
  CALIBRATION_END_BUFFER_SEC,
  evaluateCalibration,
  getCalibrationPieceDurationSec,
  MIN_CALIBRATION_DURATION_SEC,
} from "../src/shared/calibrationScoring.ts";
import type {
  CalibrationPieceAttempt,
  ExpectedNote,
  MidiEventRecord,
} from "../src/shared/types.ts";

function makeExpected(notes: number[], stepMs = 400): ExpectedNote[] {
  return notes.map((midi, i) => ({
    midi,
    timeMs: i * stepMs,
    durationMs: stepMs * 0.9,
  }));
}

function makePlayed(
  notes: number[],
  stepMs = 400,
  startOffsetMs = 1200,
  jitterMs = 10,
): MidiEventRecord[] {
  return notes.map((midi, i) => ({
    type: "noteOn",
    midi,
    velocity: 70 + (i % 4) * 10,
    timestampMs: startOffsetMs + i * stepMs + (i % 2 === 0 ? jitterMs : -jitterMs),
  }));
}

describe("calibrationScoring", () => {
  test("defaults to Level 1 when all pieces are skipped", () => {
    const attempts: CalibrationPieceAttempt[] = [
      {
        songId: "l2",
        title: "Ode to Joy",
        difficultyLevel: 2,
        skipped: true,
        expectedNotes: makeExpected([60, 62, 64]),
        recordedEvents: [],
      },
      {
        songId: "l5",
        title: "Prelude",
        difficultyLevel: 5,
        skipped: true,
        expectedNotes: makeExpected([60, 64, 67]),
        recordedEvents: [],
      },
      {
        songId: "l8",
        title: "Fur Elise",
        difficultyLevel: 8,
        skipped: true,
        expectedNotes: makeExpected([76, 75, 76]),
        recordedEvents: [],
      },
    ];
    const result = evaluateCalibration(attempts);
    expect(result.skillLevel).toBe(1);
    expect(result.localFeedback.length).toBeGreaterThan(20);
  });

  test("places accurate beginner who skips intermediate/advanced around Level 3–4", () => {
    const l2Notes = [64, 64, 65, 67, 67, 65, 64, 62];
    const attempts: CalibrationPieceAttempt[] = [
      {
        songId: "ode-to-joy",
        title: "Ode to Joy",
        difficultyLevel: 2,
        skipped: false,
        expectedNotes: makeExpected(l2Notes),
        recordedEvents: makePlayed(l2Notes),
      },
      {
        songId: "prelude-in-c",
        title: "Prelude in C",
        difficultyLevel: 5,
        skipped: true,
        expectedNotes: makeExpected([60, 64, 67, 72]),
        recordedEvents: [],
      },
      {
        songId: "fur-elise",
        title: "Für Elise",
        difficultyLevel: 8,
        skipped: true,
        expectedNotes: makeExpected([76, 75, 76, 75]),
        recordedEvents: [],
      },
    ];
    const result = evaluateCalibration(attempts);
    expect(result.skillLevel).toBeGreaterThanOrEqual(3);
    expect(result.skillLevel).toBeLessThanOrEqual(4);
    expect(result.pieceSummaries[0]!.pitchAccuracy).toBe(1);
  });

  test("places strong advanced player near Level 9–10", () => {
    const l8Notes = [76, 75, 76, 75, 76, 71, 74, 72, 69];
    const attempts: CalibrationPieceAttempt[] = [
      {
        songId: "fur-elise",
        title: "Für Elise",
        difficultyLevel: 8,
        skipped: false,
        expectedNotes: makeExpected(l8Notes, 250),
        recordedEvents: makePlayed(l8Notes, 250, 500, 15),
      },
    ];
    const result = evaluateCalibration(attempts);
    expect(result.skillLevel).toBeGreaterThanOrEqual(9);
    expect(result.skillLevel).toBeLessThanOrEqual(10);
  });

  test("getCalibrationPieceDurationSec covers pieces longer than 15s without cutting off the end", () => {
    expect(getCalibrationPieceDurationSec(17.06)).toBeCloseTo(
      17.06 + CALIBRATION_END_BUFFER_SEC,
      5,
    );
    expect(getCalibrationPieceDurationSec(15.67)).toBeCloseTo(
      15.67 + CALIBRATION_END_BUFFER_SEC,
      5,
    );
    expect(getCalibrationPieceDurationSec(12.12)).toBeCloseTo(
      12.12 + CALIBRATION_END_BUFFER_SEC,
      5,
    );
    expect(getCalibrationPieceDurationSec(4)).toBe(MIN_CALIBRATION_DURATION_SEC);
  });
});
