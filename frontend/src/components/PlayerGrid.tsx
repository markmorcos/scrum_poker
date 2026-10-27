import React from "react";
import { User } from "../types";

interface PlayerGridProps {
  users: User[];
  showEstimates: boolean;
  /** Marks this participant's tile (used when a voter sees the grid on a laptop) */
  highlightUserId?: string;
}

/**
 * Player tiles for the shared board: one card per participant showing
 * whether they voted and, once revealed, their estimate. Sized to read
 * from across a meeting room.
 */
export const PlayerGrid: React.FC<PlayerGridProps> = ({ users, showEstimates, highlightUserId }) => {
  if (users.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center text-gray-500 dark:text-dark-text-secondary">
        <div className="text-5xl mb-4">📱</div>
        <p className="text-xl font-medium">Waiting for people to scan the code…</p>
      </div>
    );
  }

  return (
    <ul className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
      {users.map((user) => {
        const revealed = showEstimates && user.estimate;
        const isHighlighted = user.id === highlightUserId;
        return (
          <li
            key={user.id}
            data-testid="player-tile"
            className={`flex flex-col items-center gap-3 rounded-xl bg-white dark:bg-dark-surface p-4 shadow transition-colors duration-200 ${
              isHighlighted ? "ring-2 ring-blue-500" : ""
            }`}
          >
            <div
              className={`flex items-center justify-center w-20 h-28 rounded-lg text-3xl font-bold transition-all duration-300 ${
                revealed
                  ? "bg-blue-600 dark:bg-blue-300 text-white dark:text-gray-900 border-2 border-blue-700 dark:border-blue-400 shadow-md"
                  : user.hasVoted
                  ? "bg-green-100 dark:bg-green-900/30 border-2 border-green-300 dark:border-green-700"
                  : "border-2 border-dashed border-gray-300 dark:border-dark-border"
              }`}
            >
              {revealed ? (
                user.estimate
              ) : user.hasVoted ? (
                <svg
                  className="w-10 h-10 text-green-600 dark:text-green-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-label="Voted"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <span className="text-gray-400 dark:text-dark-text-secondary text-2xl" aria-label="Waiting">
                  …
                </span>
              )}
            </div>
            <span className="max-w-full truncate text-lg font-medium text-gray-900 dark:text-dark-text">
              {user.name}
            </span>
            {isHighlighted && (
              <span className="-mt-2 text-sm text-blue-600 dark:text-blue-400">(you)</span>
            )}
          </li>
        );
      })}
    </ul>
  );
};
