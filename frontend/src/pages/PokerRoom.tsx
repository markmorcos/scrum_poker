import React, { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import confetti from "canvas-confetti";
import { PokerCard } from "../components/PokerCard";
import { UserTable } from "../components/UserTable";
import { getWebSocketUrl } from "../config";
import { wsService } from "../services/websocket";
import {
  FIBONACCI_VALUES,
  MessageType,
  RoomState,
  SPECIAL_VALUES,
} from "../types";

interface PokerRoomProps {
  userName: string;
  userId: string;
  setUserId: (id: string) => void;
}

export const PokerRoom: React.FC<PokerRoomProps> = ({
  userName,
  userId,
  setUserId,
}) => {
  const { roomId } = useParams<{ roomId: string }>();
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [connectionAttempts, setConnectionAttempts] = useState(0);
  const [showError, setShowError] = useState(false);
  const [retryTrigger, setRetryTrigger] = useState(0);
  const [autoRetryEnabled, setAutoRetryEnabled] = useState(true);
  const [retryCountdown, setRetryCountdown] = useState(0);
  const [totalRetryAttempts, setTotalRetryAttempts] = useState(0);
  const [showCopiedNotification, setShowCopiedNotification] = useState(false);
  const [showReconnectingBanner, setShowReconnectingBanner] = useState(false);
  const prevShowEstimatesRef = useRef(false);

  // Fire confetti when estimates are revealed and all voters agree
  useEffect(() => {
    const wasHidden = !prevShowEstimatesRef.current;
    const isNowShown = roomState?.showEstimates ?? false;
    prevShowEstimatesRef.current = isNowShown;

    if (!wasHidden || !isNowShown) return;

    const voters = roomState!.users.filter((u) => u.hasVoted);
    if (voters.length === 0) return;

    const allSame = voters.every((u) => u.estimate === voters[0].estimate);
    if (!allSame) return;

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
  }, [roomState]);

  // Store room context in localStorage for recovery after disconnection
  useEffect(() => {
    if (roomId && userName) {
      localStorage.setItem(
        "scrumPokerSession",
        JSON.stringify({ roomId, userName })
      );
    }
  }, [roomId, userName]);

  // Load selected card from localStorage on mount
  useEffect(() => {
    if (roomId && userName) {
      const voteKey = `scrumPokerVote_${roomId}_${userName}`;
      const storedVote = localStorage.getItem(voteKey);
      if (storedVote) {
        setSelectedCard(storedVote);
      }
    }
  }, [roomId, userName]);

  // Sync selected card across tabs using localStorage events
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (roomId && userName) {
        const voteKey = `scrumPokerVote_${roomId}_${userName}`;
        if (e.key === voteKey) {
          setSelectedCard(e.newValue);
        }
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [roomId, userName]);

  // Sync selected card with room state (clear when estimates deleted)
  useEffect(() => {
    if (userId && roomState?.users) {
      const currentUser = roomState.users.find((u) => u.id === userId);
      if (currentUser) {
        // Clear selection if user hasn't voted (estimates were deleted)
        if (!currentUser.hasVoted) {
          setSelectedCard(null);
          const voteKey = `scrumPokerVote_${roomId}_${userName}`;
          localStorage.removeItem(voteKey);
        }
        // If estimates are shown and user voted, sync from backend
        else if (currentUser.estimate && roomState.showEstimates) {
          setSelectedCard(currentUser.estimate);
        }
      }
    }
  }, [userId, roomState, roomId, userName]);

  // Page Visibility API - Auto-reconnect when tab becomes visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        console.log("[PokerRoom] Tab became visible");

        // Check if we're disconnected
        if (!wsService.isConnected()) {
          console.log(
            "[PokerRoom] Detected disconnection, attempting to reconnect..."
          );
          setShowReconnectingBanner(true);

          // Attempt to reconnect after a short delay
          setTimeout(() => {
            handleRetryConnection();
          }, 500);
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    const connectWebSocket = async () => {
      // Minimum loading time before showing error
      const minLoadingTime = 2000; // 2 seconds
      const startTime = Date.now();

      try {
        setConnectionError(null);
        setShowError(false);
        setConnectionAttempts((prev) => prev + 1);

        // Set a timeout to show error if connection takes too long
        const timeoutId = setTimeout(() => {
          if (!wsService.isConnected()) {
            setConnectionError(
              "Connection timeout. The backend service might be down or starting up."
            );
            // Only show error after minimum loading time
            const elapsed = Date.now() - startTime;
            if (elapsed >= minLoadingTime) {
              setShowError(true);
            } else {
              setTimeout(() => setShowError(true), minLoadingTime - elapsed);
            }
          }
        }, 10000); // 10 seconds timeout

        // Use the configured WebSocket URL
        const wsUrl = getWebSocketUrl();
        console.log("[PokerRoom] WebSocket URL:", wsUrl);
        console.log("[PokerRoom] Connecting to room:", roomId);

        await wsService.connect(wsUrl);
        clearTimeout(timeoutId);
        setIsConnected(true);
        setConnectionError(null);
        setShowReconnectingBanner(false);
        console.log("[PokerRoom] WebSocket connected successfully");

        // Set up message handlers
        wsService.on(MessageType.JOIN, (payload) => {
          if (payload.userId) {
            setUserId(payload.userId);
            // Store userId in localStorage with room key for tab sharing
            const storageKey = `scrumPokerUserId_${roomId}_${userName}`;
            localStorage.setItem(storageKey, payload.userId);
          }
        });

        wsService.on(MessageType.ROOM_UPDATE, (payload) => {
          setRoomState(payload);
        });

        // Check for existing userId for this room+user combination
        const storageKey = `scrumPokerUserId_${roomId}_${userName}`;
        const existingUserId = localStorage.getItem(storageKey);

        // Join the room (reuse userId if available)
        wsService.send({
          type: MessageType.JOIN,
          payload: {
            name: userName,
            roomId: roomId || "default-room",
            userId: existingUserId || undefined, // Include existing userId if available
          },
        });
      } catch (error) {
        console.error("[PokerRoom] Failed to connect to WebSocket:", error);
        console.error("[PokerRoom] Room ID was:", roomId);
        console.error("[PokerRoom] Attempt number:", connectionAttempts);
        setIsConnected(false);
        setConnectionError(
          "Failed to connect to the backend service. The backend might be starting up or experiencing issues."
        );

        // Ensure minimum loading time before showing error
        const elapsed = Date.now() - startTime;
        if (elapsed >= minLoadingTime) {
          setShowError(true);
        } else {
          setTimeout(() => setShowError(true), minLoadingTime - elapsed);
        }
      }
    };

    connectWebSocket();

    return () => {
      wsService.disconnect();
    };
  }, [roomId, userName, setUserId, retryTrigger]);

  const getRetryDelay = (attemptNumber: number): number | null => {
    if (attemptNumber < 10) {
      return 10; // First 10 attempts: 10 seconds
    } else if (attemptNumber < 20) {
      return 30; // Next 10 attempts: 30 seconds
    } else if (attemptNumber < 30) {
      return 60; // Next 10 attempts: 60 seconds
    } else {
      return null; // Stop retrying after 30 attempts
    }
  };

  const handleRetryConnection = () => {
    // Reset error states
    setConnectionError(null);
    setShowError(false);
    setIsConnected(false);
    setRoomState(null);
    setRetryCountdown(0);

    // Trigger reconnection by updating the retry trigger
    setRetryTrigger((prev) => prev + 1);
  };

  const handleManualRetry = () => {
    // Reset total retry attempts on manual retry
    setTotalRetryAttempts(0);
    handleRetryConnection();
  };

  /**
   * Copies the room URL to clipboard
   */
  const handleCopyRoomLink = async () => {
    try {
      const roomUrl = window.location.href;
      await navigator.clipboard.writeText(roomUrl);
      setShowCopiedNotification(true);
      setTimeout(() => setShowCopiedNotification(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  // Auto-retry functionality
  useEffect(() => {
    let countdownInterval: NodeJS.Timeout | null = null;
    let retryTimeout: NodeJS.Timeout | null = null;

    if (showError && autoRetryEnabled && connectionError) {
      const retryDelay = getRetryDelay(totalRetryAttempts);

      if (retryDelay !== null) {
        // Start countdown with appropriate delay
        setRetryCountdown(retryDelay);

        countdownInterval = setInterval(() => {
          setRetryCountdown((prev) => {
            if (prev <= 1) {
              // Time to retry
              clearInterval(countdownInterval!);
              retryTimeout = setTimeout(() => {
                setTotalRetryAttempts((prev) => prev + 1);
                handleRetryConnection();
              }, 100); // Small delay to ensure countdown shows 0
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      } else {
        // Maximum attempts reached, stop retrying
        setRetryCountdown(0);
      }
    } else {
      // Clear countdown when error is resolved or auto-retry disabled
      setRetryCountdown(0);
    }

    return () => {
      if (countdownInterval) clearInterval(countdownInterval);
      if (retryTimeout) clearTimeout(retryTimeout);
    };
  }, [showError, autoRetryEnabled, connectionError, totalRetryAttempts]);

  // Reset retry attempts when connection succeeds
  useEffect(() => {
    if (isConnected && roomState) {
      setTotalRetryAttempts(0);
    }
  }, [isConnected, roomState]);

  const handleCardSelect = useCallback(
    (value: string) => {
      if (!userId || !roomId) return;

      setSelectedCard(value);

      // Store selection in localStorage for cross-tab sync
      const voteKey = `scrumPokerVote_${roomId}_${userName}`;
      localStorage.setItem(voteKey, value);

      wsService.send({
        type: MessageType.VOTE,
        payload: {
          userId,
          roomId,
          estimate: value,
        },
      });
    },
    [userId, roomId, userName]
  );

  // Keyboard support for card selection (1, 2, 3, 5, 8)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Only handle if we're in a room with a valid user
      if (!userId || !roomId) return;

      // Don't handle if user is typing in an input/textarea
      const target = event.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      // Map of valid keys to card values
      const validKeys: { [key: string]: string } = {
        "1": "1",
        "2": "2",
        "3": "3",
        "5": "5",
        "8": "8",
      };

      // Check if the pressed key is one of our valid card numbers
      if (validKeys[event.key]) {
        event.preventDefault(); // Prevent default browser behavior
        handleCardSelect(validKeys[event.key]);
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [userId, roomId, handleCardSelect]);

  const handleShowEstimates = () => {
    if (!roomId) return;
    wsService.send({
      type: MessageType.SHOW_ESTIMATES,
      payload: { roomId },
    });
  };

  const handleHideEstimates = () => {
    if (!roomId) return;
    wsService.send({
      type: MessageType.HIDE_ESTIMATES,
      payload: { roomId },
    });
  };

  const handleDeleteEstimates = () => {
    if (!roomId) return;
    setSelectedCard(null);
    wsService.send({
      type: MessageType.DELETE_ESTIMATES,
      payload: { roomId },
    });
  };

  const allCards = [...SPECIAL_VALUES, ...FIBONACCI_VALUES];

  if (!isConnected || !roomState) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center max-w-sm space-y-6">
          {connectionError && showError ? (
            <div className="text-5xl animate-bounce">😴</div>
          ) : (
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 dark:border-blue-400 mx-auto"></div>
          )}

          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text mb-2">
              {connectionError && showError
                ? "Waking up the server..."
                : "Connecting to room..."}
            </h3>
            <p className="text-sm text-gray-500 dark:text-dark-text-secondary">
              {connectionError && showError
                ? "The server is starting up. This usually takes 1\u20132 minutes."
                : "Hang tight, connecting you now."}
            </p>
          </div>

          {connectionError && showError && (
            <>
              {/* Progress bar */}
              {autoRetryEnabled && retryCountdown > 0 && (
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                  <div
                    className="bg-blue-600 dark:bg-blue-400 h-1.5 rounded-full transition-all duration-1000 ease-linear"
                    style={{
                      width: `${
                        (((getRetryDelay(totalRetryAttempts) || 10) -
                          retryCountdown) /
                          (getRetryDelay(totalRetryAttempts) || 10)) *
                        100
                      }%`,
                    }}
                  ></div>
                </div>
              )}

              <p className="text-xs text-gray-400 dark:text-gray-500">
                {autoRetryEnabled && retryCountdown > 0
                  ? `Retrying in ${retryCountdown}s...`
                  : getRetryDelay(totalRetryAttempts) === null
                  ? "Auto-retry exhausted."
                  : "Retrying..."}
              </p>

              <div className="text-sm text-gray-500 dark:text-dark-text-secondary space-y-1">
                <p>{"\uD83D\uDCA4"} The server is sleeping to save resources.</p>
                <p>{"\u23F1\uFE0F"} Your name "{userName}" will be preserved.</p>
              </div>

              <button
                onClick={handleManualRetry}
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                Try now
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg p-4 transition-colors duration-200">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Reconnecting Banner */}
        {showReconnectingBanner && (
          <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg p-3 shadow-sm">
            <div className="flex items-center justify-center space-x-2">
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 dark:border-blue-400 border-t-transparent"></div>
              <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
                Reconnecting to room...
              </span>
            </div>
          </div>
        )}

        <div className="text-center">
          <div className="mb-4">
            {/* <span className="text-sm text-gray-500 dark:text-dark-text-secondary">
              Room Name
            </span> */}
            <div className="flex items-center justify-center gap-3 mt-2">
              <h1 className="text-sm text-gray-500 dark:text-dark-text font-mono">
                Room name - {roomId}
              </h1>
              <button
                onClick={handleCopyRoomLink}
                className="relative group p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30 hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors duration-200"
                title="Copy room link"
              >
                {showCopiedNotification ? (
                  <svg
                    className="w-5 h-5 text-green-600 dark:text-green-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                ) : (
                  <svg
                    className="w-5 h-5 text-blue-600 dark:text-blue-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                    />
                  </svg>
                )}
                {showCopiedNotification && (
                  <span className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-xs py-1 px-2 rounded whitespace-nowrap">
                    Copied!
                  </span>
                )}
              </button>
            </div>
            <p className="text-sm text-gray-500 dark:text-dark-text-secondary mt-2">
              Share this link with your team
            </p>
            <div></div>
            <h2> ... </h2>
          </div>
          <h2 className="text-2xl font-semibold text-gray-800 dark:text-dark-text mb-2">
            Provide an effort estimate - choose one of the cards
          </h2>
          <p className="text-sm text-gray-600 dark:text-dark-text-secondary">
            Each team member estimates the complexity of the task (user story).
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
          {allCards.map((value) => (
            <PokerCard
              key={value}
              value={value}
              isSelected={selectedCard === value}
              onClick={() => handleCardSelect(value)}
            />
          ))}
        </div>

        <div className="bg-white dark:bg-dark-surface rounded-lg shadow p-6 transition-colors duration-200">
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-dark-text mb-2">
              Reveal the cards
            </h3>
            <p className="text-sm text-gray-600 dark:text-dark-text-secondary">
              Once everyone has submitted their effort estimates, the organizer
              reveals the cards.
            </p>
          </div>

          <UserTable
            users={roomState.users}
            showEstimates={roomState.showEstimates}
            onShowEstimates={handleShowEstimates}
            onHideEstimates={handleHideEstimates}
            onDeleteEstimates={handleDeleteEstimates}
            currentUserId={userId}
          />
        </div>
      </div>
    </div>
  );
};
