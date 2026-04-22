export const TTL_OPTIONS = [
  { label: '30 min',  ms: 30 * 60 * 1000 },
  { label: '1 hour',  ms: 60 * 60 * 1000 },
  { label: '4 hours', ms: 4 * 60 * 60 * 1000 },
  { label: '1 day',   ms: 24 * 60 * 60 * 1000 },
] as const satisfies { label: string; ms: number }[];

// Extends TTL_OPTIONS with a "No expiry" sentinel for contexts where
// an open-ended schedule is valid (e.g. ScheduleModal).
export const TTL_OPTIONS_WITH_NONE = [
  { label: 'No expiry', ms: null },
  ...TTL_OPTIONS,
] as const satisfies { label: string; ms: number | null }[];
