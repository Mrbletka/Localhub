export const SECOND = 1000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/** Days since epoch in the player's local clock (the world's clock on a Realm). */
export function dayNumber(ms: number): number {
  const offset = new Date(ms).getTimezoneOffset() * MINUTE;
  return Math.floor((ms - offset) / DAY);
}

/** Weeks since epoch, starting Monday. */
export function weekNumber(ms: number): number {
  return Math.floor((dayNumber(ms) + 3) / 7);
}

export function msUntilNextDay(ms: number): number {
  const offset = new Date(ms).getTimezoneOffset() * MINUTE;
  return DAY - ((ms - offset) % DAY);
}

export function msUntilNextWeek(ms: number): number {
  const day = (dayNumber(ms) + 3) % 7;
  return (6 - day) * DAY + msUntilNextDay(ms);
}

export function fmtDuration(ms: number): string {
  if (ms < MINUTE) return `${Math.max(0, Math.floor(ms / SECOND))}s`;
  if (ms < HOUR) return `${Math.floor(ms / MINUTE)}m`;
  if (ms < DAY) return `${Math.floor(ms / HOUR)}h ${Math.floor((ms % HOUR) / MINUTE)}m`;
  return `${Math.floor(ms / DAY)}d ${Math.floor((ms % DAY) / HOUR)}h`;
}

export function fmtNum(n: number): string {
  // Bedrock's JS engine has patchy Intl support, so group digits by hand.
  const s = String(Math.floor(Math.abs(n)));
  const grouped = s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return n < 0 ? `-${grouped}` : grouped;
}
