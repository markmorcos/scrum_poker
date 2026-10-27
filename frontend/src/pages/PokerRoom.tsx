/**
 * PokerRoom.tsx - Mobile voting screen
 *
 * What participants see after scanning the board's QR code: a large card
 * grid to vote with, the round status, and the results once revealed.
 * The room itself (everyone's cards) lives on the shared board.
 *
 * The facilitator's phone (opened through the board's facilitator QR, which
 * carries the host token) additionally gets a bottom bar to reveal and start
 * a new round.
 */
import React, { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ConnectionStatus } from "../components/ConnectionStatus";
import { PlayerGrid } from "../components/PlayerGrid";
import { PokerCard } from "../components/PokerCard";
import { isConsensus, useConsensusConfetti } from "../hooks/useConsensusConfetti";
import { useRoomConnection } from "../hooks/useRoomConnection";
import { wsService } from "../services/websocket";
import { FIBONACCI_VALUES, MessageType, SPECIAL_VALUES } from "../types";
import { useWakeLock, vibrate } from "../utils/device";
import { captureHostTokenFromUrl, getStoredHostToken } from "../utils/host";

interface PokerRoomProps {
  userName: string;
  userId: string;
  setUserId: (id: string) => void;
}

const allCards = [...FIBONACCI_VALUES, ...SPECIAL_VALUES];

export const PokerRoom: React.FC<PokerRoomProps> = ({ userName, userId, setUserId }) => {
  const { roomId = "" } = useParams<{ roomId: string }>();
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [hostToken] = useState<string | null>(() => {
    captureHostTokenFromUrl(roomId);
    return getStoredHostToken(roomId);
  });
  const [isHost, setIsHost] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const voteKey = `scrumPokerVote_${roomId}_${userName}`;
  const userIdKey = `scrumPokerUserId_${roomId}_${userName}`;

  const subscribe = useCallback(() => {
    wsService.send({
      type: MessageType.JOIN,
      payload: {
        name: userName,
        roomId,
        userId: localStorage.getItem(userIdKey) || undefined,
        hostToken: hostToken ?? undefined,
      },
    });
  }, [userName, roomId, userIdKey, hostToken]);

  const connection = useRoomConnection({
    connectKey: `${roomId}|${userName}`,
    subscribe,
    handlers: {
      [MessageType.JOIN]: (payload) => {
        if (payload.userId) {
          setUserId(payload.userId);
          localStorage.setItem(userIdKey, payload.userId);
        }
        setIsHost(Boolean(payload.isHost));
      },
      [MessageType.ERROR]: (payload) => {
        setErrorMessage(payload?.error ?? "Something went wrong");
      },
    },
  });
  const { roomState } = connection;

  useWakeLock();
  useConsensusConfetti(roomState, () => vibrate([30, 50, 30]));

  // Auto-dismiss error toasts
  useEffect(() => {
    if (!errorMessage) return;
    const timeout = setTimeout(() => setErrorMessage(null), 3000);
    return () => clearTimeout(timeout);
  }, [errorMessage]);

  // Store room context in localStorage for recovery after disconnection
  useEffect(() => {
    if (roomId && userName) {
      localStorage.setItem("scrumPokerSession", JSON.stringify({ roomId, userName }));
    }
  }, [roomId, userName]);

  // Load selected card from localStorage on mount
  useEffect(() => {
    const storedVote = localStorage.getItem(voteKey);
    if (storedVote) setSelectedCard(storedVote);
  }, [voteKey]);

  // Sync selected card across tabs using localStorage events
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === voteKey) setSelectedCard(e.newValue);
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [voteKey]);

  // Sync selected card with room state (clear when a new round starts)
  useEffect(() => {
    const currentUser = roomState?.users.find((u) => u.id === userId);
    if (!currentUser) return;
    if (!currentUser.hasVoted) {
      setSelectedCard(null);
      localStorage.removeItem(voteKey);
    } else if (currentUser.estimate && roomState?.showEstimates) {
      setSelectedCard(currentUser.estimate);
    }
  }, [userId, roomState, voteKey]);

  const handleCardSelect = useCallback(
    (value: string) => {
      if (!userId || !roomId) return;

      vibrate();
      setSelectedCard(value);
      localStorage.setItem(voteKey, value);

      wsService.send({
        type: MessageType.VOTE,
        payload: { userId, roomId, estimate: value },
      });
    },
    [userId, roomId, voteKey]
  );

  // Keyboard support for card selection (1, 2, 3, 5, 8) when used on a laptop
  useEffect(() => {
    const validKeys: { [key: string]: string } = { "1": "1", "2": "2", "3": "3", "5": "5", "8": "8" };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!userId || !roomId) return;
      const target = event.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return;
      }
      if (validKeys[event.key]) {
        event.preventDefault();
        handleCardSelect(validKeys[event.key]);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [userId, roomId, handleCardSelect]);

  if (!connection.isReady || !roomState) {
    return (
      <ConnectionStatus
        connectionError={connection.connectionError}
        showError={connection.showError}
        retryCountdown={connection.retryCountdown}
        totalRetryAttempts={connection.totalRetryAttempts}
        onRetry={connection.manualRetry}
        note={`⏱️ Your name "${userName}" will be preserved.`}
      />
    );
  }

  const votedCount = roomState.users.filter((u) => u.hasVoted).length;
  const canControl = isHost && hostToken !== null;

  const hostAction = (
    type: MessageType.SHOW_ESTIMATES | MessageType.HIDE_ESTIMATES | MessageType.DELETE_ESTIMATES
  ) => {
    if (!hostToken) return;
    vibrate();
    if (type === MessageType.DELETE_ESTIMATES) setSelectedCard(null);
    wsService.sendHostAction(type, roomId, hostToken);
  };

  return (
    <div className={`min-h-screen ${canControl ? "pb-28" : "pb-6"}`}>
      {connection.showReconnectingBanner && (
        <div className="bg-blue-50 dark:bg-blue-900/30 p-2 text-center text-sm font-medium text-blue-600 dark:text-blue-400">
          Reconnecting to room...
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-gray-200 dark:border-dark-border bg-white/90 dark:bg-dark-bg/90 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-md lg:max-w-6xl items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-mono text-xs text-gray-500 dark:text-dark-text-secondary">{roomId}</p>
            <p className="truncate font-semibold text-gray-900 dark:text-dark-text">
              {userName}
              {canControl && (
                <span className="ml-2 rounded-full bg-blue-100 dark:bg-blue-900/40 px-2 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300">
                  Facilitator
                </span>
              )}
            </p>
          </div>
          <span
            data-testid="round-status"
            className={`shrink-0 rounded-full px-3 py-1 text-sm font-medium ${
              roomState.showEstimates
                ? "bg-blue-600 text-white"
                : "bg-gray-100 dark:bg-dark-surface text-gray-700 dark:text-dark-text"
            }`}
          >
            {roomState.showEstimates ? "Revealed" : `${votedCount}/${roomState.users.length} voted`}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-md lg:max-w-6xl px-4 pt-5 lg:grid lg:grid-cols-[minmax(0,28rem)_1fr] lg:items-start lg:gap-10">
        <div className="space-y-5">
          {roomState.showEstimates ? (
            <section className="rounded-xl bg-white dark:bg-dark-surface p-4 shadow lg:hidden">
              {isConsensus(roomState) && (
                <p className="mb-3 text-center text-lg font-semibold text-green-700 dark:text-green-300">
                  🎉 Everyone agrees!
                </p>
              )}
              <ul className="divide-y divide-gray-100 dark:divide-dark-border">
                {roomState.users.map((user) => (
                  <li key={user.id} className="flex items-center justify-between py-2">
                    <span className={`truncate ${user.id === userId ? "font-semibold" : ""} text-gray-900 dark:text-dark-text`}>
                      {user.name}
                      {user.id === userId && <span className="ml-1 text-xs text-blue-600 dark:text-blue-400">(you)</span>}
                    </span>
                    <span className="ml-3 min-w-[2.5rem] rounded-md bg-blue-600 dark:bg-blue-300 px-2 py-1 text-center font-bold text-white dark:text-gray-900">
                      {user.estimate ?? "–"}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <p className="text-center text-gray-600 dark:text-dark-text-secondary">
              {selectedCard ? (
                <>
                  Your vote: <span className="font-bold text-gray-900 dark:text-dark-text">{selectedCard}</span>
                  <span className="block text-xs">Tap another card to change it</span>
                </>
              ) : (
                "Pick your estimate"
              )}
            </p>
          )}

          <div className="grid grid-cols-3 gap-3">
            {allCards.map((value) => (
              <PokerCard
                key={value}
                value={value}
                isSelected={selectedCard === value}
                onClick={() => handleCardSelect(value)}
              />
            ))}
          </div>
        </div>

        {/* Laptop: live player panel next to the cards, like a mini board */}
        <aside data-testid="player-panel" className="hidden lg:block lg:sticky lg:top-24 space-y-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text">
              {roomState.showEstimates ? "Results" : "Players"}
            </h2>
            <span className="text-sm text-gray-500 dark:text-dark-text-secondary">
              {votedCount} / {roomState.users.length} voted
            </span>
          </div>
          {roomState.showEstimates && isConsensus(roomState) && (
            <div className="rounded-xl bg-green-100 dark:bg-green-900/30 p-3 text-center text-lg font-semibold text-green-800 dark:text-green-300">
              🎉 Everyone agrees on {roomState.users.find((u) => u.hasVoted)?.estimate}
            </div>
          )}
          <PlayerGrid
            users={roomState.users}
            showEstimates={roomState.showEstimates}
            highlightUserId={userId}
          />
        </aside>
      </main>

      {errorMessage && (
        <div
          role="alert"
          className="fixed inset-x-4 top-4 z-30 mx-auto max-w-md rounded-lg bg-red-600 px-4 py-3 text-center text-sm font-medium text-white shadow-lg"
        >
          {errorMessage}
        </div>
      )}

      {/* Facilitator controls */}
      {canControl && (
        <div
          data-testid="host-bar"
          className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface px-4 pt-3"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          <div className="mx-auto flex max-w-md lg:max-w-6xl gap-3">
            <button
              onClick={() => hostAction(MessageType.DELETE_ESTIMATES)}
              className="flex-1 rounded-xl border border-gray-300 dark:border-dark-border py-3 font-semibold text-gray-700 dark:text-dark-text"
            >
              New round
            </button>
            <button
              onClick={() =>
                hostAction(roomState.showEstimates ? MessageType.HIDE_ESTIMATES : MessageType.SHOW_ESTIMATES)
              }
              className="flex-1 rounded-xl bg-blue-600 dark:bg-blue-700 py-3 font-semibold text-white"
            >
              {roomState.showEstimates ? "Hide" : "Reveal"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
