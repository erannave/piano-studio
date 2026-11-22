import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import { isPracticedHand, midiToStaffPosition } from "../shared/practiceEngine.ts";
import type { PracticeHandMode, SongMeasure, SongNote } from "../shared/types.ts";

interface LoopRange {
  start: number | null;
  end: number | null;
  active: boolean;
}

interface ScoreCanvasProps {
  notes: SongNote[];
  measures: SongMeasure[];
  currentTimeSec: number;
  timeRef?: Readonly<{ current: number }>;
  drawHandleRef?: MutableRefObject<((timeSec: number) => void) | null>;
  bpm: number;
  keySignatureFifths: number;
  timeSignature: { numerator: number; denominator: number };
  activeUserNotes: ReadonlySet<number>;
  waitingNotes: ReadonlySet<number>;
  practiceHand: PracticeHandMode;
  showNoteNames: boolean;
  loopRange: LoopRange;
}

// Sharp & flat staff positions (diatonic step relative to C4)
// Treble clef lines: E4(2), G4(4), B4(6), D5(8), F5(10)
const TREBLE_SHARP_STEPS = [10, 7, 11, 8, 5, 9, 6]; // F5, C5, G5, D5, A4, E5, B4
const TREBLE_FLAT_STEPS = [6, 9, 5, 8, 4, 7, 3]; // B4, E5, A4, D5, G4, C5, F4
// Bass clef lines: G2(-10), B2(-8), D3(-6), F3(-4), A3(-2)
const BASS_SHARP_STEPS = [-4, -7, -3, -6, -9, -5, -8]; // F3, C3, G3, D3, A2, E3, B2
const BASS_FLAT_STEPS = [-8, -5, -9, -6, -10, -7, -11]; // B2, E3, A2, D3, G2, C3, F2

const MAX_CANVAS_DPR = 2;

function findFirstIndexByTime<T extends { time: number }>(items: T[], targetTime: number): number {
  let lo = 0;
  let hi = items.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (items[mid]!.time < targetTime) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
}

export const ScoreCanvas = memo(function ScoreCanvas({
  notes,
  measures,
  currentTimeSec,
  timeRef,
  drawHandleRef,
  bpm,
  keySignatureFifths,
  timeSignature,
  activeUserNotes,
  waitingNotes,
  practiceHand,
  showNoteNames,
  loopRange,
}: ScoreCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bgCacheRef = useRef<HTMLCanvasElement | null>(null);
  const headerCacheRef = useRef<HTMLCanvasElement | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0, dpr: 1 });

  // Precompute staff positions once per song + key signature (avoids per-frame allocations)
  const noteStaffMeta = useMemo(() => {
    const positions = notes.map((note) =>
      midiToStaffPosition(note.midi, note.hand, keySignatureFifths),
    );
    let maxDuration = 0;
    for (let i = 0; i < notes.length; i++) {
      const d = notes[i]!.duration;
      if (d > maxDuration) maxDuration = d;
    }
    return { positions, maxDuration };
  }, [notes, keySignatureFifths]);

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

  // Precompute static layout metrics & offscreen background + fixed left header caches
  const layout = useMemo(() => {
    const { width: pixelW, height: pixelH, dpr } = canvasSize;
    const width = pixelW / dpr;
    const height = pixelH / dpr;

    const lineSpacing = Math.max(10, Math.min(16, Math.floor(height / 21)));
    const halfStep = lineSpacing / 2;
    const staffHeight = lineSpacing * 4;
    const staffGap = lineSpacing * 4.6;
    const totalGrandHeight = staffHeight * 2 + staffGap;
    const trebleTopY = Math.round((height - totalGrandHeight) / 2);
    const trebleBottomY = trebleTopY + staffHeight;
    const bassTopY = trebleBottomY + staffGap;
    const bassBottomY = bassTopY + staffHeight;

    const leftMargin = 22;
    const clefX = leftMargin + 10;
    const keySigCount = Math.min(7, Math.abs(keySignatureFifths));
    const keySigStartX = clefX + 44;
    const keySigWidth = keySigCount * 11;
    const timeSigX = keySigStartX + keySigWidth + 14;
    const headerRightX = timeSigX + 34;
    const playheadX = Math.max(headerRightX + 54, Math.round(width * 0.24));

    return {
      pixelW,
      pixelH,
      dpr,
      width,
      height,
      lineSpacing,
      halfStep,
      staffHeight,
      staffGap,
      totalGrandHeight,
      trebleTopY,
      trebleBottomY,
      bassTopY,
      bassBottomY,
      leftMargin,
      clefX,
      keySigStartX,
      timeSigX,
      headerRightX,
      playheadX,
    };
  }, [canvasSize, keySignatureFifths]);

  // Rebuild static offscreen caches only when dimensions, key signature, or time signature change
  useEffect(() => {
    const {
      pixelW,
      pixelH,
      dpr,
      width,
      height,
      lineSpacing,
      halfStep,
      trebleTopY,
      trebleBottomY,
      bassTopY,
      bassBottomY,
      leftMargin,
      clefX,
      keySigStartX,
      timeSigX,
      headerRightX,
    } = layout;
    if (pixelW <= 0 || pixelH <= 0) return;

    const diatonicToY = (diatonicFromC4: number, clef: "treble" | "bass"): number => {
      if (clef === "treble") {
        return trebleBottomY - (diatonicFromC4 - 2) * halfStep;
      }
      return bassTopY - (diatonicFromC4 - -2) * halfStep;
    };

    // 1. Static background cache: warm paper gradient + 5+5 grand staff lines
    const bgCache = bgCacheRef.current ?? document.createElement("canvas");
    bgCache.width = pixelW;
    bgCache.height = pixelH;
    bgCacheRef.current = bgCache;
    const bgCtx = bgCache.getContext("2d", { alpha: false });
    if (bgCtx) {
      bgCtx.save();
      bgCtx.scale(dpr, dpr);

      const bgGrad = bgCtx.createLinearGradient(0, 0, 0, height);
      bgGrad.addColorStop(0, "#fbfaf7");
      bgGrad.addColorStop(1, "#f3f1ec");
      bgCtx.fillStyle = bgGrad;
      bgCtx.fillRect(0, 0, width, height);

      bgCtx.strokeStyle = "#64748b";
      bgCtx.lineWidth = 1.1;
      bgCtx.beginPath();
      for (let i = 0; i < 5; i++) {
        const ty = trebleTopY + i * lineSpacing;
        bgCtx.moveTo(leftMargin, ty);
        bgCtx.lineTo(width, ty);

        const by = bassTopY + i * lineSpacing;
        bgCtx.moveTo(leftMargin, by);
        bgCtx.lineTo(width, by);
      }
      bgCtx.stroke();
      bgCtx.restore();
    }

    // 2. Fixed left header cache: opaque mask + staff lines + brace + clefs + key sig + time sig
    const headerPixelW = Math.max(1, Math.ceil((headerRightX + 2) * dpr));
    const headerCache = headerCacheRef.current ?? document.createElement("canvas");
    headerCache.width = headerPixelW;
    headerCache.height = pixelH;
    headerCacheRef.current = headerCache;
    const hCtx = headerCache.getContext("2d", { alpha: false });
    if (hCtx) {
      hCtx.save();
      hCtx.scale(dpr, dpr);

      hCtx.fillStyle = "#f7f5f0";
      hCtx.fillRect(0, 0, headerRightX + 2, height);

      hCtx.strokeStyle = "#64748b";
      hCtx.lineWidth = 1.1;
      hCtx.beginPath();
      for (let i = 0; i < 5; i++) {
        const ty = trebleTopY + i * lineSpacing;
        hCtx.moveTo(leftMargin, ty);
        hCtx.lineTo(headerRightX, ty);

        const by = bassTopY + i * lineSpacing;
        hCtx.moveTo(leftMargin, by);
        hCtx.lineTo(headerRightX, by);
      }
      hCtx.stroke();

      // Left vertical bar joining treble & bass staves
      hCtx.strokeStyle = "#1e293b";
      hCtx.lineWidth = 2.4;
      hCtx.beginPath();
      hCtx.moveTo(leftMargin, trebleTopY);
      hCtx.lineTo(leftMargin, bassBottomY);
      hCtx.stroke();

      // Subtle right divider of fixed header
      hCtx.strokeStyle = "rgba(100, 116, 139, 0.22)";
      hCtx.lineWidth = 1;
      hCtx.beginPath();
      hCtx.moveTo(headerRightX, trebleTopY - 12);
      hCtx.lineTo(headerRightX, bassBottomY + 12);
      hCtx.stroke();

      // Treble & Bass Clef glyphs (cached once, avoiding per-frame Unicode text shaping)
      hCtx.fillStyle = "#0f172a";
      hCtx.font = `${Math.round(lineSpacing * 5.2)}px "Bravura", "Noto Music", "Apple Symbols", "Segoe UI Symbol", serif`;
      hCtx.fillText("𝄞", clefX - 2, trebleBottomY + lineSpacing * 0.35);
      hCtx.font = `${Math.round(lineSpacing * 3.8)}px "Bravura", "Noto Music", "Apple Symbols", "Segoe UI Symbol", serif`;
      hCtx.fillText("𝄢", clefX, bassTopY + lineSpacing * 3.05);

      // Key signature accidentals on both staves
      if (keySignatureFifths !== 0) {
        const isSharp = keySignatureFifths > 0;
        const count = Math.min(7, Math.abs(keySignatureFifths));
        const glyph = isSharp ? "♯" : "♭";
        const tSteps = isSharp ? TREBLE_SHARP_STEPS : TREBLE_FLAT_STEPS;
        const bSteps = isSharp ? BASS_SHARP_STEPS : BASS_FLAT_STEPS;
        hCtx.fillStyle = "#0f172a";
        hCtx.font = `bold ${Math.round(lineSpacing * 1.25)}px ui-serif, Georgia, serif`;
        for (let i = 0; i < count; i++) {
          const kx = keySigStartX + i * 11;
          hCtx.fillText(glyph, kx, diatonicToY(tSteps[i]!, "treble") + lineSpacing * 0.4);
          hCtx.fillText(glyph, kx, diatonicToY(bSteps[i]!, "bass") + lineSpacing * 0.4);
        }
      }

      // Time signature numerals on both staves
      hCtx.fillStyle = "#0f172a";
      hCtx.font = `bold ${Math.round(lineSpacing * 2.05)}px ui-serif, Georgia, serif`;
      hCtx.textAlign = "center";
      hCtx.fillText(String(timeSignature.numerator), timeSigX + 8, trebleTopY + lineSpacing * 1.85);
      hCtx.fillText(
        String(timeSignature.denominator),
        timeSigX + 8,
        trebleTopY + lineSpacing * 3.85,
      );
      hCtx.fillText(String(timeSignature.numerator), timeSigX + 8, bassTopY + lineSpacing * 1.85);
      hCtx.fillText(String(timeSignature.denominator), timeSigX + 8, bassTopY + lineSpacing * 3.85);
      hCtx.textAlign = "start";

      hCtx.restore();
    }
  }, [layout, keySignatureFifths, timeSignature]);

  const drawFrame = useCallback(
    (timeSec: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) return;

      const {
        pixelW,
        pixelH,
        dpr,
        width,
        height,
        lineSpacing,
        halfStep,
        totalGrandHeight,
        trebleTopY,
        trebleBottomY,
        bassTopY,
        bassBottomY,
        headerRightX,
        playheadX,
      } = layout;
      if (pixelW <= 0 || pixelH <= 0) return;

      // Blit cached paper background + staff lines
      const bgCache = bgCacheRef.current;
      if (bgCache && bgCache.width === pixelW && bgCache.height === pixelH) {
        ctx.drawImage(bgCache, 0, 0);
      } else {
        ctx.fillStyle = "#fbfaf7";
        ctx.fillRect(0, 0, pixelW, pixelH);
      }

      const diatonicToY = (diatonicFromC4: number, clef: "treble" | "bass"): number => {
        if (clef === "treble") {
          return trebleBottomY - (diatonicFromC4 - 2) * halfStep;
        }
        return bassTopY - (diatonicFromC4 - -2) * halfStep;
      };

      const beatSec = 60 / Math.max(40, Math.min(240, bpm || 100));
      const pxPerSec = Math.max(115, Math.min(210, 96 / beatSec));
      const timeToX = (t: number) => playheadX + (t - timeSec) * pxPerSec;

      ctx.save();
      ctx.scale(dpr, dpr);

      // 1. Draw Loop Region shading behind staff
      if (loopRange.start !== null || loopRange.end !== null) {
        const lx1 =
          loopRange.start !== null
            ? Math.max(headerRightX, timeToX(loopRange.start))
            : headerRightX;
        const lx2 = loopRange.end !== null ? Math.min(width, timeToX(loopRange.end)) : width;
        if (lx2 > lx1 && loopRange.start !== null && loopRange.end !== null) {
          ctx.fillStyle = loopRange.active
            ? "rgba(14, 165, 233, 0.11)"
            : "rgba(148, 163, 184, 0.08)";
          ctx.fillRect(
            lx1,
            trebleTopY - lineSpacing * 2,
            lx2 - lx1,
            totalGrandHeight + lineSpacing * 4,
          );
        }
        // Loop boundary markers
        for (const [label, t] of [
          ["A", loopRange.start],
          ["B", loopRange.end],
        ] as const) {
          if (t === null) continue;
          const mx = timeToX(t);
          if (mx < headerRightX || mx > width) continue;
          ctx.strokeStyle = loopRange.active ? "#0284c7" : "#64748b";
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 4]);
          ctx.beginPath();
          ctx.moveTo(mx, trebleTopY - lineSpacing * 2);
          ctx.lineTo(mx, bassBottomY + lineSpacing * 2);
          ctx.stroke();
          ctx.setLineDash([]);

          ctx.fillStyle = loopRange.active ? "#0284c7" : "#64748b";
          ctx.font = "bold 11px ui-sans-serif, system-ui, sans-serif";
          ctx.fillText(label, mx + 4, trebleTopY - lineSpacing * 1.1);
        }
      }

      // 2. Clip to scrolling music region
      ctx.save();
      ctx.beginPath();
      ctx.rect(headerRightX, 0, width - headerRightX, height);
      ctx.clip();

      // 3. Measures / Barlines (binary-searched + batched barline path)
      const minMeasureSec = timeSec - (playheadX - headerRightX + 20) / pxPerSec;
      const maxMeasureSec = timeSec + (width - playheadX + 20) / pxPerSec;
      const firstMeasureIdx = findFirstIndexByTime(measures, minMeasureSec);

      ctx.strokeStyle = "rgba(71, 85, 105, 0.45)";
      ctx.lineWidth = 1.25;
      ctx.fillStyle = "#64748b";
      ctx.font = "600 11px ui-monospace, SFMono-Regular, monospace";
      ctx.beginPath();
      for (let i = firstMeasureIdx; i < measures.length; i++) {
        const m = measures[i]!;
        if (m.time > maxMeasureSec) break;
        const x = timeToX(m.time);
        ctx.moveTo(x, trebleTopY);
        ctx.lineTo(x, bassBottomY);
        ctx.fillText(String(m.number), x + 4, trebleTopY - 8);
      }
      ctx.stroke();

      // 4. Playhead line
      const playheadGrad = ctx.createLinearGradient(playheadX - 18, 0, playheadX + 18, 0);
      playheadGrad.addColorStop(0, "rgba(14, 165, 233, 0)");
      playheadGrad.addColorStop(
        0.5,
        waitingNotes.size > 0 ? "rgba(245, 158, 11, 0.22)" : "rgba(14, 165, 233, 0.16)",
      );
      playheadGrad.addColorStop(1, "rgba(14, 165, 233, 0)");
      ctx.fillStyle = playheadGrad;
      ctx.fillRect(
        playheadX - 18,
        trebleTopY - lineSpacing * 2.5,
        36,
        totalGrandHeight + lineSpacing * 5,
      );

      ctx.strokeStyle = waitingNotes.size > 0 ? "#d97706" : "#0284c7";
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(playheadX, trebleTopY - lineSpacing * 2.2);
      ctx.lineTo(playheadX, bassBottomY + lineSpacing * 2.2);
      ctx.stroke();

      // 5. Draw Notes on Grand Staff (binary-searched window, precomputed staff positions)
      const minVisibleSec = timeSec - (playheadX - headerRightX) / pxPerSec - 1.5;
      const maxVisibleSec = timeSec + (width - playheadX) / pxPerSec + 1.0;
      const firstNoteIdx = findFirstIndexByTime(notes, minVisibleSec - noteStaffMeta.maxDuration);

      const rx = lineSpacing * 0.56;
      const ry = lineSpacing * 0.42;
      const accidentalFont = `bold ${Math.round(lineSpacing * 1.15)}px ui-serif, Georgia, serif`;
      const labelFont = "bold 10px ui-sans-serif, system-ui, sans-serif";
      const stemLen = lineSpacing * 2.8;

      for (let i = firstNoteIdx; i < notes.length; i++) {
        const note = notes[i]!;
        if (note.time > maxVisibleSec) break;
        const noteEnd = note.time + note.duration;
        if (noteEnd < minVisibleSec) continue;

        const x = timeToX(note.time);
        const tailW = Math.max(0, note.duration * pxPerSec - rx * 1.4);
        const pos = noteStaffMeta.positions[i]!;
        const y = diatonicToY(pos.diatonicFromC4, pos.clef);

        const practiced = isPracticedHand(note.hand, practiceHand);
        const isActiveNow = note.time <= timeSec && noteEnd >= timeSec;
        const isMatched = isActiveNow && activeUserNotes.has(note.midi);
        const isWaitingTarget = waitingNotes.has(note.midi) && Math.abs(note.time - timeSec) < 0.08;
        const isPast = noteEnd < timeSec - 0.04;

        let fill: string;
        let tailColor: string;
        if (isMatched) {
          fill = "#059669";
          tailColor = "rgba(5, 150, 105, 0.32)";
        } else if (isWaitingTarget) {
          fill = "#d97706";
          tailColor = "rgba(217, 119, 6, 0.36)";
        } else if (!practiced) {
          fill = "rgba(100, 116, 139, 0.32)";
          tailColor = "rgba(148, 163, 184, 0.16)";
        } else if (note.hand === "left") {
          fill = isPast ? "rgba(79, 70, 229, 0.42)" : isActiveNow ? "#4338ca" : "#4f46e5";
          tailColor = isPast ? "rgba(79, 70, 229, 0.12)" : "rgba(99, 102, 241, 0.24)";
        } else {
          fill = isPast ? "rgba(2, 132, 199, 0.42)" : isActiveNow ? "#0369a1" : "#0284c7";
          tailColor = isPast ? "rgba(2, 132, 199, 0.12)" : "rgba(14, 165, 233, 0.24)";
        }

        // Duration tail
        if (tailW > 4) {
          ctx.fillStyle = tailColor;
          ctx.beginPath();
          ctx.roundRect(x + rx * 0.4, y - ry * 0.55, tailW, ry * 1.1, ry * 0.55);
          ctx.fill();
        }

        // Ledger lines (batched per note)
        const needsLedger =
          pos.clef === "treble"
            ? pos.diatonicFromC4 <= 0 || pos.diatonicFromC4 >= 12
            : pos.diatonicFromC4 >= 0 || pos.diatonicFromC4 <= -12;
        if (needsLedger) {
          ctx.strokeStyle = practiced ? "#334155" : "rgba(100, 116, 139, 0.4)";
          ctx.lineWidth = 1.25;
          ctx.beginPath();
          if (pos.clef === "treble") {
            for (let step = 0; step >= pos.diatonicFromC4; step -= 2) {
              const ly = diatonicToY(step, "treble");
              ctx.moveTo(x - rx - 4, ly);
              ctx.lineTo(x + rx + 4, ly);
            }
            for (let step = 12; step <= pos.diatonicFromC4; step += 2) {
              const ly = diatonicToY(step, "treble");
              ctx.moveTo(x - rx - 4, ly);
              ctx.lineTo(x + rx + 4, ly);
            }
          } else {
            for (let step = 0; step <= pos.diatonicFromC4; step += 2) {
              const ly = diatonicToY(step, "bass");
              ctx.moveTo(x - rx - 4, ly);
              ctx.lineTo(x + rx + 4, ly);
            }
            for (let step = -12; step >= pos.diatonicFromC4; step -= 2) {
              const ly = diatonicToY(step, "bass");
              ctx.moveTo(x - rx - 4, ly);
              ctx.lineTo(x + rx + 4, ly);
            }
          }
          ctx.stroke();
        }

        // Accidental symbol to the left of the notehead
        if (pos.accidental) {
          ctx.fillStyle = fill;
          ctx.font = accidentalFont;
          const glyph = pos.accidental === "sharp" ? "♯" : pos.accidental === "flat" ? "♭" : "♮";
          ctx.fillText(glyph, x - rx - 11, y + lineSpacing * 0.36);
        }

        // Waiting halo ring
        if (isWaitingTarget) {
          ctx.strokeStyle = "rgba(217, 119, 6, 0.55)";
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(x, y, rx + 5, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Notehead (tilted ellipse without save/translate/rotate/restore overhead)
        const isHollow = note.duration >= beatSec * 1.75;
        ctx.beginPath();
        ctx.ellipse(x, y, rx, ry, -0.32, 0, Math.PI * 2);
        if (isHollow) {
          ctx.fillStyle = "#fbfaf7";
          ctx.fill();
          ctx.strokeStyle = fill;
          ctx.lineWidth = 2.3;
          ctx.stroke();
        } else {
          ctx.fillStyle = fill;
          ctx.fill();
        }

        // Stem (skip for whole notes >= 3.5 beats)
        if (note.duration < beatSec * 3.5) {
          const stemUp = pos.clef === "treble" ? pos.diatonicFromC4 < 6 : pos.diatonicFromC4 < -6;
          ctx.strokeStyle = fill;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          if (stemUp) {
            ctx.moveTo(x + rx - 0.8, y);
            ctx.lineTo(x + rx - 0.8, y - stemLen);
          } else {
            ctx.moveTo(x - rx + 0.8, y);
            ctx.lineTo(x - rx + 0.8, y + stemLen);
          }
          ctx.stroke();
        }

        // Optional note name label
        if (showNoteNames && practiced && !isPast) {
          ctx.fillStyle = "#0f172a";
          ctx.font = labelFont;
          ctx.textAlign = "center";
          ctx.fillText(pos.label, x, y - ry - 4);
          ctx.textAlign = "start";
        }
      }

      // 6. Live user MIDI notes rendered at the playhead
      if (activeUserNotes.size > 0) {
        ctx.fillStyle = "rgba(245, 158, 11, 0.35)";
        ctx.strokeStyle = "#d97706";
        ctx.lineWidth = 2;
        for (const midi of activeUserNotes) {
          const hand = midi < 60 ? "left" : "right";
          const pos = midiToStaffPosition(midi, hand, keySignatureFifths);
          const y = diatonicToY(pos.diatonicFromC4, pos.clef);
          ctx.beginPath();
          ctx.arc(playheadX, y, rx * 0.9, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }

      ctx.restore(); // end scrolling clip
      ctx.restore(); // end dpr scale

      // 7. Blit cached Fixed Left Header in 1:1 device pixels
      const headerCache = headerCacheRef.current;
      if (headerCache && headerCache.height === pixelH) {
        ctx.drawImage(headerCache, 0, 0);
      }
    },
    [
      layout,
      notes,
      measures,
      noteStaffMeta,
      bpm,
      keySignatureFifths,
      activeUserNotes,
      waitingNotes,
      practiceHand,
      showNoteNames,
      loopRange,
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
      className="canvas-stage-contained relative flex-1 w-full min-h-0 overflow-hidden select-none"
    >
      <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  );
});
