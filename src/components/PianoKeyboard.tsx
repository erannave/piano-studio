import { memo, useMemo } from "react";
import { computeKeyLayout } from "../shared/keyboardRange.ts";

interface PianoKeyboardProps {
  minNote: number;
  maxNote: number;
  activeUserNotes: ReadonlySet<number>;
  activeSongNotes: ReadonlySet<number>;
  waitingNotes?: ReadonlySet<number>;
  sustainPedalDown?: boolean;
  highlightRange?: { low: number | null; high: number | null };
  heightClass?: string;
  onKeyDown?: (midi: number) => void;
  onKeyUp?: (midi: number) => void;
}

export const PianoKeyboard = memo(function PianoKeyboard({
  minNote,
  maxNote,
  activeUserNotes,
  activeSongNotes,
  waitingNotes,
  sustainPedalDown = false,
  highlightRange,
  heightClass = "h-44",
  onKeyDown,
  onKeyUp,
}: PianoKeyboardProps) {
  const keys = useMemo(() => computeKeyLayout(minNote, maxNote), [minNote, maxNote]);
  const whiteKeys = useMemo(() => keys.filter((k) => !k.isBlack), [keys]);
  const blackKeys = useMemo(() => keys.filter((k) => k.isBlack), [keys]);

  const getKeyVisual = (midi: number, isBlack: boolean) => {
    const isUser = activeUserNotes.has(midi);
    const isSong = activeSongNotes.has(midi);
    const isWaiting = Boolean(waitingNotes?.has(midi));
    const isRangeMarker =
      highlightRange && (highlightRange.low === midi || highlightRange.high === midi);

    if (isRangeMarker) {
      return isBlack ? "bg-violet-400 border-violet-200" : "bg-violet-300 border-violet-500";
    }
    if (isUser && (isSong || isWaiting)) {
      return isBlack ? "bg-emerald-400 border-emerald-200" : "bg-emerald-400 border-emerald-600";
    }
    if (isWaiting) {
      return isBlack
        ? "bg-amber-400 border-amber-100 pulse-motion"
        : "bg-amber-300 border-amber-500 pulse-motion";
    }
    if (isUser) {
      return isBlack ? "bg-amber-400 border-amber-200" : "bg-amber-300 border-amber-500";
    }
    if (isSong) {
      return isBlack ? "bg-sky-400 border-sky-200" : "bg-sky-300 border-sky-500";
    }

    return isBlack ? "bg-slate-900 border-slate-700" : "bg-slate-50 border-slate-300";
  };

  const interactiveCls = onKeyDown ? "cursor-pointer select-none" : "select-none";

  return (
    <div
      className={`piano-keyboard-contained relative w-full ${heightClass} bg-slate-950 border-t-2 border-slate-700 shrink-0 overflow-hidden`}
    >
      {/* Sustain pedal indicator */}
      {sustainPedalDown && (
        <div className="absolute top-1.5 right-3 z-20 px-2.5 py-0.5 rounded-full bg-amber-500/90 text-slate-950 text-[11px] font-extrabold tracking-wide shadow">
          SUSTAIN
        </div>
      )}

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
            onPointerDown={onKeyDown ? () => onKeyDown(key.midi) : undefined}
            onPointerUp={onKeyUp ? () => onKeyUp(key.midi) : undefined}
            onPointerLeave={onKeyUp ? () => onKeyUp(key.midi) : undefined}
            onPointerCancel={onKeyUp ? () => onKeyUp(key.midi) : undefined}
            className={`absolute top-0 bottom-0 border-r border-b rounded-b-md transition-colors duration-75 flex flex-col items-center justify-end pb-2 ${interactiveCls} ${visual}`}
          >
            {isMiddleC && (
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 mb-1" title="Middle C (C4)" />
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
            onPointerDown={
              onKeyDown
                ? (e) => {
                    e.stopPropagation();
                    onKeyDown(key.midi);
                  }
                : undefined
            }
            onPointerUp={
              onKeyUp
                ? (e) => {
                    e.stopPropagation();
                    onKeyUp(key.midi);
                  }
                : undefined
            }
            onPointerLeave={onKeyUp ? () => onKeyUp(key.midi) : undefined}
            onPointerCancel={onKeyUp ? () => onKeyUp(key.midi) : undefined}
            className={`absolute top-0 h-[62%] z-10 border rounded-b-md transition-colors duration-75 ${interactiveCls} ${visual}`}
          />
        );
      })}
    </div>
  );
});
