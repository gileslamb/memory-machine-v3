/**
 * Parses duration: "2h", "90m", "1.5" (hours), or plain integer minutes.
 */
export function parseDurationMinutes(input: string): number | null {
  const s = input.trim().toLowerCase();
  if (!s) return null;

  const hMatch = s.match(/^([\d.]+)\s*h$/);
  if (hMatch) {
    const hours = parseFloat(hMatch[1]);
    if (!Number.isFinite(hours) || hours < 0) return null;
    return Math.round(hours * 60);
  }

  const mMatch = s.match(/^([\d.]+)\s*m$/);
  if (mMatch) {
    const mins = parseFloat(mMatch[1]);
    if (!Number.isFinite(mins) || mins < 0) return null;
    return Math.round(mins);
  }

  const num = parseFloat(s);
  if (!Number.isFinite(num) || num < 0) return null;

  if (s.includes(".")) {
    return Math.round(num * 60);
  }

  return Math.round(num);
}
