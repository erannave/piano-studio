import { useEffect } from "react";

export interface WakeLockSentinelLike {
  released?: boolean;
  release: () => Promise<void>;
}

export interface WakeLockNavigatorLike {
  wakeLock?: {
    request: (type: "screen") => Promise<WakeLockSentinelLike>;
  };
}

export interface WakeLockDocumentLike {
  visibilityState: DocumentVisibilityState;
  addEventListener: (type: "visibilitychange", listener: () => void) => void;
  removeEventListener: (type: "visibilitychange", listener: () => void) => void;
}

/**
 * Acquires a Screen Wake Lock while active and re-acquires it whenever the document
 * returns to the visible state. Returns a cleanup function that releases the lock
 * and removes the visibilitychange listener.
 */
export function startWakeLock(
  nav: WakeLockNavigatorLike | undefined = typeof navigator !== "undefined"
    ? (navigator as unknown as WakeLockNavigatorLike)
    : undefined,
  doc: WakeLockDocumentLike | undefined = typeof document !== "undefined" ? document : undefined,
): () => void {
  const wakeLockApi = nav?.wakeLock;
  if (!wakeLockApi || typeof wakeLockApi.request !== "function") {
    return () => {};
  }

  let disposed = false;
  let sentinel: WakeLockSentinelLike | null = null;
  let requestInFlight = false;

  const acquire = async () => {
    if (disposed || requestInFlight) return;
    if (doc && doc.visibilityState !== "visible") return;
    if (sentinel && !sentinel.released) return;

    requestInFlight = true;
    try {
      const nextSentinel = await wakeLockApi.request("screen");
      if (disposed) {
        await nextSentinel.release().catch(() => {});
        return;
      }
      sentinel = nextSentinel;
    } catch {
      // Ignore permission/battery-saver rejections silently
    } finally {
      requestInFlight = false;
    }
  };

  const handleVisibilityChange = () => {
    if (!disposed && doc?.visibilityState === "visible") {
      void acquire();
    }
  };

  void acquire();
  doc?.addEventListener("visibilitychange", handleVisibilityChange);

  return () => {
    disposed = true;
    doc?.removeEventListener("visibilitychange", handleVisibilityChange);
    if (sentinel) {
      const toRelease = sentinel;
      sentinel = null;
      void toRelease.release().catch(() => {});
    }
  };
}

/**
 * Keeps the device screen awake via the Screen Wake Lock API while `enabled` is true.
 */
export function useWakeLock(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    return startWakeLock();
  }, [enabled]);
}
