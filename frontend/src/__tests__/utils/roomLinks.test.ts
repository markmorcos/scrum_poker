import { describe, expect, it } from "vitest";
import { getJoinUrl } from "../../utils/roomLinks";

describe("getJoinUrl", () => {
  it("builds the absolute room URL", () => {
    expect(getJoinUrl("happy-panda")).toBe("http://localhost:3000/room/happy-panda");
  });

  it("encodes unusual room names", () => {
    expect(getJoinUrl("a b")).toBe("http://localhost:3000/room/a%20b");
  });
});
