import { useEffect, useMemo, useRef } from "react";
import { computeKeyLayout } from "../shared/keyboardRange.ts";
import type { SongNote } from "../shared/types.ts";

interface FallingNotesCanvasProps {
  notes: SongNote[];
  currentTimeSec: number;
  minNote: number;
  maxNote: number;
  activeUserNotes: ReadonlySet<number>;
  lookAheadSec?: number;
}

export function FallingNotesCanvas({
  notes,
  currentTimeSec,
  minNote,
  maxNote,
  activeUserNotes,
  lookAheadSec = 3.2,
}: FallingNotesCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const keyMap = useMemo(() => {
    const layout = computeKeyLayout(minNote, maxNote);
    const map = new Map(layout.map((k) => [k.midi, k]));
    return { layout, map };
  }, [minNote, maxNote]);

  // Keep canvas sized crisply to container with devicePixelRatio
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Draw frame whenever playback time, notes, range, or live user input updates
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;

    ctx.save();
    ctx.scale(dpr, dpr);

    // Background gradient
    const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
    bgGrad.addColorStop(0, "#020617");
    bgGrad.addColorStop(1, "#0f172a");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // Vertical lane guides on C keys & subtle black-key lanes
    for (const key of keyMap.layout) {
      const x = key.x * width;
      const w = key.width * width;
      if (key.isBlack) {
        ctx.fillStyle = "rgba(15, 23, 42, 0.45)";
        ctx.fillRect(x, 0, w, height);
      } else if (key.midi % 12 === 0) {
        ctx.strokeStyle = key.midi === 60 ? "rgba(244, 63, 94, 0.35)" : "rgba(148, 163, 184, 0.14)";
        ctx.lineWidth = key.midi === 60 ? 1.5 : 1;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
    }

    // Horizontal beat/second reference lines scrolling down
    const pxPerSec = height / lookAheadSec;
    const firstSec = Math.floor(currentTimeSec);
    const lastSec = Math.ceil(currentTimeSec + lookAheadSec);
    ctx.strokeStyle = "rgba(148, 163, 184, 0.08)";
    ctx.lineWidth = 1;
    for (let s = firstSec; s <= lastSec; s++) {
      const y = height - (s - currentTimeSec) * pxPerSec;
      if (y >= 0 && y <= height) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
    }

    // Draw falling note bars
    const windowStart = currentTimeSec - 0.15;
    const windowEnd = currentTimeSec + lookAheadSec;

    for (const note of notes) {
      const noteEnd = note.time + note.duration;
      if (noteEnd < windowStart || note.time > windowEnd) continue;

      const key = keyMap.map.get(note.midi);
      if (!key) continue;

      const x = key.x * width + 1.5;
      const w = Math.max(4, key.width * width - 3);
      const yBottom = height - (note.time - currentTimeSec) * pxPerSec;
      const yTop = height - (noteEnd - currentTimeSec) * pxPerSec;
      const barH = Math.max(8, yBottom - yTop);

      const isActiveNow = note.time <= currentTimeSec && noteEnd >= currentTimeSec;
      const isMatched = isActiveNow && activeUserNotes.has(note.midi);

      let fill: string;
      let stroke: string;
      if (isMatched) {
        fill = "#34d399";
        stroke = "#a7f3d0";
      } else if (note.track === 1) {
        // Left hand track
        fill = isActiveNow ? "#818cf8" : key.isBlack ? "#4f46e5" : "#6366f1";
        stroke = "#c7d2fe";
      } else {
        // Right hand / primary track
        fill = isActiveNow ? "#38bdf8" : key.isBlack ? "#0284c7" : "#0ea5e9";
        stroke = "#bae6fd";
      }

      const radius = Math.min(6, w / 2, barH / 2);
      ctx.beginPath();
      ctx.roundRect(x, yTop, w, barH, radius);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = stroke;
      ctx.lineWidth = isActiveNow ? 2 : 1;
      ctx.stroke();
    }

    // Hit line right above the keyboard
    ctx.fillStyle = "rgba(56, 189, 248, 0.6)";
    ctx.fillRect(0, height - 3, width, 3);

    ctx.restore();
  }, [notes, currentTimeSec, keyMap, activeUserNotes, lookAheadSec]);

  return (
    <div ref={containerRef} className="relative flex-1 w-full min-h-0 overflow-hidden">
      <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  );
}
