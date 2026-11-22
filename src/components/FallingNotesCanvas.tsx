import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import { computeKeyLayout, midiToNoteName } from "../shared/keyboardRange.ts";
import { isPracticedHand } from "../shared/practiceEngine.ts";
import type { PracticeHandMode, SongNote } from "../shared/types.ts";

interface LoopRange {
  start: number | null;
  end: number | null;
  active: boolean;
}

interface FallingNotesCanvasProps {
  notes: SongNote[];
  currentTimeSec: number;
  timeRef?: Readonly<{ current: number }>;
  drawHandleRef?: MutableRefObject<((timeSec: number) => void) | null>;
  minNote: number;
  maxNote: number;
  activeUserNotes: ReadonlySet<number>;
  waitingNotes?: ReadonlySet<number>;
  practiceHand?: PracticeHandMode;
  showNoteNames?: boolean;
  loopRange?: LoopRange;
  lookAheadSec?: number;
}

const MAX_CANVAS_DPR = 2;

function findFirstNoteAtOrAfter(notes: SongNote[], targetTime: number): number {
  let lo = 0;
  let hi = notes.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (notes[mid]!.time < targetTime) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
}

export const FallingNotesCanvas = memo(function FallingNotesCanvas({
  notes,
  currentTimeSec,
  timeRef,
  drawHandleRef,
  minNote,
  maxNote,
  activeUserNotes,
  waitingNotes,
  practiceHand = "both",
  showNoteNames = false,
  loopRange,
  lookAheadSec = 3.2,
}: FallingNotesCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bgCacheRef = useRef<HTMLCanvasElement | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0, dpr: 1 });

  const keyMap = useMemo(() => {
    const layout = computeKeyLayout(minNote, maxNote);
    const map = new Map(layout.map((k) => [k.midi, k]));
    return { layout, map };
  }, [minNote, maxNote]);

  const maxNoteDuration = useMemo(() => {
    let maxDur = 0;
    for (let i = 0; i < notes.length; i++) {
      const d = notes[i]!.duration;
      if (d > maxDur) maxDur = d;
    }
    return maxDur;
  }, [notes]);

  // Keep canvas sized crisply to container with DPR capped at 2 for Android tablet GPU efficiency
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_CANVAS_DPR);
      const w = Math.max(1, Math.floor(rect.width * dpr));
      const h = Math.max(1, Math.floor(rect.height * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      setCanvasSize((prev) =>
        prev.width === w && prev.height === h && prev.dpr === dpr
          ? prev
          : { width: w, height: h, dpr },
      );
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Pre-render static background gradient + vertical lane guides into an offscreen cache
  useEffect(() => {
    const { width: pixelW, height: pixelH, dpr } = canvasSize;
    if (pixelW <= 0 || pixelH <= 0) return;

    const cache = bgCacheRef.current ?? document.createElement("canvas");
    cache.width = pixelW;
    cache.height = pixelH;
    bgCacheRef.current = cache;

    const ctx = cache.getContext("2d", { alpha: false });
    if (!ctx) return;

    const width = pixelW / dpr;
    const height = pixelH / dpr;

    ctx.save();
    ctx.scale(dpr, dpr);

    // Background gradient
    const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
    bgGrad.addColorStop(0, "#020617");
    bgGrad.addColorStop(1, "#0f172a");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // Black-key lane fills
    ctx.fillStyle = "rgba(15, 23, 42, 0.45)";
    for (const key of keyMap.layout) {
      if (key.isBlack) {
        ctx.fillRect(key.x * width, 0, key.width * width, height);
      }
    }

    // Regular C-key vertical guide lines batched in a single path
    ctx.strokeStyle = "rgba(148, 163, 184, 0.14)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    let middleCX: number | null = null;
    for (const key of keyMap.layout) {
      if (!key.isBlack && key.midi % 12 === 0) {
        const x = key.x * width;
        if (key.midi === 60) {
          middleCX = x;
        } else {
          ctx.moveTo(x, 0);
          ctx.lineTo(x, height);
        }
      }
    }
    ctx.stroke();

    // Middle C guide line
    if (middleCX !== null) {
      ctx.strokeStyle = "rgba(244, 63, 94, 0.35)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(middleCX, 0);
      ctx.lineTo(middleCX, height);
      ctx.stroke();
    }

    ctx.restore();
  }, [canvasSize, keyMap]);

  const drawFrame = useCallback(
    (timeSec: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) return;

      const { width: pixelW, height: pixelH, dpr } = canvasSize;
      if (pixelW <= 0 || pixelH <= 0) return;

      const width = pixelW / dpr;
      const height = pixelH / dpr;

      // Blit cached static background in 1:1 device pixels
      const bgCache = bgCacheRef.current;
      if (bgCache && bgCache.width === pixelW && bgCache.height === pixelH) {
        ctx.drawImage(bgCache, 0, 0);
      } else {
        ctx.fillStyle = "#020617";
        ctx.fillRect(0, 0, pixelW, pixelH);
      }

      ctx.save();
      ctx.scale(dpr, dpr);

      // Horizontal beat/second reference lines batched in a single path
      const pxPerSec = height / lookAheadSec;
      const firstSec = Math.floor(timeSec);
      const lastSec = Math.ceil(timeSec + lookAheadSec);
      ctx.strokeStyle = "rgba(148, 163, 184, 0.08)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let s = firstSec; s <= lastSec; s++) {
        const y = height - (s - timeSec) * pxPerSec;
        if (y >= 0 && y <= height) {
          ctx.moveTo(0, y);
          ctx.lineTo(width, y);
        }
      }
      ctx.stroke();

      // Loop region shading on waterfall
      if (loopRange && loopRange.start !== null && loopRange.end !== null) {
        const yBottom = Math.min(height, height - (loopRange.start - timeSec) * pxPerSec);
        const yTop = Math.max(0, height - (loopRange.end - timeSec) * pxPerSec);
        if (yBottom > yTop) {
          ctx.fillStyle = loopRange.active
            ? "rgba(56, 189, 248, 0.1)"
            : "rgba(148, 163, 184, 0.06)";
          ctx.fillRect(0, yTop, width, yBottom - yTop);
        }
      }

      // Binary-search into visible time window instead of O(N) full scan
      const windowStart = timeSec - 0.15;
      const windowEnd = timeSec + lookAheadSec;
      const startIdx = findFirstNoteAtOrAfter(notes, windowStart - maxNoteDuration);

      if (showNoteNames) {
        ctx.font = "bold 10px ui-sans-serif, system-ui, sans-serif";
        ctx.textAlign = "center";
      }

      for (let i = startIdx; i < notes.length; i++) {
        const note = notes[i]!;
        if (note.time > windowEnd) break;
        const noteEnd = note.time + note.duration;
        if (noteEnd < windowStart) continue;

        const key = keyMap.map.get(note.midi);
        if (!key) continue;

        const x = key.x * width + 1.5;
        const w = Math.max(4, key.width * width - 3);
        const yBottom = height - (note.time - timeSec) * pxPerSec;
        const yTop = height - (noteEnd - timeSec) * pxPerSec;
        const barH = Math.max(8, yBottom - yTop);

        const practiced = isPracticedHand(note.hand, practiceHand);
        const isActiveNow = note.time <= timeSec && noteEnd >= timeSec;
        const isMatched = isActiveNow && activeUserNotes.has(note.midi);
        const isWaitingTarget =
          Boolean(waitingNotes?.has(note.midi)) && Math.abs(note.time - timeSec) < 0.08;

        let fill: string;
        let stroke: string;
        if (isMatched) {
          fill = "#34d399";
          stroke = "#a7f3d0";
        } else if (isWaitingTarget) {
          fill = "#f59e0b";
          stroke = "#fef3c7";
        } else if (!practiced) {
          fill = "rgba(100, 116, 139, 0.28)";
          stroke = "rgba(148, 163, 184, 0.35)";
        } else if (note.hand === "left") {
          fill = isActiveNow ? "#818cf8" : key.isBlack ? "#4f46e5" : "#6366f1";
          stroke = "#c7d2fe";
        } else {
          fill = isActiveNow ? "#38bdf8" : key.isBlack ? "#0284c7" : "#0ea5e9";
          stroke = "#bae6fd";
        }

        const radius = Math.min(6, w / 2, barH / 2);
        ctx.beginPath();
        ctx.roundRect(x, yTop, w, barH, radius);
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.strokeStyle = stroke;
        ctx.lineWidth = isActiveNow || isWaitingTarget ? 2 : 1;
        ctx.stroke();

        if (showNoteNames && practiced && barH >= 18 && w >= 18) {
          ctx.fillStyle = "#0f172a";
          ctx.fillText(midiToNoteName(note.midi), x + w / 2, yBottom - 5);
        }
      }

      if (showNoteNames) {
        ctx.textAlign = "start";
      }

      // Hit line right above the keyboard
      ctx.fillStyle =
        waitingNotes && waitingNotes.size > 0
          ? "rgba(245, 158, 11, 0.85)"
          : "rgba(56, 189, 248, 0.6)";
      ctx.fillRect(0, height - 3, width, 3);

      ctx.restore();
    },
    [
      notes,
      maxNoteDuration,
      keyMap,
      activeUserNotes,
      waitingNotes,
      practiceHand,
      showNoteNames,
      loopRange,
      lookAheadSec,
      canvasSize,
    ],
  );

  // Register imperative draw handle for 60fps RAF loop without React re-renders
  useEffect(() => {
    if (!drawHandleRef) return;
    drawHandleRef.current = drawFrame;
    return () => {
      if (drawHandleRef.current === drawFrame) {
        drawHandleRef.current = null;
      }
    };
  }, [drawHandleRef, drawFrame]);

  // Redraw when discrete props, resize, or paused/prop-driven currentTimeSec change
  useEffect(() => {
    drawFrame(timeRef ? timeRef.current : currentTimeSec);
  }, [drawFrame, timeRef, currentTimeSec]);

  return (
    <div
      ref={containerRef}
      className="canvas-stage-contained relative flex-1 w-full min-h-0 overflow-hidden"
    >
      <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  );
});
