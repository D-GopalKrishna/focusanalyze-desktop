/** Format decimal hours as compact hours + minutes (e.g. 1.25 → "1h 15m", 0.25 → "15m"). */
export function formatDurationFromHours(hours: number): string {
  if (!Number.isFinite(hours)) return '';
  const totalMinutes = Math.round(Math.max(0, hours) * 60);
  if (totalMinutes === 0) return '0m';
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
