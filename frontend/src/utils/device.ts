/**
 * device.ts - Small mobile niceties (haptics, keeping the screen awake)
 *
 * Every helper is a no-op where the browser doesn't support the API.
 */
import { useEffect } from "react";

/** Short haptic tap; ignored on devices without vibration support (e.g. iOS Safari) */
export const vibrate = (pattern: number | number[] = 15) => {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Some browsers throw when vibration is blocked by permissions policy
  }
};

/**
 * Keeps the screen on while the component is mounted, so phones don't lock
 * mid-round and the shared board doesn't dim during discussion.
 * The lock is released by the browser when the tab is hidden, so it is
 * re-acquired whenever the page becomes visible again.
 */
export const useWakeLock = (active = true) => {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;

    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const lock = await navigator.wakeLock.request("screen");
        if (cancelled) {
          lock.release();
        } else {
          sentinel = lock;
        }
      } catch {
        // Denied (battery saver, no user gesture yet); nothing to do
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") acquire();
    };

    acquire();
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibility);
      sentinel?.release();
    };
  }, [active]);
};
