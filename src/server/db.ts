import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { clampKeyboardRange, PIANO_MAX_NOTE, PIANO_MIN_NOTE } from "../shared/keyboardRange.ts";
import type { CalibrationResult, LearnerProfile } from "../shared/types.ts";

interface ProfileRow {
  skill_level: number | null;
  feedback: string | null;
  feedback_source: "ai" | "local" | null;
  keyboard_min_note: number;
  keyboard_max_note: number;
  keyboard_calibrated: number;
  calibrated_at: string | null;
  updated_at: string;
}

export class PianoDatabase {
  private db: Database;

  constructor(dbPath: string = process.env.DB_PATH || "data/piano.db") {
    if (dbPath !== ":memory:") {
      mkdirSync(dirname(dbPath), { recursive: true });
    }
    this.db = new Database(dbPath, { create: true });
    this.db.run("PRAGMA journal_mode = WAL;");
    this.init();
  }

  private init(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS learner_profile (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        skill_level INTEGER,
        feedback TEXT,
        feedback_source TEXT,
        keyboard_min_note INTEGER NOT NULL DEFAULT ${PIANO_MIN_NOTE},
        keyboard_max_note INTEGER NOT NULL DEFAULT ${PIANO_MAX_NOTE},
        keyboard_calibrated INTEGER NOT NULL DEFAULT 0,
        calibrated_at TEXT,
        updated_at TEXT NOT NULL,
        level_version INTEGER NOT NULL DEFAULT 0
      );
    `);

    const cols = this.db.query<{ name: string }, []>(`PRAGMA table_info(learner_profile)`).all();
    if (!cols.some((c) => c.name === "level_version")) {
      this.db.run(
        `ALTER TABLE learner_profile ADD COLUMN level_version INTEGER NOT NULL DEFAULT 0`,
      );
    }

    this.db.run(`
      CREATE TABLE IF NOT EXISTS calibration_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        skill_level INTEGER NOT NULL,
        feedback TEXT NOT NULL,
        feedback_source TEXT NOT NULL,
        summaries_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);

    const now = new Date().toISOString();
    this.db.run(
      `INSERT OR IGNORE INTO learner_profile (id, keyboard_min_note, keyboard_max_note, keyboard_calibrated, updated_at)
       VALUES (1, ?, ?, 0, ?)`,
      [PIANO_MIN_NOTE, PIANO_MAX_NOTE, now],
    );
  }

  getProfile(): LearnerProfile {
    const row = this.db
      .query<ProfileRow, []>(
        `SELECT skill_level, feedback, feedback_source, keyboard_min_note, keyboard_max_note, keyboard_calibrated, calibrated_at, updated_at
         FROM learner_profile WHERE id = 1`,
      )
      .get();

    if (!row) {
      const now = new Date().toISOString();
      return {
        skillLevel: null,
        feedback: null,
        feedbackSource: null,
        keyboardRange: { minNote: PIANO_MIN_NOTE, maxNote: PIANO_MAX_NOTE, calibrated: false },
        calibratedAt: null,
        updatedAt: now,
      };
    }

    return {
      skillLevel: row.skill_level,
      feedback: row.feedback,
      feedbackSource: row.feedback_source,
      keyboardRange: {
        minNote: row.keyboard_min_note,
        maxNote: row.keyboard_max_note,
        calibrated: row.keyboard_calibrated === 1,
      },
      calibratedAt: row.calibrated_at,
      updatedAt: row.updated_at,
    };
  }

  getLevelVersion(): number {
    const row = this.db
      .query<{ level_version: number }, []>(
        `SELECT level_version FROM learner_profile WHERE id = 1`,
      )
      .get();
    return row?.level_version ?? 0;
  }

  updateSkillLevel(
    skillLevel: number,
    feedback?: string | null,
    feedbackSource?: "ai" | "local" | null,
  ): LearnerProfile {
    const clamped = Math.max(1, Math.min(10, Math.round(skillLevel)));
    const now = new Date().toISOString();

    if (feedback !== undefined) {
      this.db.run(
        `UPDATE learner_profile
         SET skill_level = ?, feedback = ?, feedback_source = ?, updated_at = ?, level_version = level_version + 1
         WHERE id = 1`,
        [clamped, feedback, feedbackSource ?? "local", now],
      );
    } else {
      this.db.run(
        `UPDATE learner_profile
         SET skill_level = ?, updated_at = ?, level_version = level_version + 1
         WHERE id = 1`,
        [clamped, now],
      );
    }

    return this.getProfile();
  }

  updateKeyboardRange(minNote: number, maxNote: number, calibrated = true): LearnerProfile {
    const clamped = clampKeyboardRange(minNote, maxNote);
    const now = new Date().toISOString();
    this.db.run(
      `UPDATE learner_profile
       SET keyboard_min_note = ?, keyboard_max_note = ?, keyboard_calibrated = ?, updated_at = ?
       WHERE id = 1`,
      [clamped.minNote, clamped.maxNote, calibrated ? 1 : 0, now],
    );
    return this.getProfile();
  }

  saveCalibrationResult(result: CalibrationResult): LearnerProfile {
    const now = result.calibratedAt || new Date().toISOString();
    this.db.run(
      `UPDATE learner_profile
       SET skill_level = ?, feedback = ?, feedback_source = ?, calibrated_at = ?, updated_at = ?, level_version = level_version + 1
       WHERE id = 1`,
      [result.skillLevel, result.feedback, result.feedbackSource, now, now],
    );

    this.db.run(
      `INSERT INTO calibration_history (skill_level, feedback, feedback_source, summaries_json, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [
        result.skillLevel,
        result.feedback,
        result.feedbackSource,
        JSON.stringify(result.pieceSummaries),
        now,
      ],
    );

    return this.getProfile();
  }

  saveCalibrationResultIfCurrent(
    result: CalibrationResult,
    expectedLevelVersion: number,
  ): { applied: boolean; profile: LearnerProfile } {
    const now = result.calibratedAt || new Date().toISOString();
    const update = this.db.run(
      `UPDATE learner_profile
       SET skill_level = ?, feedback = ?, feedback_source = ?, calibrated_at = ?, updated_at = ?, level_version = level_version + 1
       WHERE id = 1 AND level_version = ?`,
      [result.skillLevel, result.feedback, result.feedbackSource, now, now, expectedLevelVersion],
    );

    if (update.changes === 0) {
      return { applied: false, profile: this.getProfile() };
    }

    this.db.run(
      `INSERT INTO calibration_history (skill_level, feedback, feedback_source, summaries_json, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [
        result.skillLevel,
        result.feedback,
        result.feedbackSource,
        JSON.stringify(result.pieceSummaries),
        now,
      ],
    );

    return { applied: true, profile: this.getProfile() };
  }

  close(): void {
    this.db.close();
  }
}
