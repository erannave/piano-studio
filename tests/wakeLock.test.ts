import { describe, expect, test } from "bun:test";
import {
  startWakeLock,
  type WakeLockDocumentLike,
  type WakeLockNavigatorLike,
  type WakeLockSentinelLike,
} from "../src/hooks/useWakeLock.ts";

function createFakeDoc(initial: DocumentVisibilityState = "visible") {
  const listeners = new Set<() => void>();
  const doc: WakeLockDocumentLike & {
    setVisibility: (state: DocumentVisibilityState) => void;
    listenerCount: () => number;
  } = {
    visibilityState: initial,
    addEventListener(_type, listener) {
      listeners.add(listener);
    },
    removeEventListener(_type, listener) {
      listeners.delete(listener);
    },
    setVisibility(state) {
      doc.visibilityState = state;
      for (const l of listeners) l();
    },
    listenerCount() {
      return listeners.size;
    },
  };
  return doc;
}

describe("startWakeLock", () => {
  test("acquires screen wake lock immediately and releases on cleanup", async () => {
    let requests = 0;
    let releases = 0;
    const sentinel: WakeLockSentinelLike = {
      released: false,
      release: async () => {
        sentinel.released = true;
        releases++;
      },
    };
    const nav: WakeLockNavigatorLike = {
      wakeLock: {
        request: async (type) => {
          expect(type).toBe("screen");
          requests++;
          return sentinel;
        },
      },
    };
    const doc = createFakeDoc("visible");

    const stop = startWakeLock(nav, doc);
    await Promise.resolve();

    expect(requests).toBe(1);
    expect(releases).toBe(0);
    expect(doc.listenerCount()).toBe(1);

    stop();
    await Promise.resolve();

    expect(releases).toBe(1);
    expect(doc.listenerCount()).toBe(0);
  });

  test("re-acquires wake lock when document becomes visible again", async () => {
    let requests = 0;
    const sentinels: WakeLockSentinelLike[] = [];
    const nav: WakeLockNavigatorLike = {
      wakeLock: {
        request: async () => {
          requests++;
          const s: WakeLockSentinelLike = {
            released: false,
            release: async () => {
              s.released = true;
            },
          };
          sentinels.push(s);
          return s;
        },
      },
    };
    const doc = createFakeDoc("visible");

    const stop = startWakeLock(nav, doc);
    await Promise.resolve();
    expect(requests).toBe(1);

    // Simulate browser auto-releasing wake lock when tab hides
    sentinels[0]!.released = true;
    doc.setVisibility("hidden");
    await Promise.resolve();
    expect(requests).toBe(1);

    // Returning to visible re-acquires
    doc.setVisibility("visible");
    await Promise.resolve();
    expect(requests).toBe(2);

    stop();
  });

  test("releases sentinel if cleaned up while request is still in flight", async () => {
    let resolveRequest!: (s: WakeLockSentinelLike) => void;
    let released = false;
    const nav: WakeLockNavigatorLike = {
      wakeLock: {
        request: () =>
          new Promise<WakeLockSentinelLike>((resolve) => {
            resolveRequest = resolve;
          }),
      },
    };
    const doc = createFakeDoc("visible");

    const stop = startWakeLock(nav, doc);
    stop();

    resolveRequest({
      released: false,
      release: async () => {
        released = true;
      },
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(released).toBe(true);
  });

  test("no-ops cleanly when Wake Lock API is unsupported", () => {
    const doc = createFakeDoc("visible");
    const stop = startWakeLock({}, doc);
    expect(doc.listenerCount()).toBe(0);
    stop();
  });
});
