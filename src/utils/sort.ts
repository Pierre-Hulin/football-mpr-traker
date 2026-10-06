/** Stable jersey ordering: numeric ascending, then non-numeric lexical. */
export function compareJersey(a: string, b: string): number {
  const aNum = /^\d+$/.test(a.trim());
  const bNum = /^\d+$/.test(b.trim());
  if (aNum && bNum) {
    const diff = Number(a) - Number(b);
    if (diff !== 0) return diff;
    return a.length - b.length; // "0" before "00"
  }
  if (aNum) return -1;
  if (bNum) return 1;
  return a.localeCompare(b);
}

export function comparePlayers(
  a: { jerseyNumber: string; displayName: string },
  b: { jerseyNumber: string; displayName: string },
): number {
  return compareJersey(a.jerseyNumber, b.jerseyNumber) || a.displayName.localeCompare(b.displayName);
}

export function sortPlayers<T extends { jerseyNumber: string; displayName: string }>(players: T[]): T[] {
  return [...players].sort(comparePlayers);
}
