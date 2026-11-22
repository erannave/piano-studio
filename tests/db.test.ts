import { describe, expect, test } from "bun:test";
import { PianoDatabase } from "../src/server/db.ts";

describe("PianoDatabase (bun:sqlite)", () => {
  test("initializes default uncalibrated profile and persists updates", () => {
    const db = new PianoDatabase(":memory:");

    const initial = db.getProfile();
    expect(initial.skillLevel).toBeNull();
    expect(initial.keyboardRange.calibrated).toBe(false);
    expect(initial.keyboardRange.minNote).toBe(21);
    expect(initial.keyboardRange.maxNote).toBe(108);

    const afterRange = db.updateKeyboardRange(36, 96, true);
    expect(afterRange.keyboardRange.calibrated).toBe(true);
    expect(afterRange.keyboardRange.minNote).toBe(36);
    expect(afterRange.keyboardRange.maxNote).toBe(96);

    const afterLevel = db.updateSkillLevel(6);
    expect(afterLevel.skillLevel).toBe(6);

    const afterCal = db.saveCalibrationResult({
      skillLevel: 5,
      feedback: "Steady phrasing on Prelude in C!",
      feedbackSource: "local",
      pieceSummaries: [],
      calibratedAt: "2026-11-22T14:00:00.000Z",
    });
    expect(afterCal.skillLevel).toBe(5);
    expect(afterCal.feedback).toBe("Steady phrasing on Prelude in C!");
    expect(afterCal.calibratedAt).toBe("2026-11-22T14:00:00.000Z");

    db.close();
  });

  test("rejects stale calibration result when a manual Skill Level update intervened", () => {
    const db = new PianoDatabase(":memory:");

    const versionBeforeSubmit = db.getLevelVersion();
    // Learner manually picks Level 7 while calibration coaching is still in flight
    db.updateSkillLevel(7);
    expect(db.getLevelVersion()).toBe(versionBeforeSubmit + 1);

    // Earlier calibration finishes and tries to commit with the stale version
    const staleAttempt = db.saveCalibrationResultIfCurrent(
      {
        skillLevel: 3,
        feedback: "Stale calibration feedback",
        feedbackSource: "local",
        pieceSummaries: [],
        calibratedAt: "2026-11-22T15:00:00.000Z",
      },
      versionBeforeSubmit
    );

    expect(staleAttempt.applied).toBe(false);
    expect(staleAttempt.profile.skillLevel).toBe(7);
    expect(db.getProfile().skillLevel).toBe(7);

    // A fresh calibration using the current version commits normally
    const freshVersion = db.getLevelVersion();
    const freshAttempt = db.saveCalibrationResultIfCurrent(
      {
        skillLevel: 8,
        feedback: "Fresh calibration feedback",
        feedbackSource: "local",
        pieceSummaries: [],
        calibratedAt: "2026-11-22T15:05:00.000Z",
      },
      freshVersion
    );

    expect(freshAttempt.applied).toBe(true);
    expect(freshAttempt.profile.skillLevel).toBe(8);

    db.close();
  });
});
