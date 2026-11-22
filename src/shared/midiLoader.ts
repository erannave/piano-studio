import { Midi } from "@tonejs/midi";
import type { FittedSong, ParsedSong, SongNote } from "./types.ts";

export async function loadParsedSong(fittedSong: FittedSong): Promise<ParsedSong> {
  const response = await fetch(fittedSong.midiFile);
  if (!response.ok) {
    throw new Error(`Failed to fetch MIDI file: ${fittedSong.midiFile} (${response.status})`);
  }

  const buffer = await response.arrayBuffer();
  const midi = new Midi(buffer);

  const notes: SongNote[] = [];
  midi.tracks.forEach((track, trackIdx) => {
    for (const note of track.notes) {
      notes.push({
        midi: note.midi + fittedSong.transposeSemitones,
        time: note.time,
        duration: Math.max(0.06, note.duration),
        velocity: note.velocity,
        track: trackIdx,
      });
    }
  });

  notes.sort((a, b) => a.time - b.time || a.midi - b.midi);

  const durationSec =
    notes.length > 0
      ? Math.max(midi.duration, ...notes.map((n) => n.time + n.duration))
      : fittedSong.durationSec;

  return {
    metadata: fittedSong,
    notes,
    durationSec,
  };
}
