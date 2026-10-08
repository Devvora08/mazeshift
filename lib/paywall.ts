import { UNLOCK_ALL_LEVELS } from './devUnlock';

/**
 * The first FREE_LEVELS levels are free; the purchase unlocks the ones after.
 * Current release: all 20 shipped levels are free and the paywall is switched
 * off (no purchase SDK start, no unlock/restore UI). When the next pack of
 * levels ships, set PAYWALL_ENABLED to true and point the RevenueCat
 * offering at that pack — the purchase flow in store/purchaseStore is intact.
 */
export const PAYWALL_ENABLED = false;
export const FREE_LEVELS = 20;

/** Whether this level is behind the full-game purchase for this player. */
export function needsPurchase(levelId: number, premiumUnlocked: boolean): boolean {
  return PAYWALL_ENABLED && !UNLOCK_ALL_LEVELS && levelId > FREE_LEVELS && !premiumUnlocked;
}
