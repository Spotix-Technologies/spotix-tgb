/**
 * Returns "Morning", "Afternoon", or "Evening" based on the current UTC hour.
 * Adjust the hour offsets here if you want to use WAT (UTC+1) instead.
 */
export function getTimeOfDay(): string {
  const hour = new Date().getUTCHours() + 1; // WAT = UTC+1
  if (hour >= 5 && hour < 12) return 'Morning';
  if (hour >= 12 && hour < 17) return 'Afternoon';
  return 'Evening';
}
