import type { CalibrationPieceAttempt, PieceScoreSummary } from "./types.ts";

const MATCH_WINDOW_MS = 450;

export function scoreCalibrationPiece(attempt: CalibrationPieceAttempt): PieceScoreSummary {
  const expectedCount = attempt.expectedNotes.length;

  if (attempt.skipped || expectedCount === 0) {
    return {
      songId: attempt.songId,
      title: attempt.title,
      difficultyLevel: attempt.difficultyLevel,
      skipped: true,
      expectedCount,
      matchedCount: 0,
      playedCount: 0,
      pitchAccuracy: 0,
      completionRate: 0,
      avgTimingErrorMs: MATCH_WINDOW_MS,
      velocitySpread: 0,
      compositeScore: 0,
    };
  }

  const playedNoteOns = attempt.recordedEvents
    .filter((e) => e.type === "noteOn" && e.velocity > 0)
    .sort((a, b) => a.timestampMs - b.timestampMs);

  const playedCount = playedNoteOns.length;
  if (playedCount === 0) {
    return {
      songId: attempt.songId,
      title: attempt.title,
      difficultyLevel: attempt.difficultyLevel,
      skipped: false,
      expectedCount,
      matchedCount: 0,
      playedCount: 0,
      pitchAccuracy: 0,
      completionRate: 0,
      avgTimingErrorMs: MATCH_WINDOW_MS,
      velocitySpread: 0,
      compositeScore: 0,
    };
  }

  const sortedExpected = [...attempt.expectedNotes].sort((a, b) => a.timeMs - b.timeMs);

  // Align the first played note to the first expected note's timestamp so waiting before starting is not penalized
  const firstExpectedTime = sortedExpected[0]!.timeMs;
  const firstPlayedTime = playedNoteOns[0]!.timestampMs;
  const timeOffset = firstExpectedTime - firstPlayedTime;

  const normalizedPlayed = playedNoteOns.map((e) => ({
    ...e,
    alignedMs: e.timestampMs + timeOffset,
    used: false,
  }));

  let matchedCount = 0;
  let totalTimingError = 0;

  for (const exp of sortedExpected) {
    let bestIdx = -1;
    let bestDelta = Infinity;

    for (let i = 0; i < normalizedPlayed.length; i++) {
      const p = normalizedPlayed[i]!;
      if (p.used || p.midi !== exp.midi) continue;
      const delta = Math.abs(p.alignedMs - exp.timeMs);
      if (delta <= MATCH_WINDOW_MS && delta < bestDelta) {
        bestDelta = delta;
        bestIdx = i;
      }
    }

    if (bestIdx !== -1) {
      normalizedPlayed[bestIdx]!.used = true;
      matchedCount++;
      totalTimingError += bestDelta;
    }
  }

  const completionRate = matchedCount / expectedCount;
  const pitchAccuracy = matchedCount / Math.max(expectedCount, playedCount);
  const avgTimingErrorMs = matchedCount > 0 ? totalTimingError / matchedCount : MATCH_WINDOW_MS;
  const timingScore = Math.max(0, 1 - avgTimingErrorMs / 400);

  // Dynamic control: moderate velocity variation indicates expressive control (avoid penalizing constant-velocity keyboards)
  const velocities = playedNoteOns.map((e) => e.velocity);
  const meanVel = velocities.reduce((a, b) => a + b, 0) / velocities.length;
  const variance = velocities.reduce((sum, v) => sum + (v - meanVel) ** 2, 0) / velocities.length;
  const stdDev = Math.sqrt(variance);
  const velocitySpread = Math.min(1, stdDev / 30);
  const dynamicScore = stdDev > 0 ? Math.min(1, 0.5 + velocitySpread * 0.5) : 0.6;

  const compositeScore =
    0.45 * pitchAccuracy + 0.3 * completionRate + 0.2 * timingScore + 0.05 * dynamicScore;

  return {
    songId: attempt.songId,
    title: attempt.title,
    difficultyLevel: attempt.difficultyLevel,
    skipped: false,
    expectedCount,
    matchedCount,
    playedCount,
    pitchAccuracy: round3(pitchAccuracy),
    completionRate: round3(completionRate),
    avgTimingErrorMs: Math.round(avgTimingErrorMs),
    velocitySpread: round3(velocitySpread),
    compositeScore: round3(compositeScore),
  };
}

/**
 * Deterministically assigns a Skill Level (1..10) from scored Calibration Pieces.
 */
export function evaluateCalibration(attempts: CalibrationPieceAttempt[]): {
  skillLevel: number;
  pieceSummaries: PieceScoreSummary[];
  localFeedback: string;
} {
  const pieceSummaries = attempts
    .map(scoreCalibrationPiece)
    .sort((a, b) => a.difficultyLevel - b.difficultyLevel);

  const attempted = pieceSummaries.filter((p) => !p.skipped && p.playedCount > 0);
  if (attempted.length === 0) {
    return {
      skillLevel: 1,
      pieceSummaries,
      localFeedback:
        "No MIDI notes were recorded during calibration, so we've started you at Level 1. You can browse Level 1–2 songs now or re-run Skill Calibration whenever your piano is ready.",
    };
  }

  // Compute a level estimate from each attempted piece and take the strongest demonstrated tier
  // A score >= 0.85 on a difficulty D piece demonstrates mastery at D+1; 0.70 demonstrates D; lower scales proportionally
  let bestLevel = 1;
  for (const p of attempted) {
    let demonstrated: number;
    if (p.compositeScore >= 0.9) {
      demonstrated = p.difficultyLevel + 2;
    } else if (p.compositeScore >= 0.78) {
      demonstrated = p.difficultyLevel + 1;
    } else if (p.compositeScore >= 0.62) {
      demonstrated = p.difficultyLevel;
    } else if (p.compositeScore >= 0.42) {
      demonstrated = Math.max(1, p.difficultyLevel - 1);
    } else {
      demonstrated = Math.max(1, Math.round(p.difficultyLevel * p.compositeScore));
    }
    bestLevel = Math.max(bestLevel, demonstrated);
  }

  const skillLevel = Math.max(1, Math.min(10, Math.round(bestLevel)));
  const localFeedback = generateLocalFeedback(skillLevel, pieceSummaries);

  return { skillLevel, pieceSummaries, localFeedback };
}

export function generateLocalFeedback(skillLevel: number, summaries: PieceScoreSummary[]): string {
  const attempted = summaries.filter((p) => !p.skipped && p.playedCount > 0);
  if (attempted.length === 0) {
    return "Starting you at Level 1 so you can get comfortable with the keyboard and falling notes. Re-run Skill Calibration anytime to update your level.";
  }

  const best = [...attempted].sort((a, b) => b.compositeScore - a.compositeScore)[0]!;
  const pct = Math.round(best.pitchAccuracy * 100);
  const timing = best.avgTimingErrorMs;

  const timingNote =
    timing <= 80
      ? "your timing was very steady"
      : timing <= 180
        ? "your rhythm stayed close to the beat"
        : "slowing the tempo slider to 75% will help lock in the rhythm";

  return `Great work on "${best.title}" (${pct}% note accuracy), and ${timingNote}. We placed you at Skill Level ${skillLevel}—explore the recommended songs in your library to build momentum.`;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
