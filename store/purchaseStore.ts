import { Platform } from 'react-native';
import Constants from 'expo-constants';
import Purchases, { LOG_LEVEL, type CustomerInfo, type PurchasesPackage } from 'react-native-purchases';
import { create } from 'zustand';

import { useProgressStore } from './progressStore';

export const PREMIUM_ENTITLEMENT = 'full_game';
export const PREMIUM_PRODUCT_ID = 'mazeshift_full_game';

function ownsFullGame(info: CustomerInfo): boolean {
  return info.entitlements.active[PREMIUM_ENTITLEMENT] !== undefined;
}

interface PurchaseState {
  ready: boolean;
  busy: boolean;
  package: PurchasesPackage | null;
  priceText: string | null;
  appUserId: string | null;
  notice: string | null;
  error: string | null;
  initialize: () => Promise<void>;
  purchaseFullGame: () => Promise<boolean>;
  restorePurchases: () => Promise<boolean>;
}

let configured = false;

export const usePurchaseStore = create<PurchaseState>((set, get) => ({
  ready: false, busy: false, package: null, priceText: null, appUserId: null, notice: null, error: null,
  initialize: async () => {
    if (Platform.OS !== 'android') { set({ ready: true }); return; }
    // Expo Go has no native Play Billing store. Keep locally cached ownership for
    // gameplay testing and initialize RevenueCat only in development/release builds.
    if (Constants.expoGoConfig !== null) {
      set({ ready: false, error: null });
      return;
    }
    const apiKey = Constants.expoConfig?.extra?.revenueCatAndroidApiKey
      ?? process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;
    if (!apiKey) { set({ ready: false, error: 'Purchases are not configured in this build.' }); return; }
    try {
      if (!configured) {
        if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.DEBUG);
        Purchases.configure({ apiKey });
        configured = true;
      }
      const [info, offerings, appUserId] = await Promise.all([
        Purchases.getCustomerInfo(), Purchases.getOfferings(), Purchases.getAppUserID(),
      ]);
      useProgressStore.getState().setPremiumUnlocked(ownsFullGame(info));
      const packages = offerings.current?.availablePackages ?? [];
      const pack = packages.find(item => item.product.identifier === PREMIUM_PRODUCT_ID) ?? packages[0] ?? null;
      set({ ready: true, package: pack, priceText: pack?.product.priceString ?? null, appUserId, error: null });
    } catch (error) {
      console.warn('RevenueCat initialization failed', error);
      set({ ready: false, error: 'Could not connect to the store. Try again later.' });
    }
  },
  purchaseFullGame: async () => {
    const pack = get().package;
    if (!pack || get().busy) return false;
    set({ busy: true, notice: null, error: null });
    try {
      const result = await Purchases.purchasePackage(pack);
      const unlocked = ownsFullGame(result.customerInfo);
      useProgressStore.getState().setPremiumUnlocked(unlocked);
      set({ busy: false, notice: unlocked ? 'Full game unlocked.' : null });
      return unlocked;
    } catch (error: any) {
      set({ busy: false, error: error?.userCancelled ? null : 'Purchase did not complete. Please try again.' });
      return false;
    }
  },
  restorePurchases: async () => {
    if (!configured || get().busy) return false;
    set({ busy: true, notice: null, error: null });
    try {
      const info = await Purchases.restorePurchases();
      const unlocked = ownsFullGame(info);
      useProgressStore.getState().setPremiumUnlocked(unlocked);
      set({ busy: false, notice: unlocked ? 'Purchase restored successfully.' : null,
        error: unlocked ? null : 'No full-game purchase was found.' });
      return unlocked;
    } catch {
      set({ busy: false, error: 'Could not restore purchases. Try again later.' });
      return false;
    }
  },
}));
