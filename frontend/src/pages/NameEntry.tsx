/**
 * NameEntry.tsx - Landing page
 *
 * Two ways in:
 * 1. Start a session on the shared screen: creates an animal-named room
 *    (e.g. "happy-panda") and opens its board with a QR code. No name needed.
 * 2. Join as a voter: enter your name (remembered for next time) and the
 *    room name. People who scan the board's QR code land here with the room
 *    pre-selected, or skip straight to voting if their name is remembered.
 */

import React, { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useLocation, useNavigate } from "react-router-dom";

interface NameEntryProps {
  /** Callback function called when user successfully submits their name */
  onNameSubmit: (name: string) => void;
}

interface JoinFormData {
  /** The user's display name */
  name: string;
  /** The room name to join (only asked when not arriving from a room link) */
  roomCode: string;
}

/**
 * Lists of adjectives and animals for generating room names
 */
const adjectives = [
  "happy",
  "brave",
  "clever",
  "gentle",
  "swift",
  "mighty",
  "calm",
  "bright",
  "wise",
  "jolly",
  "proud",
  "fierce",
  "noble",
  "quiet",
  "wild",
  "bold",
  "quick",
  "strong",
  "agile",
  "graceful",
  "loyal",
  "keen",
  "cheerful",
  "daring",
  "eager",
  "fearless",
  "friendly",
  "generous",
  "honest",
  "kind",
  "lively",
  "merry",
];

const animals = [
  "panda",
  "tiger",
  "lion",
  "elephant",
  "giraffe",
  "zebra",
  "koala",
  "kangaroo",
  "dolphin",
  "whale",
  "eagle",
  "hawk",
  "owl",
  "penguin",
  "fox",
  "wolf",
  "bear",
  "deer",
  "rabbit",
  "otter",
  "seal",
  "turtle",
  "falcon",
  "raven",
  "leopard",
  "cheetah",
  "jaguar",
  "lynx",
  "bison",
  "moose",
  "badger",
  "raccoon",
];

/**
 * Generates a unique room name using adjective-animal combination
 * @returns A string like "happy-panda" or "brave-tiger"
 */
const generateRoomCode = (): string => {
  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const animal = animals[Math.floor(Math.random() * animals.length)];
  return `${adjective}-${animal}`;
};

/**
 * NameEntry Component - Landing page with session start and join options
 */
export const NameEntry: React.FC<NameEntryProps> = ({ onNameSubmit }) => {
  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
    setValue,
  } = useForm<JoinFormData>();

  const navigate = useNavigate();
  const location = useLocation();

  const watchedName = watch("name");
  const storedName = localStorage.getItem("scrumPokerUserName");

  // Room ID from location state (set when redirected from a room link / QR code)
  const redirectRoomId = (location.state as { roomId?: string })?.roomId;

  // Remembered name: pre-fill, and join right away when arriving from a room link
  useEffect(() => {
    if (storedName) {
      setValue("name", storedName);
      if (redirectRoomId) {
        onNameSubmit(storedName);
        navigate(`/room/${redirectRoomId}`, { replace: true });
      }
    }
  }, [redirectRoomId, storedName, onNameSubmit, navigate, setValue]);

  const handleStartSession = () => {
    navigate(`/board/${generateRoomCode()}`);
  };

  const handleJoin = (data: JoinFormData) => {
    const name = data.name.trim();
    onNameSubmit(name);
    navigate(`/room/${redirectRoomId ?? data.roomCode.trim().toLowerCase()}`);
  };

  const inputClassName =
    "appearance-none relative block w-full px-3 py-3 border border-gray-300 dark:border-dark-border placeholder-gray-500 dark:placeholder-dark-text-secondary text-gray-900 dark:text-dark-text bg-white dark:bg-dark-surface rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 text-base transition-colors duration-200";

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-dark-text mb-2">
            Scrum Poker
          </h1>
          <p className="text-lg text-gray-600 dark:text-dark-text-secondary">
            {redirectRoomId ? (
              <>
                Join room <span className="font-mono font-bold">{redirectRoomId}</span>
              </>
            ) : (
              "Estimate together: one screen, everyone's phone"
            )}
          </p>
        </div>

        {/* Join as a voter */}
        <form onSubmit={handleSubmit(handleJoin)} className="space-y-4">
          {!redirectRoomId && (
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-dark-text-secondary">
              Join a room
            </h2>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-dark-text">
                Your name
              </label>
              {storedName && watchedName === storedName && (
                <button
                  type="button"
                  onClick={() => {
                    localStorage.removeItem("scrumPokerUserName");
                    setValue("name", "");
                  }}
                  className="text-xs text-blue-600 dark:text-blue-400 underline"
                >
                  Not you?
                </button>
              )}
            </div>
            <input
              id="name"
              {...register("name", {
                required: "Name is required",
                validate: (value) => value.trim().length > 0 || "Name is required",
              })}
              type="text"
              autoComplete="nickname"
              autoFocus={Boolean(redirectRoomId)}
              placeholder="Enter your display name"
              className={inputClassName}
            />
            {errors.name && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.name.message}</p>
            )}
          </div>

          {!redirectRoomId && (
            <div>
              <label htmlFor="roomCode" className="block text-sm font-medium text-gray-700 dark:text-dark-text mb-2">
                Room name
              </label>
              <input
                id="roomCode"
                {...register("roomCode", {
                  required: "Room name is required",
                  pattern: {
                    value: /^[a-z]+-[a-z]+$/i,
                    message: "Room name must be in format: word-word (e.g., happy-panda)",
                  },
                })}
                type="text"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="happy-panda"
                className={`${inputClassName} font-mono`}
              />
              {errors.roomCode && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.roomCode.message}</p>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={!watchedName}
            className="w-full flex justify-center py-3 px-4 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-dark-bg focus:ring-blue-500 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Join and vote
          </button>
        </form>

        {/* Start a session on the shared screen */}
        {!redirectRoomId && (
          <div className="space-y-3 border-t border-gray-200 dark:border-dark-border pt-8">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-dark-text-secondary">
              Running the session?
            </h2>
            <button
              type="button"
              onClick={handleStartSession}
              className="w-full flex justify-center items-center py-3 px-4 border border-gray-300 dark:border-dark-border text-base font-medium rounded-md text-gray-700 dark:text-dark-text bg-white dark:bg-dark-surface hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-dark-bg focus:ring-blue-500 transition-colors duration-200"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Start session on this screen
            </button>
            <p className="text-sm text-gray-500 dark:text-dark-text-secondary text-center">
              Open this on the TV or projector. Everyone joins by scanning the QR code.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
