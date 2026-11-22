import { useEffect, useRef, useState } from "react";
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

export function ScoreCanvas({
  notes,
  measures,
  currentTimeSec,
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
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.floor(rect.width * dpr));
      const h = Math.max(1, Math.floor(rect.height * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      setCanvasSize({ width: w, height: h });
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

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

    // Clean warm paper background for high-contrast sight-reading
    const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
    bgGrad.addColorStop(0, "#fbfaf7");
    bgGrad.addColorStop(1, "#f3f1ec");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // Staff vertical geometry scaled cleanly to container height
    const lineSpacing = Math.max(10, Math.min(16, Math.floor(height / 21)));
    const halfStep = lineSpacing / 2;
    const staffHeight = lineSpacing * 4;
    const staffGap = lineSpacing * 4.6; // room for Middle C + ledger lines between staves
    const totalGrandHeight = staffHeight * 2 + staffGap;
    const trebleTopY = Math.round((height - totalGrandHeight) / 2);
    const trebleBottomY = trebleTopY + staffHeight; // E4 (diatonic +2)
    const bassTopY = trebleBottomY + staffGap; // A3 (diatonic -2)
    const bassBottomY = bassTopY + staffHeight; // G2 (diatonic -10)

    const diatonicToY = (diatonicFromC4: number, clef: "treble" | "bass"): number => {
      if (clef === "treble") {
        // E4 is diatonicFromC4 === 2 and sits on trebleBottomY
        return trebleBottomY - (diatonicFromC4 - 2) * halfStep;
      }
      // A3 is diatonicFromC4 === -2 and sits on bassTopY
      return bassTopY - (diatonicFromC4 - -2) * halfStep;
    };

    // Header layout: Clef + Key Signature + Time Signature on the left, scrolling music to the right
    const leftMargin = 22;
    const clefX = leftMargin + 10;
    const keySigCount = Math.min(7, Math.abs(keySignatureFifths));
    const keySigStartX = clefX + 44;
    const keySigWidth = keySigCount * 11;
    const timeSigX = keySigStartX + keySigWidth + 14;
    const headerRightX = timeSigX + 34;
    const playheadX = Math.max(headerRightX + 54, Math.round(width * 0.24));

    // Horizontal scrolling scale: ~150 px per second, scaled slightly with BPM so spacing stays comfortable
    const beatSec = 60 / Math.max(40, Math.min(240, bpm || 100));
    const pxPerSec = Math.max(115, Math.min(210, 96 / beatSec));
    const timeToX = (t: number) => playheadX + (t - currentTimeSec) * pxPerSec;

    // 1. Draw Loop Region shading behind staff
    if (loopRange.start !== null || loopRange.end !== null) {
      const lx1 =
        loopRange.start !== null ? Math.max(headerRightX, timeToX(loopRange.start)) : headerRightX;
      const lx2 = loopRange.end !== null ? Math.min(width, timeToX(loopRange.end)) : width;
      if (lx2 > lx1 && loopRange.start !== null && loopRange.end !== null) {
        ctx.fillStyle = loopRange.active ? "rgba(14, 165, 233, 0.11)" : "rgba(148, 163, 184, 0.08)";
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

    // 2. Draw Grand Staff 5+5 lines
    ctx.strokeStyle = "#64748b";
    ctx.lineWidth = 1.1;
    for (let i = 0; i < 5; i++) {
      const ty = trebleTopY + i * lineSpacing;
      ctx.beginPath();
      ctx.moveTo(leftMargin, ty);
      ctx.lineTo(width, ty);
      ctx.stroke();

      const by = bassTopY + i * lineSpacing;
      ctx.beginPath();
      ctx.moveTo(leftMargin, by);
      ctx.lineTo(width, by);
      ctx.stroke();
    }

    // 3. Draw Measures / Barlines (clipped to scrolling area)
    ctx.save();
    ctx.beginPath();
    ctx.rect(headerRightX, 0, width - headerRightX, height);
    ctx.clip();

    for (const m of measures) {
      const x = timeToX(m.time);
      if (x < headerRightX - 20 || x > width + 20) continue;

      ctx.strokeStyle = "rgba(71, 85, 105, 0.45)";
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.moveTo(x, trebleTopY);
      ctx.lineTo(x, bassBottomY);
      ctx.stroke();

      // Measure number above treble staff
      ctx.fillStyle = "#64748b";
      ctx.font = "600 11px ui-monospace, SFMono-Regular, monospace";
      ctx.fillText(String(m.number), x + 4, trebleTopY - 8);
    }

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

    // 5. Draw Notes on Grand Staff
    const minVisibleSec = currentTimeSec - (playheadX - headerRightX) / pxPerSec - 1.5;
    const maxVisibleSec = currentTimeSec + (width - playheadX) / pxPerSec + 1.0;

    const rx = lineSpacing * 0.56;
    const ry = lineSpacing * 0.42;

    for (const note of notes) {
      const noteEnd = note.time + note.duration;
      if (noteEnd < minVisibleSec || note.time > maxVisibleSec) continue;

      const x = timeToX(note.time);
      const tailW = Math.max(0, note.duration * pxPerSec - rx * 1.4);
      const pos = midiToStaffPosition(note.midi, note.hand, keySignatureFifths);
      const y = diatonicToY(pos.diatonicFromC4, pos.clef);

      const practiced = isPracticedHand(note.hand, practiceHand);
      const isActiveNow = note.time <= currentTimeSec && noteEnd >= currentTimeSec;
      const isMatched = isActiveNow && activeUserNotes.has(note.midi);
      const isWaitingTarget =
        waitingNotes.has(note.midi) && Math.abs(note.time - currentTimeSec) < 0.08;
      const isPast = noteEnd < currentTimeSec - 0.04;

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

      // Duration tail (Sheet-Hero style rhythm bar so note length is immediately readable)
      if (tailW > 4) {
        ctx.fillStyle = tailColor;
        ctx.beginPath();
        ctx.roundRect(x + rx * 0.4, y - ry * 0.55, tailW, ry * 1.1, ry * 0.55);
        ctx.fill();
      }

      // Ledger lines if outside the 5-line staff
      ctx.strokeStyle = practiced ? "#334155" : "rgba(100, 116, 139, 0.4)";
      ctx.lineWidth = 1.25;
      if (pos.clef === "treble") {
        // Below E4 (2): C4(0), A3(-2), ...
        for (let step = 0; step >= pos.diatonicFromC4; step -= 2) {
          const ly = diatonicToY(step, "treble");
          ctx.beginPath();
          ctx.moveTo(x - rx - 4, ly);
          ctx.lineTo(x + rx + 4, ly);
          ctx.stroke();
        }
        // Above F5 (10): A5(12), C6(14), ...
        for (let step = 12; step <= pos.diatonicFromC4; step += 2) {
          const ly = diatonicToY(step, "treble");
          ctx.beginPath();
          ctx.moveTo(x - rx - 4, ly);
          ctx.lineTo(x + rx + 4, ly);
          ctx.stroke();
        }
      } else {
        // Above A3 (-2): C4(0), E4(2), ...
        for (let step = 0; step <= pos.diatonicFromC4; step += 2) {
          const ly = diatonicToY(step, "bass");
          ctx.beginPath();
          ctx.moveTo(x - rx - 4, ly);
          ctx.lineTo(x + rx + 4, ly);
          ctx.stroke();
        }
        // Below G2 (-10): E2(-12), C2(-14), ...
        for (let step = -12; step >= pos.diatonicFromC4; step -= 2) {
          const ly = diatonicToY(step, "bass");
          ctx.beginPath();
          ctx.moveTo(x - rx - 4, ly);
          ctx.lineTo(x + rx + 4, ly);
          ctx.stroke();
        }
      }

      // Accidental symbol to the left of the notehead when differing from key signature
      if (pos.accidental) {
        ctx.fillStyle = fill;
        ctx.font = `bold ${Math.round(lineSpacing * 1.15)}px ui-serif, Georgia, serif`;
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

      // Notehead (tilted ellipse; hollow for >= 1.75 beats, filled otherwise)
      const isHollow = note.duration >= beatSec * 1.75;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-0.32);
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
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
      ctx.restore();

      // Stem (skip for whole notes >= 3.5 beats)
      if (note.duration < beatSec * 3.5) {
        const stemUp = pos.clef === "treble" ? pos.diatonicFromC4 < 6 : pos.diatonicFromC4 < -6;
        const stemLen = lineSpacing * 2.8;
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
        ctx.font = "bold 10px ui-sans-serif, system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(pos.label, x, y - ry - 4);
        ctx.textAlign = "start";
      }
    }

    // 6. Live user MIDI notes rendered at the playhead
    for (const midi of activeUserNotes) {
      const hand = midi < 60 ? "left" : "right";
      const pos = midiToStaffPosition(midi, hand, keySignatureFifths);
      const y = diatonicToY(pos.diatonicFromC4, pos.clef);
      ctx.save();
      ctx.beginPath();
      ctx.arc(playheadX, y, rx * 0.9, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(245, 158, 11, 0.35)";
      ctx.fill();
      ctx.strokeStyle = "#d97706";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore(); // end scrolling clip

    // 7. Fixed Left Header (opaque mask + Grand Staff Brace + Clefs + Key Signature + Time Signature)
    ctx.fillStyle = "#f7f5f0";
    ctx.fillRect(0, 0, headerRightX, height);

    // Re-draw crisp staff lines inside header
    ctx.strokeStyle = "#64748b";
    ctx.lineWidth = 1.1;
    for (let i = 0; i < 5; i++) {
      const ty = trebleTopY + i * lineSpacing;
      ctx.beginPath();
      ctx.moveTo(leftMargin, ty);
      ctx.lineTo(headerRightX, ty);
      ctx.stroke();

      const by = bassTopY + i * lineSpacing;
      ctx.beginPath();
      ctx.moveTo(leftMargin, by);
      ctx.lineTo(headerRightX, by);
      ctx.stroke();
    }

    // Left vertical bar joining treble & bass staves
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(leftMargin, trebleTopY);
    ctx.lineTo(leftMargin, bassBottomY);
    ctx.stroke();

    // Subtle right divider of fixed header
    ctx.strokeStyle = "rgba(100, 116, 139, 0.22)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(headerRightX, trebleTopY - 12);
    ctx.lineTo(headerRightX, bassBottomY + 12);
    ctx.stroke();

    // Treble & Bass Clef glyphs
    ctx.fillStyle = "#0f172a";
    ctx.font = `${Math.round(lineSpacing * 5.2)}px "Bravura", "Noto Music", "Apple Symbols", "Segoe UI Symbol", serif`;
    ctx.fillText("𝄞", clefX - 2, trebleBottomY + lineSpacing * 0.35);
    ctx.font = `${Math.round(lineSpacing * 3.8)}px "Bravura", "Noto Music", "Apple Symbols", "Segoe UI Symbol", serif`;
    ctx.fillText("𝄢", clefX, bassTopY + lineSpacing * 3.05);

    // Key signature accidentals on both staves
    if (keySignatureFifths !== 0) {
      const isSharp = keySignatureFifths > 0;
      const count = Math.min(7, Math.abs(keySignatureFifths));
      const glyph = isSharp ? "♯" : "♭";
      const tSteps = isSharp ? TREBLE_SHARP_STEPS : TREBLE_FLAT_STEPS;
      const bSteps = isSharp ? BASS_SHARP_STEPS : BASS_FLAT_STEPS;
      ctx.fillStyle = "#0f172a";
      ctx.font = `bold ${Math.round(lineSpacing * 1.25)}px ui-serif, Georgia, serif`;
      for (let i = 0; i < count; i++) {
        const kx = keySigStartX + i * 11;
        ctx.fillText(glyph, kx, diatonicToY(tSteps[i]!, "treble") + lineSpacing * 0.4);
        ctx.fillText(glyph, kx, diatonicToY(bSteps[i]!, "bass") + lineSpacing * 0.4);
      }
    }

    // Time signature numerals on both staves
    ctx.fillStyle = "#0f172a";
    ctx.font = `bold ${Math.round(lineSpacing * 2.05)}px ui-serif, Georgia, serif`;
    ctx.textAlign = "center";
    ctx.fillText(String(timeSignature.numerator), timeSigX + 8, trebleTopY + lineSpacing * 1.85);
    ctx.fillText(String(timeSignature.denominator), timeSigX + 8, trebleTopY + lineSpacing * 3.85);
    ctx.fillText(String(timeSignature.numerator), timeSigX + 8, bassTopY + lineSpacing * 1.85);
    ctx.fillText(String(timeSignature.denominator), timeSigX + 8, bassTopY + lineSpacing * 3.85);
    ctx.textAlign = "start";

    ctx.restore();
  }, [
    notes,
    measures,
    currentTimeSec,
    bpm,
    keySignatureFifths,
    timeSignature,
    activeUserNotes,
    waitingNotes,
    practiceHand,
    showNoteNames,
    loopRange,
    canvasSize,
  ]);

  return (
    <div ref={containerRef} className="relative flex-1 w-full min-h-0 overflow-hidden select-none">
      <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  );
}
