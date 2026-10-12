/** Initial organization preferences; all of them are editable from Settings → Organization. */
export const ORGANIZATION_DEFAULTS = {
  // The team works in India; each organization can change it in Settings → Organization.
  timezone: 'Asia/Kolkata',
  weekStartsOn: 1,
  workingHoursPerDay: 8,
} as const;
