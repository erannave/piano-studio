import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import indexHtml from "./src/index.html";
import { generateCoachingFeedback } from "./src/server/coaching.ts";
import { PianoDatabase } from "./src/server/db.ts";
import { evaluateCalibration } from "./src/shared/calibrationScoring.ts";
import type { CalibrationPieceAttempt, CalibrationResult } from "./src/shared/types.ts";

const isProd = process.env.NODE_ENV === "production";
const port = Number(process.env.PORT) || 3000;
const publicDir = resolve(process.cwd(), "public");
const songsDir = join(publicDir, "songs");

const db = new PianoDatabase(process.env.DB_PATH || "data/piano.db");

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function serveSafeFile(baseDir: string, relPath: string): Response {
  const decoded = decodeURIComponent(relPath).replace(/^\/+/, "");
  const fullPath = resolve(baseDir, decoded);
  if (!fullPath.startsWith(baseDir + "/") && fullPath !== baseDir) {
    return new Response("Forbidden", { status: 403 });
  }
  if (!existsSync(fullPath)) {
    return new Response("Not Found", { status: 404 });
  }
  return new Response(Bun.file(fullPath));
}

const apiRoutes = {
  "/api/profile": {
    GET: () => json(db.getProfile()),
  },
  "/api/profile/level": {
    PATCH: async (req: Request) => {
      try {
        const body = (await req.json()) as { skillLevel?: unknown; feedback?: unknown };
        const level = Number(body.skillLevel);
        if (!Number.isFinite(level) || level < 1 || level > 10) {
          return json({ error: "skillLevel must be an integer between 1 and 10" }, 400);
        }
        const feedback = typeof body.feedback === "string" ? body.feedback : undefined;
        const profile = db.updateSkillLevel(level, feedback, feedback ? "local" : undefined);
        return json(profile);
      } catch {
        return json({ error: "Invalid JSON payload" }, 400);
      }
    },
  },
  "/api/profile/keyboard-range": {
    PUT: async (req: Request) => {
      try {
        const body = (await req.json()) as { minNote?: unknown; maxNote?: unknown; calibrated?: unknown };
        const minNote = Number(body.minNote);
        const maxNote = Number(body.maxNote);
        if (!Number.isFinite(minNote) || !Number.isFinite(maxNote)) {
          return json({ error: "minNote and maxNote must be valid MIDI note numbers" }, 400);
        }
        const calibrated = body.calibrated !== false;
        const profile = db.updateKeyboardRange(minNote, maxNote, calibrated);
        return json(profile);
      } catch {
        return json({ error: "Invalid JSON payload" }, 400);
      }
    },
  },
  "/api/calibration/evaluate": {
    POST: async (req: Request) => {
      try {
        const body = (await req.json()) as { attempts?: CalibrationPieceAttempt[] };
        if (!Array.isArray(body.attempts) || body.attempts.length === 0) {
          return json({ error: "attempts must be a non-empty array" }, 400);
        }

        const { skillLevel, pieceSummaries, localFeedback } = evaluateCalibration(body.attempts);
        const coaching = await generateCoachingFeedback(skillLevel, pieceSummaries, localFeedback);

        const result: CalibrationResult = {
          skillLevel,
          feedback: coaching.feedback,
          feedbackSource: coaching.source,
          pieceSummaries,
          calibratedAt: new Date().toISOString(),
        };

        const profile = db.saveCalibrationResult(result);
        return json({ result, profile });
      } catch (err) {
        console.error("Calibration evaluation error:", err);
        return json({ error: "Failed to evaluate calibration" }, 500);
      }
    },
  },
  "/api/songs": {
    GET: () => {
      const catalogPath = join(songsDir, "songs.json");
      if (!existsSync(catalogPath)) {
        return json({ error: "Song catalog not found. Run `bun run seed`." }, 404);
      }
      return new Response(Bun.file(catalogPath), {
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    },
  },
};

const server = Bun.serve({
  port,
  development: !isProd ? { hmr: true, console: true } : false,
  routes: {
    ...apiRoutes,
    "/": isProd ? () => serveSafeFile(publicDir, "index.html") : indexHtml,
  },
  fetch(req) {
    const url = new URL(req.url);

    // Serve generated MIDI songs and catalog from public/songs/
    if (url.pathname.startsWith("/songs/")) {
      return serveSafeFile(songsDir, url.pathname.slice("/songs/".length));
    }

    // In production, serve static built files from public/
    if (isProd) {
      const target = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
      const res = serveSafeFile(publicDir, target);
      if (res.status !== 404) return res;
      return serveSafeFile(publicDir, "index.html");
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(
  `Piano Learning App running at ${server.url} (${isProd ? "production" : "development"} mode)`
);
