import { useEffect, useRef } from "react";
import confetti from "canvas-confetti";
import { RoomState } from "../types";

/** Whether every voter picked the same card (and at least one person voted) */
export const isConsensus = (roomState: RoomState | null) => {
  const voters = roomState?.users.filter((u) => u.hasVoted) ?? [];
  return voters.length > 0 && voters.every((u) => u.estimate === voters[0].estimate);
};

/**
 * Fires confetti when estimates are revealed and all voters agree.
 * Optionally runs `onConsensus` at the same moment (e.g. a haptic buzz).
 */
export const useConsensusConfetti = (
  roomState: RoomState | null,
  onConsensus?: () => void
) => {
  const prevShowEstimatesRef = useRef(false);

  useEffect(() => {
    const wasHidden = !prevShowEstimatesRef.current;
    const isNowShown = roomState?.showEstimates ?? false;
    prevShowEstimatesRef.current = isNowShown;

    if (!wasHidden || !isNowShown || !isConsensus(roomState)) return;

    onConsensus?.();

    const duration = 3000;
    const end = Date.now() + duration;
    const interval = setInterval(() => {
      const timeLeft = end - Date.now();
      if (timeLeft <= 0) return clearInterval(interval);

      const count = 50 * (timeLeft / duration);
      confetti({ startVelocity: 30, spread: 360, ticks: 60, zIndex: 9999, particleCount: count, origin: { x: Math.random() * 0.2 + 0.1, y: Math.random() - 0.2 } });
      confetti({ startVelocity: 30, spread: 360, ticks: 60, zIndex: 9999, particleCount: count, origin: { x: Math.random() * 0.2 + 0.7, y: Math.random() - 0.2 } });
    }, 250);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomState]);
};
