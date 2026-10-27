/**
 * host.ts - Facilitator (host token) helpers
 *
 * The facilitator of a room is identified by a secret token issued by the
 * backend to the board that opened the room. It travels to the facilitator's
 * phone through the `?host=` query string of the "facilitate from phone" QR
 * code, and is then kept in localStorage so it never has to stay visible in
 * the address bar (boards are usually projected).
 */

const storageKey = (roomId: string) => `scrumPokerHost_${roomId}`;

export const getStoredHostToken = (roomId: string): string | null => {
  try {
    return localStorage.getItem(storageKey(roomId));
  } catch {
    return null;
  }
};

export const storeHostToken = (roomId: string, token: string) => {
  try {
    localStorage.setItem(storageKey(roomId), token);
  } catch {
    // Storage unavailable (private mode): facilitator rights last for this page only
  }
};

/**
 * Moves a `?host=` token from the current URL into localStorage and strips it
 * from the address bar. Safe to call on every render.
 */
export const captureHostTokenFromUrl = (roomId: string) => {
  const url = new URL(window.location.href);
  const token = url.searchParams.get("host");
  if (!token) return;

  storeHostToken(roomId, token);
  url.searchParams.delete("host");
  window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
};

/** Absolute URL participants open (via QR) to join a room as voters */
export const getJoinUrl = (roomId: string) =>
  `${window.location.origin}/room/${encodeURIComponent(roomId)}`;

/** Absolute URL that grants facilitator rights on a phone */
export const getFacilitatorUrl = (roomId: string, token: string) =>
  `${getJoinUrl(roomId)}?host=${encodeURIComponent(token)}`;
