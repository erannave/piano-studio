import { Midi } from "@tonejs/midi";
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
  const response = await fetch(fittedSong.midiFile);
  if (!response.ok) {
    throw new Error(`Failed to fetch MIDI file: ${fittedSong.midiFile} (${response.status})`);
  }

  const buffer = await response.arrayBuffer();
  const midi = new Midi(buffer);

  const nonEmptyTrackCount = midi.tracks.filter((t) => t.notes.length > 0).length;
  const notes: SongNote[] = [];

  midi.tracks.forEach((track, trackIdx) => {
    for (const note of track.notes) {
      const transposedMidi = note.midi + fittedSong.transposeSemitones;
      notes.push({
        midi: transposedMidi,
        time: note.time,
        duration: Math.max(0.06, note.duration),
        velocity: note.velocity,
        track: trackIdx,
        hand: inferHand(trackIdx, track.name || "", transposedMidi, nonEmptyTrackCount),
      });
    }
  });

  notes.sort((a, b) => a.time - b.time || a.midi - b.midi);

  const durationSec =
    notes.length > 0
      ? Math.max(midi.duration, ...notes.map((n) => n.time + n.duration))
      : fittedSong.durationSec;

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
