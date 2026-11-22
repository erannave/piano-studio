import type { PieceScoreSummary } from "../shared/types.ts";

const DEFAULT_AI_ENDPOINT = "http://192.168.0.101:8317/v1/messages";
const DEFAULT_AI_MODEL = "claude-haiku-5-5";
const DEFAULT_TIMEOUT_MS = 8000;

export interface CoachingResult {
  feedback: string;
  source: "ai" | "local";
}

export async function generateCoachingFeedback(
  skillLevel: number,
  pieceSummaries: PieceScoreSummary[],
  localFallback: string,
): Promise<CoachingResult> {
  const endpoint = process.env.AI_ENDPOINT?.trim() || DEFAULT_AI_ENDPOINT;
  const model = process.env.AI_MODEL?.trim() || DEFAULT_AI_MODEL;
  const apiKey = process.env.AI_API_KEY?.trim();
  const timeoutMs = Number(process.env.AI_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;

  // Skip remote AI call if explicitly disabled or no pieces were actually played
  if (endpoint.toLowerCase() === "off" || endpoint.toLowerCase() === "none") {
    return { feedback: localFallback, source: "local" };
  }

  const playedCount = pieceSummaries.reduce((sum, p) => sum + p.playedCount, 0);
  if (playedCount === 0) {
    return { feedback: localFallback, source: "local" };
  }

  const headers: Record<string, string> = {
    "content-type": "application/json",
    "anthropic-version": "2023-06-01",
  };
  if (apiKey) {
    headers["x-api-key"] = apiKey;
  }

  const systemPrompt =
    'You are an encouraging piano teacher. Given a learner\'s deterministic Skill Calibration performance summary and assigned Skill Level (1–10), write a concise 2-sentence encouraging critique highlighting what went well and one actionable next step. Respond with a JSON object containing exactly one key: {"feedback": "..."}.';

  const userContent = JSON.stringify({
    assignedSkillLevel: skillLevel,
    calibrationPieces: pieceSummaries.map((p) => ({
      title: p.title,
      difficultyLevel: p.difficultyLevel,
      skipped: p.skipped,
      pitchAccuracyPercent: Math.round(p.pitchAccuracy * 100),
      completionPercent: Math.round(p.completionRate * 100),
      avgTimingErrorMs: p.avgTimingErrorMs,
      playedNotes: p.playedCount,
      expectedNotes: p.expectedCount,
    })),
  });

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({
        model,
        max_tokens: 220,
        system: systemPrompt,
        messages: [{ role: "user", content: userContent }],
      }),
    });

    if (!response.ok) {
      return { feedback: localFallback, source: "local" };
    }

    const data = (await response.json()) as {
      content?: Array<{ type?: string; text?: string }>;
    };
    const rawText = data.content?.find((b) => b.type === "text")?.text?.trim();
    if (!rawText) {
      return { feedback: localFallback, source: "local" };
    }

    const parsedFeedback = extractFeedbackText(rawText);
    if (!parsedFeedback) {
      return { feedback: localFallback, source: "local" };
    }

    return { feedback: parsedFeedback, source: "ai" };
  } catch {
    return { feedback: localFallback, source: "local" };
  }
}

function extractFeedbackText(rawText: string): string | null {
  // Strip optional markdown code fences
  const cleaned = rawText
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  try {
    const parsed = JSON.parse(cleaned) as { feedback?: unknown };
    if (typeof parsed.feedback === "string" && parsed.feedback.trim().length > 0) {
      return parsed.feedback.trim();
    }
  } catch {
    // If model returned plain text instead of JSON, still accept a clean short response
    if (cleaned.length >= 20 && cleaned.length <= 500 && !cleaned.startsWith("{")) {
      return cleaned;
    }
  }
  return null;
}
