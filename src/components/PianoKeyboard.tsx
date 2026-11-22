import { useMemo } from "react";
import { computeKeyLayout } from "../shared/keyboardRange.ts";

interface PianoKeyboardProps {
  minNote: number;
  maxNote: number;
  activeUserNotes: ReadonlySet<number>;
  activeSongNotes: ReadonlySet<number>;
  highlightRange?: { low: number | null; high: number | null };
  heightClass?: string;
}

export function PianoKeyboard({
  minNote,
  maxNote,
  activeUserNotes,
  activeSongNotes,
  highlightRange,
  heightClass = "h-44",
}: PianoKeyboardProps) {
  const keys = useMemo(() => computeKeyLayout(minNote, maxNote), [minNote, maxNote]);
  const whiteKeys = useMemo(() => keys.filter((k) => !k.isBlack), [keys]);
  const blackKeys = useMemo(() => keys.filter((k) => k.isBlack), [keys]);

  const getKeyVisual = (midi: number, isBlack: boolean) => {
    const isUser = activeUserNotes.has(midi);
    const isSong = activeSongNotes.has(midi);
    const isRangeMarker =
      highlightRange && (highlightRange.low === midi || highlightRange.high === midi);

    if (isRangeMarker) {
      return isBlack
        ? "bg-violet-400 border-violet-200 shadow-[0_0_16px_rgba(167,139,250,0.85)]"
        : "bg-violet-300 border-violet-500 shadow-[inset_0_-8px_16px_rgba(109,40,217,0.4)]";
    }
    if (isUser && isSong) {
      return isBlack
        ? "bg-emerald-400 border-emerald-200 shadow-[0_0_18px_rgba(52,211,153,0.9)]"
        : "bg-emerald-400 border-emerald-600 shadow-[inset_0_-10px_18px_rgba(5,150,105,0.45)]";
    }
    if (isUser) {
      return isBlack
        ? "bg-amber-400 border-amber-200 shadow-[0_0_16px_rgba(251,191,36,0.85)]"
        : "bg-amber-300 border-amber-500 shadow-[inset_0_-10px_18px_rgba(217,119,6,0.4)]";
    }
    if (isSong) {
      return isBlack
        ? "bg-sky-400 border-sky-200 shadow-[0_0_16px_rgba(56,189,248,0.85)]"
        : "bg-sky-300 border-sky-500 shadow-[inset_0_-10px_18px_rgba(2,132,199,0.38)]";
    }

    return isBlack
      ? "bg-slate-900 border-slate-700 shadow-[0_4px_6px_rgba(0,0,0,0.65)]"
      : "bg-slate-50 border-slate-300 shadow-[inset_0_-4px_6px_rgba(15,23,42,0.12)]";
  };

  return (
    <div className={`relative w-full ${heightClass} bg-slate-950 border-t-2 border-slate-700 shrink-0 overflow-hidden`}>
      {/* White keys */}
      {whiteKeys.map((key) => {
        const isC = key.midi % 12 === 0;
        const isMiddleC = key.midi === 60;
        const visual = getKeyVisual(key.midi, false);

        return (
          <div
            key={key.midi}
            style={{
              left: `${key.x * 100}%`,
              width: `${key.width * 100}%`,
            }}
            className={`absolute top-0 bottom-0 border-r border-b rounded-b-md transition-colors duration-75 flex flex-col items-center justify-end pb-2 ${visual}`}
          >
            {isMiddleC && (
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 mb-1 shadow-sm" title="Middle C (C4)" />
            )}
            {isC && (
              <span
                className={`text-xs font-bold tracking-tight leading-none ${
                  isMiddleC ? "text-rose-600" : "text-slate-500"
                }`}
              >
                {key.name}
              </span>
            )}
          </div>
        );
      })}

      {/* Black keys */}
      {blackKeys.map((key) => {
        const visual = getKeyVisual(key.midi, true);
        return (
          <div
            key={key.midi}
            style={{
              left: `${key.x * 100}%`,
              width: `${key.width * 100}%`,
            }}
            className={`absolute top-0 h-[62%] z-10 border rounded-b-md transition-colors duration-75 ${visual}`}
          />
        );
      })}
    </div>
  );
}
