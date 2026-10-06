export function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback for older browsers / non-secure contexts.
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export const gamePlayerId = (gameId: string, playerId: string) => `${gameId}:${playerId}`;
export const lineupMemberId = (gameId: string, playerId: string) => `${gameId}:${playerId}`;
export const presetMemberId = (presetId: string, playerId: string) => `${presetId}:${playerId}`;
export const participantId = (playId: string, playerId: string) => `${playId}:${playerId}`;
