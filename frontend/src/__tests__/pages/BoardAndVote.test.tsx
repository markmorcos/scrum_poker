/**
 * BoardAndVote.test.tsx - Board (shared screen) and mobile vote screen
 *
 * The WebSocket service is replaced with a fake that records sent messages
 * and lets tests push server messages to the registered handlers.
 */
import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MessageType, RoomState } from "../../types";

const fake = vi.hoisted(() => {
  const handlers = new Map<string, (payload: any) => void>();
  const state = {
    handlers,
    sent: [] as { type: string; payload: any }[],
    openHandler: null as null | (() => void),
    emit(type: string, payload: any) {
      handlers.get(type)?.(payload);
    },
  };
  return state;
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
    sendHostAction: vi.fn((type: string, roomId: string, hostToken: string) =>
      fake.sent.push({ type, payload: { roomId, hostToken } })
    ),
  },
}));

vi.mock("canvas-confetti", () => ({ default: vi.fn() }));

import { Board } from "../../pages/Board";
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

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/board/:roomId" element={<Board />} />
        <Route
          path="/room/:roomId"
          element={<PokerRoom userName="Alice" userId="u1" setUserId={() => {}} />}
        />
      </Routes>
    </MemoryRouter>
  );

beforeEach(() => {
  fake.handlers.clear();
  fake.sent.length = 0;
  fake.openHandler = null;
  localStorage.clear();
});

describe("Board", () => {
  it("watches the room and shows a QR code for the join URL", async () => {
    renderAt("/board/happy-panda");

    await waitFor(() => expect(fake.sent[0]?.type).toBe(MessageType.WATCH));
    expect(fake.sent[0].payload.roomId).toBe("happy-panda");

    act(() => fake.emit(MessageType.ROOM_UPDATE, roomState()));

    const qr = await screen.findByTestId("qr-code");
    expect(qr.getAttribute("data-value")).toBe("http://localhost:3000/room/happy-panda");
    expect(screen.getByTestId("vote-progress")).toHaveTextContent("1 / 2 voted");
    expect(screen.getAllByTestId("player-tile")).toHaveLength(2);
  });

  it("is view-only without facilitator rights", async () => {
    renderAt("/board/happy-panda");
    await waitFor(() => expect(fake.sent.length).toBeGreaterThan(0));

    act(() => {
      fake.emit(MessageType.WATCH, { isHost: false, hostToken: null });
      fake.emit(MessageType.ROOM_UPDATE, roomState());
    });

    expect(await screen.findByText("View only")).toBeInTheDocument();
    expect(screen.queryByText("Reveal cards")).not.toBeInTheDocument();
  });

  it("stores the host token and sends it with reveal", async () => {
    renderAt("/board/happy-panda");
    await waitFor(() => expect(fake.sent.length).toBeGreaterThan(0));

    act(() => {
      fake.emit(MessageType.WATCH, { isHost: true, hostToken: "secret-token" });
      fake.emit(MessageType.ROOM_UPDATE, roomState());
    });

    expect(localStorage.getItem("scrumPokerHost_happy-panda")).toBe("secret-token");

    act(() => screen.getByText("Reveal cards").click());
    expect(fake.sent.at(-1)).toEqual({
      type: MessageType.SHOW_ESTIMATES,
      payload: { roomId: "happy-panda", hostToken: "secret-token" },
    });
  });
});

describe("Vote screen", () => {
  it("joins with the stored host token and shows the facilitator bar only for the host", async () => {
    localStorage.setItem("scrumPokerHost_happy-panda", "secret-token");
    renderAt("/room/happy-panda");

    await waitFor(() => expect(fake.sent[0]?.type).toBe(MessageType.JOIN));
    expect(fake.sent[0].payload).toMatchObject({
      name: "Alice",
      roomId: "happy-panda",
      hostToken: "secret-token",
    });

    act(() => {
      fake.emit(MessageType.JOIN, { userId: "u1", isHost: false });
      fake.emit(MessageType.ROOM_UPDATE, roomState());
    });
    await screen.findByTestId("round-status");
    expect(screen.queryByTestId("host-bar")).not.toBeInTheDocument();

    act(() => fake.emit(MessageType.JOIN, { userId: "u1", isHost: true }));
    expect(screen.getByTestId("host-bar")).toBeInTheDocument();
  });

  it("votes when a card is tapped", async () => {
    renderAt("/room/happy-panda");
    await waitFor(() => expect(fake.sent.length).toBeGreaterThan(0));
    act(() => fake.emit(MessageType.ROOM_UPDATE, roomState()));

    act(() => screen.getByRole("button", { name: "8" }).click());

    expect(fake.sent.at(-1)).toEqual({
      type: MessageType.VOTE,
      payload: { userId: "u1", roomId: "happy-panda", estimate: "8" },
    });
    expect(screen.getByText(/Your vote:/)).toHaveTextContent("Your vote: 8");
  });

  it("shows everyone's estimates after reveal", async () => {
    renderAt("/room/happy-panda");
    await waitFor(() => expect(fake.sent.length).toBeGreaterThan(0));

    act(() =>
      fake.emit(
        MessageType.ROOM_UPDATE,
        roomState({
          showEstimates: true,
          users: [
            { id: "u1", name: "Alice", hasVoted: true, estimate: "5" },
            { id: "u2", name: "Bob", hasVoted: true, estimate: "5" },
          ],
        })
      )
    );

    expect(await screen.findByText("Revealed")).toBeInTheDocument();
    expect(screen.getByText("🎉 Everyone agrees!")).toBeInTheDocument();
  });

  it("renders the laptop player panel with every participant and marks you", async () => {
    renderAt("/room/happy-panda");
    await waitFor(() => expect(fake.sent.length).toBeGreaterThan(0));
    act(() => fake.emit(MessageType.ROOM_UPDATE, roomState()));

    const panel = await screen.findByTestId("player-panel");
    expect(panel).toHaveTextContent("1 / 2 voted");
    expect(screen.getAllByTestId("player-tile")).toHaveLength(2);
    expect(screen.getAllByTestId("player-tile")[0]).toHaveTextContent("Alice(you)");
    expect(screen.getAllByTestId("player-tile")[1]).not.toHaveTextContent("(you)");
  });

  it("shows server errors such as rejected facilitator actions", async () => {
    renderAt("/room/happy-panda");
    await waitFor(() => expect(fake.sent.length).toBeGreaterThan(0));
    act(() => fake.emit(MessageType.ROOM_UPDATE, roomState()));

    act(() => fake.emit(MessageType.ERROR, { error: "Only the facilitator can do that" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Only the facilitator can do that");
  });
});
