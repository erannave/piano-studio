import { describe, expect, test } from "bun:test";
import { convertMusicXmlToMidi } from "../src/shared/musicXmlToMidi.ts";

const SAMPLE_XML = `<?xml version="1.0" encoding="utf-8"?>
<score-partwise version="4.0">
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>2</divisions>
        <key><fifths>1</fifths></key>
        <time><beats>3</beats><beat-type>4</beat-type></time>
        <staves>2</staves>
      </attributes>
      <direction><sound tempo="120"/></direction>
      <note>
        <pitch><step>G</step><octave>4</octave></pitch>
        <duration>2</duration>
        <staff>1</staff>
        <tie type="start"/>
      </note>
      <note>
        <chord/>
        <pitch><step>B</step><octave>4</octave></pitch>
        <duration>2</duration>
        <staff>1</staff>
      </note>
      <note>
        <pitch><step>G</step><octave>4</octave></pitch>
        <duration>4</duration>
        <staff>1</staff>
        <tie type="stop"/>
      </note>
      <backup><duration>6</duration></backup>
      <note>
        <pitch><step>G</step><octave>3</octave></pitch>
        <duration>6</duration>
        <staff>2</staff>
      </note>
    </measure>
  </part>
</score-partwise>`;

describe("musicXmlToMidi", () => {
  test("converts 2-staff MusicXML into RH/LH tracks, merges ties, and preserves key/time/tempo", () => {
    const res = convertMusicXmlToMidi(SAMPLE_XML);
    expect(res.bpm).toBe(120);
    expect(res.keySignatureFifths).toBe(1);
    expect(res.timeSignature).toEqual({ numerator: 3, denominator: 4 });
    expect(res.midi.tracks.length).toBe(2);

    const rh = res.midi.tracks[0]!.notes;
    const lh = res.midi.tracks[1]!.notes;
    // G4 was tied across 1 beat + 2 beats = 3 beats = 1.5s at 120 BPM
    expect(rh.length).toBe(2);
    const g4 = rh.find((n) => n.midi === 67)!;
    const b4 = rh.find((n) => n.midi === 71)!;
    expect(g4.duration).toBeCloseTo(1.5, 2);
    expect(b4.time).toBeCloseTo(0, 2);
    expect(b4.duration).toBeCloseTo(0.5, 2);

    expect(lh.length).toBe(1);
    expect(lh[0]!.midi).toBe(55);
    expect(lh[0]!.duration).toBeCloseTo(1.5, 2);
  });
});
