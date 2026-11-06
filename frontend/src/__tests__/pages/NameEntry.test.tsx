import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useParams } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NameEntry } from "../../pages/NameEntry";

function RoomStub() {
  const { roomId } = useParams<{ roomId: string }>();
  return <p data-testid="room">{roomId}</p>;
}

const renderHome = (onNameSubmit = vi.fn()) => {
  render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<NameEntry onNameSubmit={onNameSubmit} />} />
        <Route path="/room/:roomId" element={<RoomStub />} />
      </Routes>
    </MemoryRouter>
  );
  return onNameSubmit;
};

beforeEach(() => localStorage.clear());

describe("NameEntry", () => {
  it("creates a new animal-named room with just a name", async () => {
    const onNameSubmit = renderHome();

    await userEvent.type(screen.getByLabelText("Your name"), "Mark ");
    await userEvent.click(screen.getByRole("button", { name: "Create a new room" }));

    expect(onNameSubmit).toHaveBeenCalledWith("Mark");
    await waitFor(() => expect(screen.getByTestId("room").textContent).toMatch(/^[a-z]+-[a-z]+$/));
  });

  it("joins an existing room by name", async () => {
    renderHome();

    await userEvent.type(screen.getByLabelText("Your name"), "Pat");
    await userEvent.type(screen.getByLabelText("Room name"), "Happy-Panda");
    await userEvent.click(screen.getByRole("button", { name: "Join room" }));

    await waitFor(() => expect(screen.getByTestId("room")).toHaveTextContent("happy-panda"));
  });
});
