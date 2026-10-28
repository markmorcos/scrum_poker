/**
 * Board.tsx - Shared-screen view of a room
 *
 * Shown on the TV / projector. Displays a QR code people scan to vote from
 * their phones, live voting progress, and (for the facilitator) the reveal
 * and new-round controls. The board is not a participant itself.
 *
 * The first board to open a room is issued a host token by the backend; it
 * is kept in localStorage so a refresh keeps facilitator rights, and can be
 * handed to the facilitator's phone through a second QR code.
 */
import React, { useCallback, useState } from "react";
import { useParams } from "react-router-dom";
import { ConnectionStatus } from "../components/ConnectionStatus";
import { PlayerGrid } from "../components/PlayerGrid";
import { QrCode } from "../components/QrCode";
import { isConsensus, useConsensusConfetti } from "../hooks/useConsensusConfetti";
import { useRoomConnection } from "../hooks/useRoomConnection";
import { wsService } from "../services/websocket";
import { MessageType } from "../types";
import { useWakeLock } from "../utils/device";
import {
  captureHostTokenFromUrl,
  getFacilitatorUrl,
  getJoinUrl,
  getStoredHostToken,
  storeHostToken,
} from "../utils/host";

export const Board: React.FC = () => {
  const { roomId = "" } = useParams<{ roomId: string }>();
  const [hostToken, setHostToken] = useState<string | null>(() => {
    captureHostTokenFromUrl(roomId);
    return getStoredHostToken(roomId);
  });
  const [isHost, setIsHost] = useState(false);
  const [showFacilitatorQr, setShowFacilitatorQr] = useState(false);

  const subscribe = useCallback(() => {
    wsService.send({
      type: MessageType.WATCH,
      payload: { roomId, hostToken: getStoredHostToken(roomId) ?? undefined },
    });
  }, [roomId]);

  const connection = useRoomConnection({
    connectKey: roomId,
    subscribe,
    handlers: {
      [MessageType.WATCH]: (payload) => {
        setIsHost(Boolean(payload.isHost));
        if (payload.isHost && payload.hostToken) {
          storeHostToken(roomId, payload.hostToken);
          setHostToken(payload.hostToken);
        }
      },
    },
  });
  const { roomState } = connection;

  useWakeLock();
  useConsensusConfetti(roomState);

  if (!connection.isReady || !roomState) {
    return (
      <ConnectionStatus
        connectionError={connection.connectionError}
        showError={connection.showError}
        retryCountdown={connection.retryCountdown}
        totalRetryAttempts={connection.totalRetryAttempts}
        onRetry={connection.manualRetry}
      />
    );
  }

  const joinUrl = getJoinUrl(roomId);
  const votedCount = roomState.users.filter((u) => u.hasVoted).length;
  const canControl = isHost && hostToken !== null;

  const hostAction = (
    type: MessageType.SHOW_ESTIMATES | MessageType.HIDE_ESTIMATES | MessageType.DELETE_ESTIMATES
  ) => {
    if (hostToken) wsService.sendHostAction(type, roomId, hostToken);
  };

  return (
    <div className="min-h-screen p-6 lg:p-10">
      {connection.showReconnectingBanner && (
        <div className="mb-6 rounded-lg border border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/30 p-3 text-center text-sm font-medium text-blue-600 dark:text-blue-400">
          Reconnecting to room...
        </div>
      )}

      <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[auto_1fr]">
        {/* Join panel */}
        <aside className="flex flex-col items-center gap-4 text-center lg:sticky lg:top-10 lg:self-start">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-dark-text">Scan to vote</h1>
          <QrCode value={joinUrl} size={280} label={`Join room ${roomId}`} />
          <div>
            <p className="font-mono text-2xl font-semibold text-gray-900 dark:text-dark-text">{roomId}</p>
            <p className="mt-1 break-all text-sm text-gray-500 dark:text-dark-text-secondary">{joinUrl}</p>
          </div>
          {canControl ? (
            <button
              onClick={() => setShowFacilitatorQr(true)}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              Facilitate from your phone
            </button>
          ) : (
            <span className="rounded-full bg-gray-200 dark:bg-dark-surface px-3 py-1 text-xs text-gray-600 dark:text-dark-text-secondary">
              View only
            </span>
          )}
        </aside>

        {/* Room panel */}
        <main className="space-y-6">
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <p className="text-sm uppercase tracking-wide text-gray-500 dark:text-dark-text-secondary">
                {roomState.showEstimates ? "Results" : "Voting"}
              </p>
              <p className="text-4xl font-bold text-gray-900 dark:text-dark-text" data-testid="vote-progress">
                {votedCount} / {roomState.users.length} voted
              </p>
            </div>

            {canControl && (
              <div className="ml-auto flex gap-3">
                <button
                  onClick={() => hostAction(MessageType.DELETE_ESTIMATES)}
                  className="rounded-xl border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-surface px-6 py-4 text-lg font-semibold text-gray-700 dark:text-dark-text hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors duration-200"
                >
                  New round
                </button>
                <button
                  onClick={() =>
                    hostAction(
                      roomState.showEstimates ? MessageType.HIDE_ESTIMATES : MessageType.SHOW_ESTIMATES
                    )
                  }
                  className="rounded-xl bg-blue-600 dark:bg-blue-700 px-8 py-4 text-lg font-semibold text-white hover:bg-blue-700 dark:hover:bg-blue-800 transition-colors duration-200"
                >
                  {roomState.showEstimates ? "Hide cards" : "Reveal cards"}
                </button>
              </div>
            )}
          </div>

          {roomState.showEstimates && isConsensus(roomState) && (
            <div className="rounded-xl bg-green-100 dark:bg-green-900/30 p-4 text-center text-2xl font-semibold text-green-800 dark:text-green-300">
              🎉 Everyone agrees on {roomState.users.find((u) => u.hasVoted)?.estimate}
            </div>
          )}

          <PlayerGrid users={roomState.users} showEstimates={roomState.showEstimates} />
        </main>
      </div>

      {/* Facilitator QR: only open it with the facilitator in front of the screen */}
      {showFacilitatorQr && hostToken && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setShowFacilitatorQr(false)}
        >
          <div
            className="max-w-sm rounded-2xl bg-white dark:bg-dark-surface p-6 text-center shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold text-gray-900 dark:text-dark-text">Facilitator link</h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-dark-text-secondary">
              Scan with your phone to vote and run the round from there. Anyone who scans this can reveal
              and reset, so close it once you're done.
            </p>
            <div className="mt-4">
              <QrCode value={getFacilitatorUrl(roomId, hostToken)} size={220} label="Facilitator link" />
            </div>
            <button
              onClick={() => setShowFacilitatorQr(false)}
              className="mt-4 w-full rounded-lg bg-gray-900 dark:bg-gray-100 py-2 font-semibold text-white dark:text-gray-900"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
