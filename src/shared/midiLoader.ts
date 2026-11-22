import { buildSongMeasures } from "./practiceEngine.ts";
import type { FittedSong, Hand, ParsedSong, SongNote } from "./types.ts";

const KEY_TO_FIFTHS: Record<string, number> = {
  Cb: -7,
  Gb: -6,
  Db: -5,
  Ab: -4,
  Eb: -3,
  Bb: -2,
  F: -1,
  C: 0,
  G: 1,
  D: 2,
  A: 3,
  E: 4,
  B: 5,
  "F#": 6,
  "C#": 7,
  Abm: -7,
  Ebm: -6,
  Bbm: -5,
  Fm: -4,
  Cm: -3,
  Gm: -2,
  Dm: -1,
  Am: 0,
  Em: 1,
  Bm: 2,
  "F#m": 3,
  "C#m": 4,
  "G#m": 5,
  "D#m": 6,
  "A#m": 7,
};

interface SchedulerLike {
  yield?: () => Promise<void>;
}

/**
 * Yields control back to the browser main thread so pending user input and paint
 * frames stay responsive during heavy MIDI parsing on low/mid-tier Android tablets.
 */
async function yieldToMain(): Promise<void> {
  const sched = (globalThis as { scheduler?: SchedulerLike }).scheduler;
  if (sched && typeof sched.yield === "function") {
    await sched.yield();
    return;
  }
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

function inferHand(
  trackIdx: number,
  trackName: string,
  midi: number,
  nonEmptyTrackCount: number,
): Hand {
  const lower = trackName.toLowerCase();
  if (lower.includes("left") || lower.includes("bass") || lower === "lh") return "left";
  if (lower.includes("right") || lower.includes("treble") || lower === "rh") return "right";
  if (nonEmptyTrackCount >= 2) {
    return trackIdx === 0 ? "right" : "left";
  }
  return midi < 60 ? "left" : "right";
}

export async function loadParsedSong(fittedSong: FittedSong): Promise<ParsedSong> {
  const [{ Midi }, response] = await Promise.all([
    import("@tonejs/midi"),
    fetch(fittedSong.midiFile),
  ]);
  if (!response.ok) {
    throw new Error(`Failed to fetch MIDI file: ${fittedSong.midiFile} (${response.status})`);
  }

  const buffer = await response.arrayBuffer();
  const midi = new Midi(buffer);

  const nonEmptyTrackCount = midi.tracks.filter((t) => t.notes.length > 0).length;
  const notes: SongNote[] = [];
  let maxNoteEnd = midi.duration;
  let deadline = performance.now() + 50;

  for (let trackIdx = 0; trackIdx < midi.tracks.length; trackIdx++) {
    const track = midi.tracks[trackIdx]!;
    const trackName = track.name || "";
    for (let i = 0; i < track.notes.length; i++) {
      const note = track.notes[i]!;
      const transposedMidi = note.midi + fittedSong.transposeSemitones;
      const duration = Math.max(0.06, note.duration);
      const noteEnd = note.time + duration;
      if (noteEnd > maxNoteEnd) maxNoteEnd = noteEnd;

      notes.push({
        midi: transposedMidi,
        time: note.time,
        duration,
        velocity: note.velocity,
        track: trackIdx,
        hand: inferHand(trackIdx, trackName, transposedMidi, nonEmptyTrackCount),
      });

      // Check 50ms INP budget every 256 notes to avoid overhead while keeping input responsive
      if ((i & 255) === 255 && performance.now() >= deadline) {
        await yieldToMain();
        deadline = performance.now() + 50;
      }
    }
  }

  if (performance.now() >= deadline) {
    await yieldToMain();
  }

  notes.sort((a, b) => a.time - b.time || a.midi - b.midi);

  const durationSec = notes.length > 0 ? maxNoteEnd : fittedSong.durationSec;

  const bpm = Math.round(midi.header.tempos[0]?.bpm ?? fittedSong.bpm ?? 100);

  const rawTs = midi.header.timeSignatures[0]?.timeSignature;
  const timeSignature = {
    numerator: rawTs?.[0] ?? fittedSong.timeSignature?.numerator ?? 4,
    denominator: rawTs?.[1] ?? fittedSong.timeSignature?.denominator ?? 4,
  };

  let keySignatureFifths = fittedSong.keySignatureFifths ?? 0;
  const rawKey = midi.header.keySignatures[0];
  if (rawKey) {
    const lookupKey = rawKey.scale === "minor" ? `${rawKey.key}m` : rawKey.key;
    if (KEY_TO_FIFTHS[lookupKey] !== undefined) {
      keySignatureFifths = KEY_TO_FIFTHS[lookupKey]!;
    } else if (KEY_TO_FIFTHS[rawKey.key] !== undefined) {
      keySignatureFifths = KEY_TO_FIFTHS[rawKey.key]!;
    }
  }

  const measures = buildSongMeasures(
    durationSec,
    bpm,
    timeSignature.numerator,
    timeSignature.denominator,
  );

  return {
    metadata: fittedSong,
    notes,
    measures,
    durationSec,
    bpm,
    keySignatureFifths,
    timeSignature,
  };
}
