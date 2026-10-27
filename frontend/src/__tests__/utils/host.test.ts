import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  captureHostTokenFromUrl,
  getFacilitatorUrl,
  getJoinUrl,
  getStoredHostToken,
  storeHostToken,
} from "../../utils/host";

describe("host token helpers", () => {
  const originalHref = window.location.href;

  beforeEach(() => localStorage.clear());
  afterEach(() => {
    (window.location as { href: string }).href = originalHref;
  });

  it("stores and reads tokens per room", () => {
    storeHostToken("happy-panda", "abc");

    expect(getStoredHostToken("happy-panda")).toBe("abc");
    expect(getStoredHostToken("brave-tiger")).toBeNull();
  });

  it("moves a ?host= token from the URL into storage", () => {
    (window.location as { href: string }).href =
      "http://localhost:3000/room/happy-panda?host=xyz";

    captureHostTokenFromUrl("happy-panda");

    expect(getStoredHostToken("happy-panda")).toBe("xyz");
  });

  it("leaves storage alone when the URL has no token", () => {
    storeHostToken("happy-panda", "abc");
    (window.location as { href: string }).href = "http://localhost:3000/room/happy-panda";

    captureHostTokenFromUrl("happy-panda");

    expect(getStoredHostToken("happy-panda")).toBe("abc");
  });

  it("builds join and facilitator URLs", () => {
    expect(getJoinUrl("happy-panda")).toBe("http://localhost:3000/room/happy-panda");
    expect(getFacilitatorUrl("happy-panda", "a+b")).toBe(
      "http://localhost:3000/room/happy-panda?host=a%2Bb"
    );
  });
});
