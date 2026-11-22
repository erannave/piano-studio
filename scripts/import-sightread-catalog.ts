import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Midi } from "@tonejs/midi";
import { convertMusicXmlToMidi } from "../src/shared/musicXmlToMidi.ts";
import type { SongMetadata } from "../src/shared/types.ts";

interface SightreadCatalogEntry {
  id: string;
  file: string;
  source: string;
  duration: number;
  difficulty: number; // ~14..69
  leftTrack?: number;
  rightTrack?: number;
  meta: {
    title: string;
    composer?: string;
    workTitle?: string;
    workNumber?: string;
    movementNumber?: string;
  };
}

/**
 * Maps Sightread's continuous difficulty score (~14..69) onto Piano Studio's 1..10 Skill Level scale.
 */
function mapDifficultyToLevel(rawDifficulty: number): number {
  const minRaw = 14;
  const maxRaw = 69;
  const normalized = Math.max(0, Math.min(1, (rawDifficulty - minRaw) / (maxRaw - minRaw)));
  return Math.max(1, Math.min(10, Math.round(1 + normalized * 9)));
}

function formatDisplayTitle(meta: SightreadCatalogEntry["meta"]): string {
  const withWorkNum = (t: string) => (meta.workNumber ? `${t}, ${meta.workNumber}` : t);
  if (!meta.workTitle || meta.title === meta.workTitle) {
    return withWorkNum(meta.title);
  }
  const mov = meta.movementNumber ? `${meta.movementNumber}. ${meta.title}` : meta.title;
  return `${withWorkNum(meta.workTitle)} — ${mov}`;
}

async function extractMusicXmlFromMxl(mxlBytes: Uint8Array): Promise<string> {
  // Write to a temp file and extract the .musicxml / .xml score via unzip -p
  const tmpPath = `/tmp/piano-mxl-${crypto.randomUUID()}.mxl`;
  await Bun.write(tmpPath, mxlBytes);
  try {
    const listProc = Bun.spawnSync(["unzip", "-Z1", tmpPath]);
    const files = listProc.stdout
      .toString()
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);

    const scoreFile =
      files.find((f) => /\.musicxml$/i.test(f)) ??
      files.find((f) => /\.xml$/i.test(f) && !f.toLowerCase().includes("meta-inf"));

    if (!scoreFile) {
      throw new Error(`No MusicXML file found inside MXL archive (${files.join(", ")})`);
    }

    const extractProc = Bun.spawnSync(["unzip", "-p", tmpPath, scoreFile]);
    if (extractProc.exitCode !== 0) {
      throw new Error(`unzip failed: ${extractProc.stderr.toString()}`);
    }
    return extractProc.stdout.toString("utf8");
  } finally {
    try {
      await Bun.file(tmpPath).delete();
    } catch {
      // ignore cleanup errors
    }
  }
}

/**
 * Generates the 3 short (~15s) Calibration Pieces used by Skill Calibration.
 * Kept separate from the 71 full-length library pieces so calibration stays fast.
 */
function generateCalibrationPieces(outDir: string): SongMetadata[] {
  const n = (name: string): number => {
    const m = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec(name);
    if (!m) throw new Error(`Invalid note: ${name}`);
    const base: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
    const acc = m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0;
    return (Number(m[3]) + 1) * 12 + base[m[1]!.toUpperCase()]! + acc;
  };

  type NoteSpec = {
    midi: number;
    beat: number;
    beats: number;
    vel?: number;
    hand?: "right" | "left";
  };

  const melody = (
    seq: Array<[string, number]>,
    startBeat = 0,
    vel = 0.78,
    hand: "right" | "left" = "right",
  ): NoteSpec[] => {
    const out: NoteSpec[] = [];
    let b = startBeat;
    for (const [pitch, dur] of seq) {
      if (pitch !== "R") out.push({ midi: n(pitch), beat: b, beats: dur * 0.92, vel, hand });
      b += dur;
    }
    return out;
  };

  const arp = (
    pitches: string[],
    startBeat: number,
    step: number,
    vel = 0.72,
    hand: "right" | "left" = "right",
  ) =>
    pitches.map((p, i) => ({
      midi: n(p),
      beat: startBeat + i * step,
      beats: step * 1.4,
      vel,
      hand,
    }));

  const pieces = [
    {
      id: "cal-ode-to-joy",
      title: "Ode to Joy (Calibration)",
      composer: "Ludwig van Beethoven",
      difficultyLevel: 2,
      calibrationOrder: 1,
      bpm: 112,
      description: "Five-finger stepwise melody with steady quarter-note rhythm.",
      notes: melody([
        ["E4", 1],
        ["E4", 1],
        ["F4", 1],
        ["G4", 1],
        ["G4", 1],
        ["F4", 1],
        ["E4", 1],
        ["D4", 1],
        ["C4", 1],
        ["C4", 1],
        ["D4", 1],
        ["E4", 1],
        ["E4", 1.5],
        ["D4", 0.5],
        ["D4", 2],
        ["E4", 1],
        ["E4", 1],
        ["F4", 1],
        ["G4", 1],
        ["G4", 1],
        ["F4", 1],
        ["E4", 1],
        ["D4", 1],
        ["C4", 1],
        ["C4", 1],
        ["D4", 1],
        ["E4", 1],
        ["D4", 1.5],
        ["C4", 0.5],
        ["C4", 2],
      ]),
    },
    {
      id: "cal-prelude-in-c",
      title: "Prelude in C Major (Calibration)",
      composer: "Johann Sebastian Bach",
      difficultyLevel: 5,
      calibrationOrder: 2,
      bpm: 108,
      description: "Flowing broken-chord arpeggios testing even hand-to-hand coordination.",
      notes: [
        ...arp(["C4", "E4", "G4", "C5", "E5", "G4", "C5", "E5"], 0, 0.5),
        ...arp(["C4", "E4", "G4", "C5", "E5", "G4", "C5", "E5"], 4, 0.5),
        ...arp(["C4", "D4", "A4", "D5", "F5", "A4", "D5", "F5"], 8, 0.5),
        ...arp(["C4", "D4", "A4", "D5", "F5", "A4", "D5", "F5"], 12, 0.5),
        ...arp(["B3", "D4", "G4", "D5", "F5", "G4", "D5", "F5"], 16, 0.5),
        ...arp(["B3", "D4", "G4", "D5", "F5", "G4", "D5", "F5"], 20, 0.5),
        ...arp(["C4", "E4", "G4", "C5", "E5", "G4", "C5", "E5"], 24, 0.5),
      ],
    },
    {
      id: "cal-fur-elise",
      title: "Für Elise (Calibration)",
      composer: "Ludwig van Beethoven",
      difficultyLevel: 8,
      calibrationOrder: 3,
      bpm: 118,
      description: "Iconic chromatic 16th-note motif paired with sweeping left-hand arpeggios.",
      notes: [
        ...melody([
          ["E5", 0.5],
          ["D#5", 0.5],
          ["E5", 0.5],
          ["D#5", 0.5],
          ["E5", 0.5],
          ["B4", 0.5],
          ["D5", 0.5],
          ["C5", 0.5],
          ["A4", 1.5],
          ["C4", 0.5],
          ["E4", 0.5],
          ["A4", 0.5],
          ["B4", 1.5],
          ["E4", 0.5],
          ["G#4", 0.5],
          ["B4", 0.5],
          ["C5", 1.5],
          ["E4", 0.5],
          ["E5", 0.5],
          ["D#5", 0.5],
          ["E5", 0.5],
          ["D#5", 0.5],
          ["E5", 0.5],
          ["B4", 0.5],
          ["D5", 0.5],
          ["C5", 0.5],
          ["A4", 1.5],
          ["C4", 0.5],
          ["E4", 0.5],
          ["A4", 0.5],
          ["B4", 1.5],
          ["E4", 0.5],
          ["C5", 0.5],
          ["B4", 0.5],
          ["A4", 2],
        ]),
        ...arp(["A2", "E3", "A3"], 4, 0.5, 0.62, "left"),
        ...arp(["E2", "E3", "G#3"], 7, 0.5, 0.62, "left"),
        ...arp(["A2", "E3", "A3"], 10, 0.5, 0.62, "left"),
        ...arp(["A2", "E3", "A3"], 16, 0.5, 0.62, "left"),
        ...arp(["E2", "E3", "G#3"], 19, 0.5, 0.62, "left"),
        ...arp(["A2", "E3", "A3"], 22, 0.5, 0.62, "left"),
      ],
    },
  ];

  const out: SongMetadata[] = [];
  for (const p of pieces) {
    const midi = new Midi();
    midi.header.setTempo(p.bpm);
    const rh = midi.addTrack();
    rh.name = "Right Hand";
    const lh = midi.addTrack();
    lh.name = "Left Hand";
    const secPerBeat = 60 / p.bpm;
    let minNote = 127;
    let maxNote = 0;

    for (const note of p.notes) {
      const target = note.hand === "left" ? lh : rh;
      target.addNote({
        midi: note.midi,
        time: note.beat * secPerBeat,
        duration: Math.max(0.08, note.beats * secPerBeat),
        velocity: note.vel ?? 0.78,
      });
      if (note.midi < minNote) minNote = note.midi;
      if (note.midi > maxNote) maxNote = note.midi;
    }

    const fileName = `${p.id}.mid`;
    writeFileSync(join(outDir, fileName), Buffer.from(midi.toArray()));
    out.push({
      id: p.id,
      title: p.title,
      composer: p.composer,
      difficultyLevel: p.difficultyLevel,
      midiFile: `/songs/${fileName}`,
      durationSec: Math.round(midi.duration * 10) / 10,
      minNote,
      maxNote,
      bpm: p.bpm,
      isCalibrationPiece: true,
      calibrationOrder: p.calibrationOrder,
      description: p.description,
      keySignatureFifths: 0,
      timeSignature: { numerator: 4, denominator: 4 },
    });
  }
  return out;
}

async function main() {
  const manifestPath = join(process.cwd(), "scripts", "sightread-catalog.json");
  const entries = JSON.parse(readFileSync(manifestPath, "utf8")) as SightreadCatalogEntry[];

  const outDir = join(process.cwd(), "public", "songs");
  mkdirSync(outDir, { recursive: true });

  const catalog: SongMetadata[] = [];
  const calibrationPieces = generateCalibrationPieces(outDir);
  catalog.push(...calibrationPieces);

  console.log(`Importing ${entries.length} public-domain songs from sightread.dev...`);

  // Process in small concurrent batches of 8
  const batchSize = 8;
  let imported = 0;
  let failed = 0;

  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = entries.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async (entry): Promise<SongMetadata | null> => {
        const midiFileName = `${entry.id}.mid`;
        const midiPath = join(outDir, midiFileName);
        const url = `https://sightread.dev/music/songs/${encodeURIComponent(entry.id)}.mxl`;

        try {
          const res = await fetch(url);
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
          }
          const mxlBytes = new Uint8Array(await res.arrayBuffer());
          const xml = await extractMusicXmlFromMxl(mxlBytes);
          const converted = convertMusicXmlToMidi(xml);

          if (converted.noteCount === 0) {
            throw new Error("Converted song has 0 notes");
          }

          writeFileSync(midiPath, Buffer.from(converted.midi.toArray()));
          imported++;

          return {
            id: entry.id,
            title: formatDisplayTitle(entry.meta),
            composer: entry.meta.composer || "Traditional",
            difficultyLevel: mapDifficultyToLevel(entry.difficulty),
            midiFile: `/songs/${midiFileName}`,
            durationSec: converted.durationSec || entry.duration,
            minNote: converted.minNote,
            maxNote: converted.maxNote,
            bpm: converted.bpm,
            workTitle: entry.meta.workTitle,
            workNumber: entry.meta.workNumber,
            movementNumber: entry.meta.movementNumber,
            source: "sightread.dev (Public Domain MusicXML)",
            license: "Public Domain",
            keySignatureFifths: converted.keySignatureFifths,
            timeSignature: converted.timeSignature,
          };
        } catch (err) {
          failed++;
          console.error(`Failed ${entry.id} (${url}):`, err instanceof Error ? err.message : err);
          if (existsSync(midiPath)) {
            return null;
          }
          return null;
        }
      }),
    );

    for (const item of results) {
      if (item) catalog.push(item);
    }
  }

  writeFileSync(join(outDir, "songs.json"), JSON.stringify(catalog, null, 2) + "\n", "utf8");
  console.log(
    `Done! Imported ${imported}/${entries.length} Sightread songs (${failed} failed) + ${calibrationPieces.length} calibration pieces -> public/songs/songs.json`,
  );
}

await main();
