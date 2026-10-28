import React from "react";
import { getRetryDelay } from "../hooks/useRoomConnection";

interface ConnectionStatusProps {
  connectionError: string | null;
  showError: boolean;
  retryCountdown: number;
  totalRetryAttempts: number;
  onRetry: () => void;
  /** Extra reassurance line shown while the server wakes up */
  note?: string;
}

/**
 * Full-screen "connecting" / "waking up the server" state shared by the board
 * and the vote screen.
 */
export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({
  connectionError,
  showError,
  retryCountdown,
  totalRetryAttempts,
  onRetry,
  note,
}) => {
  const isWaking = Boolean(connectionError && showError);
  const retryDelay = getRetryDelay(totalRetryAttempts);

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center max-w-sm space-y-6">
        {isWaking ? (
          <div className="text-5xl animate-bounce">😴</div>
        ) : (
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 dark:border-blue-400 mx-auto"></div>
        )}

        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text mb-2">
            {isWaking ? "Waking up the server..." : "Connecting to room..."}
          </h3>
          <p className="text-sm text-gray-500 dark:text-dark-text-secondary">
            {isWaking
              ? "The server is starting up. This usually takes 1–2 minutes."
              : "Hang tight, connecting you now."}
          </p>
        </div>

        {isWaking && (
          <>
            {retryCountdown > 0 && (
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                <div
                  className="bg-blue-600 dark:bg-blue-400 h-1.5 rounded-full transition-all duration-1000 ease-linear"
                  style={{
                    width: `${
                      (((retryDelay || 10) - retryCountdown) / (retryDelay || 10)) * 100
                    }%`,
                  }}
                ></div>
              </div>
            )}

            <p className="text-xs text-gray-400 dark:text-gray-500">
              {retryCountdown > 0
                ? `Retrying in ${retryCountdown}s...`
                : retryDelay === null
                ? "Auto-retry exhausted."
                : "Retrying..."}
            </p>

            <div className="text-sm text-gray-500 dark:text-dark-text-secondary space-y-1">
              <p>{"💤"} The server is sleeping to save resources.</p>
              {note && <p>{note}</p>}
            </div>

            <button
              onClick={onRetry}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              Try now
            </button>
          </>
        )}
      </div>
    </div>
  );
};
