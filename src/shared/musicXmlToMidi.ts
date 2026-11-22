import { Midi } from "@tonejs/midi";

const STEP_TO_SEMITONE: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

const FIFTHS_TO_KEY: Record<number, string> = {
  [-7]: "Cb",
  [-6]: "Gb",
  [-5]: "Db",
  [-4]: "Ab",
  [-3]: "Eb",
  [-2]: "Bb",
  [-1]: "F",
  0: "C",
  1: "G",
  2: "D",
  3: "A",
  4: "E",
  5: "B",
  6: "F#",
  7: "C#",
};

export interface ConvertedMusicXml {
  midi: Midi;
  minNote: number;
  maxNote: number;
  bpm: number;
  durationSec: number;
  keySignatureFifths: number;
  timeSignature: { numerator: number; denominator: number };
  noteCount: number;
}

interface RawNoteEvent {
  midi: number;
  startSec: number;
  durationSec: number;
  velocity: number;
  staff: 1 | 2;
}

function getTagText(block: string, tag: string): string | null {
  const m = new RegExp(`<${tag}\\b[^>]*>([^<]*)</${tag}>`).exec(block);
  return m ? m[1]!.trim() : null;
}

function pitchToMidi(step: string, alter: number, octave: number): number {
  const base = STEP_TO_SEMITONE[step.toUpperCase()];
  if (base === undefined) return 60;
  return (octave + 1) * 12 + base + alter;
}

/**
 * Lightweight, dependency-free MusicXML (partwise) -> 2-track MIDI converter.
 * Maps staff 1 -> Track 0 (Right Hand) and staff 2 -> Track 1 (Left Hand),
 * merges tied notes, and preserves key signature, time signature, and tempo changes.
 */
export function convertMusicXmlToMidi(xml: string): ConvertedMusicXml {
  // Use the first <part> (piano grand staff)
  const partMatch = /<part\b[^>]*>([\s\S]*?)<\/part>/.exec(xml);
  const partXml = partMatch ? partMatch[1]! : xml;

  const measureRegex = /<measure\b[^>]*>([\s\S]*?)<\/measure>/g;
  let divisions = 1;
  let currentBpm = 100;
  let initialBpm: number | null = null;
  let keySignatureFifths = 0;
  let keyFound = false;
  let timeSignature = { numerator: 4, denominator: 4 };
  let timeFound = false;

  const tempoChanges: Array<{ timeSec: number; bpm: number }> = [];
  const rawNotes: RawNoteEvent[] = [];

  // Active tied notes keyed by `${staff}:${midi}` -> index in rawNotes
  const openTies = new Map<string, number>();

  let measureStartSec = 0;

  let measureMatch: RegExpExecArray | null;
  while ((measureMatch = measureRegex.exec(partXml)) !== null) {
    const measureBody = measureMatch[1]!;

    // Tokenize top-level musical elements in document order within the measure
    const elemRegex =
      /<(attributes|direction|note|backup|forward)\b[^>]*>([\s\S]*?)<\/\1>|<(sound)\b([^>]*)\/>/g;

    let cursorDiv = 0;
    let lastNoteStartDiv = 0;
    let maxCursorDiv = 0;
    // Track time offset within this measure using divisions and currentBpm
    // For simplicity within a single measure, convert div offset via current secPerDiv
    let measureOffsetSec = 0;
    let cursorSec = measureStartSec;
    let lastNoteStartSec = measureStartSec;

    const divToSec = (divs: number) => (divs / Math.max(1, divisions)) * (60 / currentBpm);

    let elemMatch: RegExpExecArray | null;
    while ((elemMatch = elemRegex.exec(measureBody)) !== null) {
      const tag = elemMatch[1] || elemMatch[3];
      const body = elemMatch[2] || elemMatch[4] || "";

      if (tag === "attributes") {
        const divText = getTagText(body, "divisions");
        if (divText) {
          const parsedDiv = Number(divText);
          if (Number.isFinite(parsedDiv) && parsedDiv > 0) divisions = parsedDiv;
        }
        if (!keyFound) {
          const fifthsText = getTagText(body, "fifths");
          if (fifthsText !== null) {
            const parsedFifths = Number(fifthsText);
            if (Number.isFinite(parsedFifths)) {
              keySignatureFifths = Math.max(-7, Math.min(7, Math.round(parsedFifths)));
              keyFound = true;
            }
          }
        }
        if (!timeFound) {
          const beatsText = getTagText(body, "beats");
          const beatTypeText = getTagText(body, "beat-type");
          if (beatsText && beatTypeText) {
            const num = Number(beatsText);
            const den = Number(beatTypeText);
            if (Number.isFinite(num) && num > 0 && Number.isFinite(den) && den > 0) {
              timeSignature = { numerator: num, denominator: den };
              timeFound = true;
            }
          }
        }
      } else if (tag === "direction" || tag === "sound") {
        const tempoAttr = /tempo="([^"]+)"/.exec(body);
        if (tempoAttr) {
          const parsedTempo = Number(tempoAttr[1]);
          if (Number.isFinite(parsedTempo) && parsedTempo >= 20 && parsedTempo <= 360) {
            currentBpm = parsedTempo;
            if (initialBpm === null) initialBpm = parsedTempo;
            tempoChanges.push({ timeSec: cursorSec, bpm: parsedTempo });
          }
        }
      } else if (tag === "backup") {
        const durText = getTagText(body, "duration");
        const dur = durText ? Number(durText) : 0;
        if (Number.isFinite(dur) && dur > 0) {
          cursorDiv = Math.max(0, cursorDiv - dur);
          cursorSec = Math.max(measureStartSec, cursorSec - divToSec(dur));
        }
      } else if (tag === "forward") {
        const durText = getTagText(body, "duration");
        const dur = durText ? Number(durText) : 0;
        if (Number.isFinite(dur) && dur > 0) {
          cursorDiv += dur;
          cursorSec += divToSec(dur);
          if (cursorDiv > maxCursorDiv) {
            maxCursorDiv = cursorDiv;
            measureOffsetSec = Math.max(measureOffsetSec, cursorSec - measureStartSec);
          }
        }
      } else if (tag === "note") {
        const isGrace = /<grace\b/.test(body);
        const isRest = /<rest\b/.test(body);
        const isChord = /<chord\b/.test(body);
        const durText = getTagText(body, "duration");
        const durDiv = durText ? Number(durText) : 0;
        const durSec = isGrace ? 0.08 : divToSec(durDiv);

        const noteStartSec = isChord ? lastNoteStartSec : cursorSec;
        const noteStartDiv = isChord ? lastNoteStartDiv : cursorDiv;

        if (!isRest && !/<notehead[^>]*>none<\/notehead>/.test(body)) {
          const step = getTagText(body, "step");
          const octaveText = getTagText(body, "octave");
          if (step && octaveText !== null) {
            const alterText = getTagText(body, "alter");
            const alter = alterText ? Number(alterText) : 0;
            const octave = Number(octaveText);
            const midiNote = Math.max(21, Math.min(108, pitchToMidi(step, alter, octave)));
            const staffText = getTagText(body, "staff");
            const staff: 1 | 2 =
              staffText === "2" ? 2 : staffText === "1" ? 1 : midiNote < 60 ? 2 : 1;

            const hasTieStop = /<tie\b[^>]*type="stop"/.test(body);
            const hasTieStart = /<tie\b[^>]*type="start"/.test(body);
            const tieKey = `${staff}:${midiNote}`;

            if (hasTieStop && openTies.has(tieKey)) {
              const prevIdx = openTies.get(tieKey)!;
              const prev = rawNotes[prevIdx]!;
              prev.durationSec = Math.max(prev.durationSec, noteStartSec + durSec - prev.startSec);
              if (!hasTieStart) {
                openTies.delete(tieKey);
              }
            } else {
              const idx = rawNotes.length;
              rawNotes.push({
                midi: midiNote,
                startSec: noteStartSec,
                durationSec: Math.max(0.06, durSec),
                velocity: staff === 1 ? 0.78 : 0.66,
                staff,
              });
              if (hasTieStart) {
                openTies.set(tieKey, idx);
              }
            }
          }
        }

        if (!isChord && !isGrace && Number.isFinite(durDiv) && durDiv > 0) {
          lastNoteStartDiv = noteStartDiv;
          lastNoteStartSec = noteStartSec;
          cursorDiv += durDiv;
          cursorSec += durSec;
          if (cursorDiv > maxCursorDiv) {
            maxCursorDiv = cursorDiv;
            measureOffsetSec = Math.max(measureOffsetSec, cursorSec - measureStartSec);
          }
        }
      }
    }

    if (measureOffsetSec <= 0) {
      // Fallback measure duration from time signature if measure was empty
      const beatsPerMeasure = timeSignature.numerator * (4 / timeSignature.denominator);
      measureOffsetSec = beatsPerMeasure * (60 / currentBpm);
    }
    measureStartSec += measureOffsetSec;
  }

  const bpm = Math.round(initialBpm ?? currentBpm);
  const midi = new Midi();
  midi.header.setTempo(bpm);
  midi.header.timeSignatures.push({
    ticks: 0,
    timeSignature: [timeSignature.numerator, timeSignature.denominator],
  });
  midi.header.keySignatures.push({
    ticks: 0,
    key: FIFTHS_TO_KEY[keySignatureFifths] ?? "C",
    scale: "major",
  });

  // Preserve tempo changes if any occur after t=0
  const ppq = midi.header.ppq;
  if (tempoChanges.length > 1) {
    midi.header.tempos = [];
    for (const tc of tempoChanges) {
      const ticks = Math.round((tc.timeSec * bpm * ppq) / 60);
      midi.header.tempos.push({ ticks, bpm: tc.bpm });
    }
    midi.header.update();
  }

  const rightTrack = midi.addTrack();
  rightTrack.name = "Right Hand";
  const leftTrack = midi.addTrack();
  leftTrack.name = "Left Hand";

  let minNote = 127;
  let maxNote = 0;

  for (const n of rawNotes) {
    const target = n.staff === 2 ? leftTrack : rightTrack;
    target.addNote({
      midi: n.midi,
      time: n.startSec,
      duration: Math.max(0.06, n.durationSec),
      velocity: n.velocity,
    });
    if (n.midi < minNote) minNote = n.midi;
    if (n.midi > maxNote) maxNote = n.midi;
  }

  if (rawNotes.length === 0) {
    minNote = 60;
    maxNote = 72;
  }

  const durationSec = Math.round(Math.max(midi.duration, measureStartSec) * 10) / 10;

  return {
    midi,
    minNote,
    maxNote,
    bpm,
    durationSec,
    keySignatureFifths,
    timeSignature,
    noteCount: rawNotes.length,
  };
}
