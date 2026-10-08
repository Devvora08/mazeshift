// Unlocks every level for local testing: always in dev, or in a --no-dev preview
// started with EXPO_PUBLIC_UNLOCK_ALL=1. Saved progress and purchases are untouched.
export const UNLOCK_ALL_LEVELS = __DEV__ || process.env.EXPO_PUBLIC_UNLOCK_ALL === '1';
