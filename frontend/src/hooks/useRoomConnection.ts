/**
 * useRoomConnection.ts - Shared WebSocket lifecycle for the board and the vote screen
 *
 * Handles:
 * - connecting to the backend and (re)subscribing to the room on every open
 * - connection timeout and "server waking up" error state
 * - auto-retry with a stepped back-off (10s x10, 30s x10, 60s x10, then stop)
 * - reconnecting when the tab becomes visible again
 * - keeping the latest ROOM_UPDATE as roomState
 *
 * Callers provide `subscribe`, which sends the JOIN (voter) or WATCH (board)
 * message, plus any extra message handlers they need.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { getWebSocketUrl } from "../config";
import { wsService } from "../services/websocket";
import { MessageType, RoomState } from "../types";

type Handlers = Partial<Record<MessageType, (payload: any) => void>>;

interface UseRoomConnectionOptions {
  /** Changes to this key tear the connection down and reconnect */
  connectKey: string;
  /** Sends the room subscription message; runs on every (re)connect */
  subscribe: () => void;
  /** Extra handlers for message types other than ROOM_UPDATE */
  handlers?: Handlers;
}

const MIN_LOADING_TIME_MS = 2000;
const CONNECT_TIMEOUT_MS = 10000;

export const getRetryDelay = (attemptNumber: number): number | null => {
  if (attemptNumber < 10) return 10;
  if (attemptNumber < 20) return 30;
  if (attemptNumber < 30) return 60;
  return null;
};

export const useRoomConnection = ({
  connectKey,
  subscribe,
  handlers = {},
}: UseRoomConnectionOptions) => {
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [showError, setShowError] = useState(false);
  const [retryTrigger, setRetryTrigger] = useState(0);
  const [retryCountdown, setRetryCountdown] = useState(0);
  const [totalRetryAttempts, setTotalRetryAttempts] = useState(0);
  const [showReconnectingBanner, setShowReconnectingBanner] = useState(false);

  // Keep the latest callbacks without reconnecting when they change
  const subscribeRef = useRef(subscribe);
  const handlersRef = useRef(handlers);
  subscribeRef.current = subscribe;
  handlersRef.current = handlers;

  const retryConnection = useCallback(() => {
    setConnectionError(null);
    setShowError(false);
    setIsConnected(false);
    setRoomState(null);
    setRetryCountdown(0);
    setRetryTrigger((prev) => prev + 1);
  }, []);

  const manualRetry = useCallback(() => {
    setTotalRetryAttempts(0);
    retryConnection();
  }, [retryConnection]);

  // Reconnect when the tab becomes visible after the socket dropped
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && !wsService.isConnected()) {
        setShowReconnectingBanner(true);
        setTimeout(retryConnection, 500);
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [retryConnection]);

  useEffect(() => {
    const startTime = Date.now();
    const revealError = () => {
      const elapsed = Date.now() - startTime;
      if (elapsed >= MIN_LOADING_TIME_MS) {
        setShowError(true);
      } else {
        setTimeout(() => setShowError(true), MIN_LOADING_TIME_MS - elapsed);
      }
    };

    setConnectionError(null);
    setShowError(false);

    const timeoutId = setTimeout(() => {
      if (!wsService.isConnected()) {
        setConnectionError(
          "Connection timeout. The backend service might be down or starting up."
        );
        revealError();
      }
    }, CONNECT_TIMEOUT_MS);

    wsService.on(MessageType.ROOM_UPDATE, (payload) => setRoomState(payload));
    Object.entries(handlersRef.current).forEach(([type]) => {
      wsService.on(type as MessageType, (payload) =>
        handlersRef.current[type as MessageType]?.(payload)
      );
    });
    wsService.onOpen(() => subscribeRef.current());

    wsService
      .connect(getWebSocketUrl())
      .then(() => {
        clearTimeout(timeoutId);
        setIsConnected(true);
        setConnectionError(null);
        setShowReconnectingBanner(false);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        console.error("[Room] Failed to connect to WebSocket:", error);
        setIsConnected(false);
        setConnectionError(
          "Failed to connect to the backend service. The backend might be starting up or experiencing issues."
        );
        revealError();
      });

    return () => {
      clearTimeout(timeoutId);
      wsService.onOpen(null);
      wsService.disconnect();
    };
  }, [connectKey, retryTrigger]);

  // Auto-retry countdown while the error is shown
  useEffect(() => {
    let countdownInterval: ReturnType<typeof setInterval> | null = null;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;

    if (showError && connectionError) {
      const retryDelay = getRetryDelay(totalRetryAttempts);
      if (retryDelay !== null) {
        setRetryCountdown(retryDelay);
        countdownInterval = setInterval(() => {
          setRetryCountdown((prev) => {
            if (prev <= 1) {
              clearInterval(countdownInterval!);
              retryTimeout = setTimeout(() => {
                setTotalRetryAttempts((attempts) => attempts + 1);
                retryConnection();
              }, 100);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      } else {
        setRetryCountdown(0);
      }
    } else {
      setRetryCountdown(0);
    }

    return () => {
      if (countdownInterval) clearInterval(countdownInterval);
      if (retryTimeout) clearTimeout(retryTimeout);
    };
  }, [showError, connectionError, totalRetryAttempts, retryConnection]);

  // Reset retry attempts once we're live
  useEffect(() => {
    if (isConnected && roomState) setTotalRetryAttempts(0);
  }, [isConnected, roomState]);

  return {
    roomState,
    isConnected,
    isReady: isConnected && roomState !== null,
    connectionError,
    showError,
    retryCountdown,
    totalRetryAttempts,
    showReconnectingBanner,
    manualRetry,
  };
};
