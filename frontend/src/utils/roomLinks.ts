/**
 * roomLinks.ts - Shareable room URLs
 */

/** Absolute URL people open (e.g. by scanning the QR code) to join a room */
export const getJoinUrl = (roomId: string) =>
  `${window.location.origin}/room/${encodeURIComponent(roomId)}`;
