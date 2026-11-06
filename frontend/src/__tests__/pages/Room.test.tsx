/**
 * Room.test.tsx - The shared room page (/room/:roomId)
 *
 * The WebSocket service is replaced with a fake that records sent messages
 * and lets tests push server messages to the registered handlers.
 */
import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MessageType, RoomState } from "../../types";

const fake = vi.hoisted(() => {
  const handlers = new Map<string, (payload: any) => void>();
  return {
    handlers,
    sent: [] as { type: string; payload: any }[],
    openHandler: null as null | (() => void),
    emit(type: string, payload: any) {
      handlers.get(type)?.(payload);
    },
  };
});

vi.mock("../../services/websocket", () => ({
  wsService: {
    connect: vi.fn(async () => {
      fake.openHandler?.();
    }),
    disconnect: vi.fn(),
    isConnected: vi.fn(() => true),
    on: vi.fn((type: string, handler: (payload: any) => void) => fake.handlers.set(type, handler)),
    off: vi.fn(),
    onOpen: vi.fn((handler: null | (() => void)) => {
      fake.openHandler = handler;
    }),
    send: vi.fn((message: { type: string; payload: any }) => fake.sent.push(message)),
  },
}));

vi.mock("canvas-confetti", () => ({ default: vi.fn() }));

import { PokerRoom } from "../../pages/PokerRoom";

const roomState = (overrides: Partial<RoomState> = {}): RoomState => ({
  roomId: "happy-panda",
  showEstimates: false,
  users: [
    { id: "u1", name: "Alice", hasVoted: true },
    { id: "u2", name: "Bob", hasVoted: false },
  ],
  ...overrides,
});

function BoardRedirect() {
  const { roomId } = useParams<{ roomId: string }>();
  return <Navigate to={`/room/${roomId}`} replace />;
}

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/board/:roomId" element={<BoardRedirect />} />
        <Route
          path="/room/:roomId"
          element={<PokerRoom userName="Alice" userId="u1" setUserId={() => {}} />}
        />
      </Routes>
    </MemoryRouter>
  );

const joinRoom = async (path = "/room/happy-panda", state = roomState()) => {
  renderAt(path);
  await waitFor(() => expect(fake.sent[0]?.type).toBe(MessageType.JOIN));
  act(() => {
    fake.emit(MessageType.JOIN, { userId: "u1" });
    fake.emit(MessageType.ROOM_UPDATE, state);
  });
  await screen.findByTestId("round-status");
};

beforeEach(() => {
  fake.handlers.clear();
  fake.sent.length = 0;
  fake.openHandler = null;
  localStorage.clear();
});

describe("Room page", () => {
  it("joins the room with the user's name", async () => {
    await joinRoom();

    expect(fake.sent[0].payload).toEqual({ name: "Alice", roomId: "happy-panda", userId: undefined });
  });

  it("shows the room's QR code to everyone", async () => {
    await joinRoom();

    const qrs = screen.getAllByTestId("qr-code");
    expect(qrs.length).toBeGreaterThan(0);
    qrs.forEach((qr) =>
      expect(qr.getAttribute("data-value")).toBe("http://localhost:3000/room/happy-panda")
    );
  });

  it("lets any participant reveal and start a new round", async () => {
    await joinRoom();

    act(() => screen.getByRole("button", { name: "Reveal cards" }).click());
    expect(fake.sent.at(-1)).toEqual({
      type: MessageType.SHOW_ESTIMATES,
      payload: { roomId: "happy-panda" },
    });

    act(() => screen.getByRole("button", { name: "New round" }).click());
    expect(fake.sent.at(-1)).toEqual({
      type: MessageType.DELETE_ESTIMATES,
      payload: { roomId: "happy-panda" },
    });
  });

  it("offers Hide cards once revealed", async () => {
    await joinRoom(
      "/room/happy-panda",
      roomState({
        showEstimates: true,
        users: [
          { id: "u1", name: "Alice", hasVoted: true, estimate: "5" },
          { id: "u2", name: "Bob", hasVoted: true, estimate: "8" },
        ],
      })
    );

    act(() => screen.getByRole("button", { name: "Hide cards" }).click());
    expect(fake.sent.at(-1)).toEqual({
      type: MessageType.HIDE_ESTIMATES,
      payload: { roomId: "happy-panda" },
    });
  });

  it("votes when a card is tapped", async () => {
    await joinRoom();

    act(() => screen.getByRole("button", { name: "8" }).click());

    expect(fake.sent.at(-1)).toEqual({
      type: MessageType.VOTE,
      payload: { userId: "u1", roomId: "happy-panda", estimate: "8" },
    });
    expect(screen.getByText(/Your vote:/)).toHaveTextContent("Your vote: 8");
  });

  it("shows who has voted and marks you", async () => {
    await joinRoom();

    const list = screen.getByTestId("player-list");
    expect(list).toHaveTextContent("Alice(you)");
    expect(list).toHaveTextContent("✓ voted");
    expect(screen.getAllByTestId("player-tile")).toHaveLength(2);
    expect(screen.getByTestId("player-panel")).toHaveTextContent("1 / 2 voted");
  });

  it("shows everyone's estimates after reveal", async () => {
    await joinRoom(
      "/room/happy-panda",
      roomState({
        showEstimates: true,
        users: [
          { id: "u1", name: "Alice", hasVoted: true, estimate: "5" },
          { id: "u2", name: "Bob", hasVoted: true, estimate: "5" },
        ],
      })
    );

    expect(screen.getByText("Revealed")).toBeInTheDocument();
    expect(screen.getByText("🎉 Everyone agrees!")).toBeInTheDocument();
    expect(screen.getByText("🎉 Everyone agrees on 5")).toBeInTheDocument();
  });

  it("opens old /board links as the room", async () => {
    await joinRoom("/board/happy-panda");

    expect(fake.sent[0].payload.roomId).toBe("happy-panda");
  });

  it("shows server errors", async () => {
    await joinRoom();

    act(() => fake.emit(MessageType.ERROR, { error: "Server capacity limit reached" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Server capacity limit reached");
  });
});
