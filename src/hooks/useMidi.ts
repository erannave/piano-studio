import { useEffect } from "react";
import type { MidiDeviceInfo } from "../shared/types.ts";
import { useAppStore } from "../store/appStore.ts";

/**
 * Connects to the browser's Web MIDI API and feeds noteOn, noteOff, and sustain pedal (CC64)
 * events into the global Zustand store. Respects `selectedMidiDeviceId` when set.
 */
export function useMidi(): void {
  const setMidiStatus = useAppStore((s) => s.setMidiStatus);
  const handleMidiNoteOn = useAppStore((s) => s.handleMidiNoteOn);
  const handleMidiNoteOff = useAppStore((s) => s.handleMidiNoteOff);
  const setSustainPedal = useAppStore((s) => s.setSustainPedal);
  const clearActiveUserNotes = useAppStore((s) => s.clearActiveUserNotes);

  useEffect(() => {
    if (typeof navigator === "undefined" || typeof navigator.requestMIDIAccess !== "function") {
      setMidiStatus("unsupported", []);
      return;
    }

    let midiAccess: MIDIAccess | null = null;
    let cancelled = false;

    const handleMidiMessage = (deviceId: string) => (event: MIDIMessageEvent) => {
      const selectedId = useAppStore.getState().selectedMidiDeviceId;
      if (selectedId && selectedId !== deviceId) return;

      const data = event.data;
      if (!data || data.length < 3) return;
      const status = data[0]! & 0xf0;
      const d1 = data[1]!;
      const d2 = data[2]!;

      if (status === 0x90 && d2 > 0) {
        handleMidiNoteOn(d1, d2);
      } else if (status === 0x80 || (status === 0x90 && d2 === 0)) {
        handleMidiNoteOff(d1);
      } else if (status === 0xb0 && d1 === 64) {
        // Sustain pedal (Damper CC64)
        setSustainPedal(d2 >= 64);
      }
    };

    const bindInputs = (access: MIDIAccess) => {
      const devices: MidiDeviceInfo[] = [];
      for (const input of access.inputs.values()) {
        if (input.state === "connected") {
          devices.push({
            id: input.id,
            name: input.name || input.manufacturer || "MIDI Keyboard",
          });
          input.onmidimessage = handleMidiMessage(input.id);
        } else {
          input.onmidimessage = null;
        }
      }
      setMidiStatus(devices.length > 0 ? "connected" : "no-devices", devices);
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
  }, [setMidiStatus, handleMidiNoteOn, handleMidiNoteOff, setSustainPedal, clearActiveUserNotes]);
}
