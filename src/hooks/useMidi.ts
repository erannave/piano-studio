import { useEffect } from "react";
import { useAppStore } from "../store/appStore.ts";

/**
 * Connects to the browser's Web MIDI API and feeds noteOn / noteOff events into the global Zustand store.
 * Requires a secure context (localhost or HTTPS).
 */
export function useMidi(): void {
  const setMidiStatus = useAppStore((s) => s.setMidiStatus);
  const handleMidiNoteOn = useAppStore((s) => s.handleMidiNoteOn);
  const handleMidiNoteOff = useAppStore((s) => s.handleMidiNoteOff);
  const clearActiveUserNotes = useAppStore((s) => s.clearActiveUserNotes);

  useEffect(() => {
    if (typeof navigator === "undefined" || typeof navigator.requestMIDIAccess !== "function") {
      setMidiStatus("unsupported", []);
      return;
    }

    let midiAccess: MIDIAccess | null = null;
    let cancelled = false;

    const handleMidiMessage = (event: MIDIMessageEvent) => {
      const data = event.data;
      if (!data || data.length < 3) return;
      const status = data[0]! & 0xf0;
      const midi = data[1]!;
      const velocity = data[2]!;

      if (status === 0x90 && velocity > 0) {
        handleMidiNoteOn(midi, velocity);
      } else if (status === 0x80 || (status === 0x90 && velocity === 0)) {
        handleMidiNoteOff(midi);
      }
    };

    const bindInputs = (access: MIDIAccess) => {
      const names: string[] = [];
      for (const input of access.inputs.values()) {
        if (input.state === "connected") {
          names.push(input.name || input.manufacturer || "MIDI Keyboard");
          input.onmidimessage = handleMidiMessage;
        } else {
          input.onmidimessage = null;
        }
      }
      setMidiStatus(names.length > 0 ? "connected" : "no-devices", names);
    };

    navigator
      .requestMIDIAccess()
      .then((access) => {
        if (cancelled) return;
        midiAccess = access;
        bindInputs(access);
        access.onstatechange = () => {
          if (!cancelled && midiAccess) {
            clearActiveUserNotes();
            bindInputs(midiAccess);
          }
        };
      })
      .catch(() => {
        if (!cancelled) {
          setMidiStatus("denied", []);
        }
      });

    return () => {
      cancelled = true;
      if (midiAccess) {
        midiAccess.onstatechange = null;
        for (const input of midiAccess.inputs.values()) {
          input.onmidimessage = null;
        }
      }
    };
  }, [setMidiStatus, handleMidiNoteOn, handleMidiNoteOff, clearActiveUserNotes]);
}
