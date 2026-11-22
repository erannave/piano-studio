import { Midi } from "@tonejs/midi";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SongMetadata } from "../src/shared/types.ts";

interface NoteSpec {
  midi: number;
  beat: number; // in quarter-note beats
  beats: number; // duration in beats
  velocity?: number;
  hand?: "right" | "left";
}

interface SongBlueprint {
  id: string;
  title: string;
  composer: string;
  difficultyLevel: number;
  bpm: number;
  isCalibrationPiece?: boolean;
  calibrationOrder?: number;
  description: string;
  notes: NoteSpec[];
}

// Helper to convert note names like "C4", "F#5", "Bb3" to MIDI note numbers
function n(name: string): number {
  const match = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec(name);
  if (!match) throw new Error(`Invalid note name: ${name}`);
  const baseMap: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const letter = match[1]!.toUpperCase();
  const accidental = match[2] === "#" ? 1 : match[2] === "b" ? -1 : 0;
  const octave = Number(match[3]);
  return (octave + 1) * 12 + baseMap[letter]! + accidental;
}

function melody(seq: Array<[string, number]>, startBeat = 0, velocity = 0.78, hand: "right" | "left" = "right"): NoteSpec[] {
  const out: NoteSpec[] = [];
  let beat = startBeat;
  for (const [pitch, dur] of seq) {
    if (pitch !== "R") {
      out.push({ midi: n(pitch), beat, beats: dur * 0.92, velocity, hand });
    }
    beat += dur;
  }
  return out;
}

function chord(pitches: string[], beat: number, beats: number, velocity = 0.65, hand: "right" | "left" = "left"): NoteSpec[] {
  return pitches.map((p) => ({ midi: n(p), beat, beats: beats * 0.94, velocity, hand }));
}

function arpeggio(pitches: string[], startBeat: number, step: number, velocity = 0.72, hand: "right" | "left" = "right"): NoteSpec[] {
  return pitches.map((p, i) => ({
    midi: n(p),
    beat: startBeat + i * step,
    beats: step * 1.4,
    velocity,
    hand,
  }));
}

const BLUEPRINTS: SongBlueprint[] = [
  {
    id: "twinkle-twinkle",
    title: "Twinkle, Twinkle, Little Star",
    composer: "Traditional",
    difficultyLevel: 1,
    bpm: 100,
    description: "Gentle single-hand C-position melody ideal for first-time players.",
    notes: melody([
      ["C4", 1], ["C4", 1], ["G4", 1], ["G4", 1], ["A4", 1], ["A4", 1], ["G4", 2],
      ["F4", 1], ["F4", 1], ["E4", 1], ["E4", 1], ["D4", 1], ["D4", 1], ["C4", 2],
      ["G4", 1], ["G4", 1], ["F4", 1], ["F4", 1], ["E4", 1], ["E4", 1], ["D4", 2],
      ["G4", 1], ["G4", 1], ["F4", 1], ["F4", 1], ["E4", 1], ["E4", 1], ["D4", 2],
      ["C4", 1], ["C4", 1], ["G4", 1], ["G4", 1], ["A4", 1], ["A4", 1], ["G4", 2],
      ["F4", 1], ["F4", 1], ["E4", 1], ["E4", 1], ["D4", 1], ["D4", 1], ["C4", 2],
    ]),
  },
  {
    id: "ode-to-joy",
    title: "Ode to Joy",
    composer: "Ludwig van Beethoven",
    difficultyLevel: 2,
    bpm: 112,
    isCalibrationPiece: true,
    calibrationOrder: 1,
    description: "Five-finger stepwise melody with steady quarter-note rhythm.",
    notes: melody([
      ["E4", 1], ["E4", 1], ["F4", 1], ["G4", 1],
      ["G4", 1], ["F4", 1], ["E4", 1], ["D4", 1],
      ["C4", 1], ["C4", 1], ["D4", 1], ["E4", 1],
      ["E4", 1.5], ["D4", 0.5], ["D4", 2],
      ["E4", 1], ["E4", 1], ["F4", 1], ["G4", 1],
      ["G4", 1], ["F4", 1], ["E4", 1], ["D4", 1],
      ["C4", 1], ["C4", 1], ["D4", 1], ["E4", 1],
      ["D4", 1.5], ["C4", 0.5], ["C4", 2],
    ]),
  },
  {
    id: "aura-lee",
    title: "Aura Lee (Two Hands)",
    composer: "George R. Poulton",
    difficultyLevel: 3,
    bpm: 96,
    description: "Warm melody paired with simple sustained left-hand fifths.",
    notes: [
      ...melody([
        ["C4", 1], ["F4", 1], ["E4", 1], ["F4", 1],
        ["G4", 1], ["D4", 1], ["G4", 2],
        ["F4", 1], ["E4", 1], ["D4", 1], ["E4", 1],
        ["F4", 4],
        ["C4", 1], ["F4", 1], ["E4", 1], ["F4", 1],
        ["G4", 1], ["D4", 1], ["G4", 2],
        ["F4", 1], ["E4", 1], ["D4", 1], ["E4", 1],
        ["F4", 4],
      ]),
      ...chord(["F3", "C4"], 0, 4),
      ...chord(["G3", "D4"], 4, 4),
      ...chord(["C3", "G3"], 8, 4),
      ...chord(["F3", "C4"], 12, 4),
      ...chord(["F3", "C4"], 16, 4),
      ...chord(["G3", "D4"], 20, 4),
      ...chord(["C3", "G3"], 24, 4),
      ...chord(["F3", "C4"], 28, 4),
    ],
  },
  {
    id: "minuet-in-g",
    title: "Minuet in G Major",
    composer: "Christian Petzold (attr. Bach)",
    difficultyLevel: 4,
    bpm: 116,
    description: "Classic 3/4 Baroque dance introducing independent two-hand phrasing.",
    notes: [
      ...melody([
        ["D5", 1], ["G4", 0.5], ["A4", 0.5], ["B4", 0.5], ["C5", 0.5],
        ["D5", 1], ["G4", 1], ["G4", 1],
        ["E5", 1], ["C5", 0.5], ["D5", 0.5], ["E5", 0.5], ["F#5", 0.5],
        ["G5", 1], ["G4", 1], ["G4", 1],
        ["C5", 1], ["D5", 0.5], ["C5", 0.5], ["B4", 0.5], ["A4", 0.5],
        ["B4", 1], ["C5", 0.5], ["B4", 0.5], ["A4", 0.5], ["G4", 0.5],
        ["F#4", 1], ["G4", 0.5], ["A4", 0.5], ["B4", 0.5], ["G4", 0.5],
        ["A4", 3],
      ]),
      ...melody(
        [
          ["G3", 2], ["A3", 1],
          ["B3", 3],
          ["C4", 3],
          ["B3", 3],
          ["A3", 3],
          ["G3", 3],
          ["D3", 2], ["B3", 1],
          ["D4", 1], ["D3", 1], ["C3", 1],
        ],
        0,
        0.64,
        "left"
      ),
    ],
  },
  {
    id: "prelude-in-c",
    title: "Prelude in C Major (BWV 846)",
    composer: "Johann Sebastian Bach",
    difficultyLevel: 5,
    bpm: 108,
    isCalibrationPiece: true,
    calibrationOrder: 2,
    description: "Flowing broken-chord arpeggios testing even hand-to-hand coordination.",
    notes: [
      // Bar 1: C major
      ...arpeggio(["C4", "E4", "G4", "C5", "E5", "G4", "C5", "E5"], 0, 0.5),
      ...arpeggio(["C4", "E4", "G4", "C5", "E5", "G4", "C5", "E5"], 4, 0.5),
      // Bar 2: Dm7/C
      ...arpeggio(["C4", "D4", "A4", "D5", "F5", "A4", "D5", "F5"], 8, 0.5),
      ...arpeggio(["C4", "D4", "A4", "D5", "F5", "A4", "D5", "F5"], 12, 0.5),
      // Bar 3: G7/B
      ...arpeggio(["B3", "D4", "G4", "D5", "F5", "G4", "D5", "F5"], 16, 0.5),
      ...arpeggio(["B3", "D4", "G4", "D5", "F5", "G4", "D5", "F5"], 20, 0.5),
      // Bar 4: C major
      ...arpeggio(["C4", "E4", "G4", "C5", "E5", "G4", "C5", "E5"], 24, 0.5),
      ...chord(["C4", "E4", "G4", "C5"], 28, 4, 0.72, "right"),
    ],
  },
  {
    id: "canon-in-d",
    title: "Canon in D (Excerpt)",
    composer: "Johann Pachelbel",
    difficultyLevel: 6,
    bpm: 88,
    description: "Interlocking melody over the famous descending Baroque bass line.",
    notes: [
      ...melody([
        ["F#5", 2], ["E5", 2], ["D5", 2], ["C#5", 2],
        ["B4", 2], ["A4", 2], ["B4", 2], ["C#5", 2],
        ["D5", 1], ["F#5", 1], ["A5", 1], ["G5", 1],
        ["F#5", 1], ["D5", 1], ["F#5", 1], ["E5", 1],
        ["D5", 1], ["B4", 1], ["D5", 1], ["A4", 1],
        ["G4", 1], ["B4", 1], ["A4", 2],
      ]),
      ...melody(
        [
          ["D3", 2], ["A2", 2], ["B2", 2], ["F#2", 2],
          ["G2", 2], ["D2", 2], ["G2", 2], ["A2", 2],
          ["D3", 2], ["A2", 2], ["B2", 2], ["F#2", 2],
          ["G2", 2], ["D2", 2], ["G2", 1], ["A2", 1],
        ],
        0,
        0.65,
        "left"
      ),
    ],
  },
  {
    id: "gymnopedie-1",
    title: "Gymnopédie No. 1 (Excerpt)",
    composer: "Erik Satie",
    difficultyLevel: 7,
    bpm: 76,
    description: "Expressive left-hand bass-to-chord leaps with a sparse, floating melody.",
    notes: [
      // Left hand waltz pattern (Gmaj7 -> Dmaj7)
      ...melody([["G2", 1]], 0, 0.6, "left"), ...chord(["B3", "D4", "F#4"], 1, 2, 0.55, "left"),
      ...melody([["D2", 1]], 3, 0.6, "left"), ...chord(["A3", "C#4", "F#4"], 4, 2, 0.55, "left"),
      ...melody([["G2", 1]], 6, 0.6, "left"), ...chord(["B3", "D4", "F#4"], 7, 2, 0.55, "left"),
      ...melody([["D2", 1]], 9, 0.6, "left"), ...chord(["A3", "C#4", "F#4"], 10, 2, 0.55, "left"),
      ...melody([["G2", 1]], 12, 0.6, "left"), ...chord(["B3", "D4", "F#4"], 13, 2, 0.55, "left"),
      ...melody([["D2", 1]], 15, 0.6, "left"), ...chord(["A3", "C#4", "F#4"], 16, 2, 0.55, "left"),
      ...melody([["G2", 1]], 18, 0.6, "left"), ...chord(["B3", "D4", "F#4"], 19, 2, 0.55, "left"),
      ...melody([["D2", 1]], 21, 0.6, "left"), ...chord(["A3", "C#4", "F#4"], 22, 2, 0.55, "left"),
      // Right hand melody starting bar 3
      ...melody(
        [
          ["R", 1], ["F#5", 1], ["A5", 1],
          ["G5", 1], ["F#5", 1], ["C#5", 1],
          ["B4", 1], ["C#5", 1], ["D5", 1],
          ["A4", 3],
          ["F#4", 3],
          ["F#4", 3],
        ],
        6,
        0.74,
        "right"
      ),
    ],
  },
  {
    id: "fur-elise",
    title: "Für Elise (Main Theme)",
    composer: "Ludwig van Beethoven",
    difficultyLevel: 8,
    bpm: 118,
    isCalibrationPiece: true,
    calibrationOrder: 3,
    description: "Iconic chromatic 16th-note motif paired with sweeping left-hand arpeggios.",
    notes: [
      ...melody([
        ["E5", 0.5], ["D#5", 0.5],
        ["E5", 0.5], ["D#5", 0.5], ["E5", 0.5], ["B4", 0.5], ["D5", 0.5], ["C5", 0.5],
        ["A4", 1.5], ["C4", 0.5], ["E4", 0.5], ["A4", 0.5],
        ["B4", 1.5], ["E4", 0.5], ["G#4", 0.5], ["B4", 0.5],
        ["C5", 1.5], ["E4", 0.5], ["E5", 0.5], ["D#5", 0.5],
        ["E5", 0.5], ["D#5", 0.5], ["E5", 0.5], ["B4", 0.5], ["D5", 0.5], ["C5", 0.5],
        ["A4", 1.5], ["C4", 0.5], ["E4", 0.5], ["A4", 0.5],
        ["B4", 1.5], ["E4", 0.5], ["C5", 0.5], ["B4", 0.5],
        ["A4", 2],
      ]),
      ...arpeggio(["A2", "E3", "A3"], 4, 0.5, 0.62, "left"),
      ...arpeggio(["E2", "E3", "G#3"], 7, 0.5, 0.62, "left"),
      ...arpeggio(["A2", "E3", "A3"], 10, 0.5, 0.62, "left"),
      ...arpeggio(["A2", "E3", "A3"], 16, 0.5, 0.62, "left"),
      ...arpeggio(["E2", "E3", "G#3"], 19, 0.5, 0.62, "left"),
      ...arpeggio(["A2", "E3", "A3"], 22, 0.5, 0.62, "left"),
    ],
  },
  {
    id: "moonlight-sonata",
    title: "Moonlight Sonata (1st Mvt. Excerpt)",
    composer: "Ludwig van Beethoven",
    difficultyLevel: 9,
    bpm: 64,
    description: "Sustained bass octaves beneath continuous triplet arpeggios and upper voice.",
    notes: [
      // Bar 1: C# minor
      ...chord(["C#2", "C#3"], 0, 4, 0.58, "left"),
      ...arpeggio(["G#3", "C#4", "E4", "G#3", "C#4", "E4", "G#3", "C#4", "E4", "G#3", "C#4", "E4"], 0, 1 / 3, 0.62, "right"),
      // Bar 2: C# minor / B
      ...chord(["B1", "B2"], 4, 4, 0.58, "left"),
      ...arpeggio(["G#3", "C#4", "E4", "G#3", "C#4", "E4", "G#3", "C#4", "E4", "G#3", "C#4", "E4"], 4, 1 / 3, 0.62, "right"),
      // Bar 3: A major -> D major
      ...chord(["A1", "A2"], 8, 2, 0.58, "left"),
      ...chord(["F#1", "F#2"], 10, 2, 0.58, "left"),
      ...arpeggio(["A3", "C#4", "E4", "A3", "C#4", "E4", "A3", "D4", "F#4", "A3", "D4", "F#4"], 8, 1 / 3, 0.62, "right"),
      // Bar 4: G#7 -> C#m with top melody G#4
      ...chord(["G#1", "G#2"], 12, 4, 0.6, "left"),
      ...arpeggio(["G#3", "C4", "F#4", "G#3", "C#4", "E4", "G#3", "C#4", "D#4", "F#3", "C4", "D#4"], 12, 1 / 3, 0.64, "right"),
      { midi: n("G#4"), beat: 15, beats: 0.75, velocity: 0.8, hand: "right" },
      { midi: n("G#4"), beat: 15.75, beats: 0.25, velocity: 0.78, hand: "right" },
      ...chord(["C#2", "C#3"], 16, 4, 0.62, "left"),
      ...chord(["G#3", "C#4", "E4", "G#4"], 16, 4, 0.72, "right"),
    ],
  },
  {
    id: "turkish-march",
    title: "Rondo Alla Turca (Excerpt)",
    composer: "Wolfgang Amadeus Mozart",
    difficultyLevel: 10,
    bpm: 132,
    description: "Brisk 16th-note runs and crisp staccato accompaniment demanding agile technique.",
    notes: [
      ...melody([
        ["B4", 0.25], ["A4", 0.25], ["G#4", 0.25], ["A4", 0.25],
        ["C5", 1], ["R", 0.25], ["D5", 0.25], ["C5", 0.25], ["B4", 0.25],
        ["C5", 0.25], ["E5", 1], ["R", 0.25], ["F5", 0.25], ["E5", 0.25],
        ["D#5", 0.25], ["E5", 0.25], ["B5", 0.25], ["A5", 0.25], ["G#5", 0.25], ["A5", 0.25],
        ["B5", 0.25], ["A5", 0.25], ["G#5", 0.25], ["A5", 0.25], ["C6", 1],
        ["A5", 0.5], ["C6", 0.5], ["G5", 0.5], ["A5", 0.5], ["B5", 0.5], ["A5", 0.5],
        ["G5", 0.5], ["A5", 0.5], ["B5", 0.5], ["A5", 0.5], ["G5", 0.5], ["F#5", 0.5], ["E5", 1],
      ], 0, 0.85, "right"),
      ...chord(["A2", "E3", "A3"], 1, 0.5, 0.65, "left"),
      ...chord(["A2", "E3", "A3"], 2, 0.5, 0.65, "left"),
      ...chord(["A2", "E3", "A3"], 3.25, 0.5, 0.65, "left"),
      ...chord(["A2", "E3", "A3"], 4.5, 0.5, 0.65, "left"),
      ...chord(["A2", "E3", "A3"], 6.5, 0.5, 0.65, "left"),
      ...chord(["E3", "B3", "E4"], 8.5, 0.5, 0.65, "left"),
      ...chord(["E3", "B3", "E4"], 10.5, 0.5, 0.65, "left"),
    ],
  },
];

function buildCatalog(): void {
  const outDir = join(process.cwd(), "public", "songs");
  mkdirSync(outDir, { recursive: true });

  const catalog: SongMetadata[] = [];

  for (const bp of BLUEPRINTS) {
    const midi = new Midi();
    midi.header.setTempo(bp.bpm);
    const rightTrack = midi.addTrack();
    rightTrack.name = "Right Hand";
    const leftTrack = midi.addTrack();
    leftTrack.name = "Left Hand";

    const secPerBeat = 60 / bp.bpm;
    let minNote = 127;
    let maxNote = 0;

    for (const note of bp.notes) {
      const target = note.hand === "left" ? leftTrack : rightTrack;
      const time = note.beat * secPerBeat;
      const duration = Math.max(0.08, note.beats * secPerBeat);
      target.addNote({
        midi: note.midi,
        time,
        duration,
        velocity: note.velocity ?? 0.78,
      });
      if (note.midi < minNote) minNote = note.midi;
      if (note.midi > maxNote) maxNote = note.midi;
    }

    const fileName = `${bp.id}.mid`;
    const filePath = join(outDir, fileName);
    writeFileSync(filePath, Buffer.from(midi.toArray()));

    catalog.push({
      id: bp.id,
      title: bp.title,
      composer: bp.composer,
      difficultyLevel: bp.difficultyLevel,
      midiFile: `/songs/${fileName}`,
      durationSec: Math.round(midi.duration * 10) / 10,
      minNote,
      maxNote,
      bpm: bp.bpm,
      ...(bp.isCalibrationPiece ? { isCalibrationPiece: true, calibrationOrder: bp.calibrationOrder } : {}),
      description: bp.description,
    });
  }

  writeFileSync(join(outDir, "songs.json"), JSON.stringify(catalog, null, 2) + "\n", "utf8");
  console.log(`Seeded ${catalog.length} MIDI songs into public/songs/ and public/songs/songs.json`);
}

buildCatalog();
