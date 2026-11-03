import { Platform } from "react-native";
import Purchases, { type CustomerInfo, type PurchasesPackage } from "react-native-purchases";

export const PREMIUM_ENTITLEMENT = "premium";
export const MONTHLY_PRODUCT = "premium_monthly";

let configured = false;

/** Configure RevenueCat once. Returns false (never throws) when it is not available. */
export function configureRevenueCat(): boolean {
  if (Platform.OS !== "android") return false;
  const apiKey = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY?.trim();
  if (!apiKey || !apiKey.startsWith("goog_")) {
    console.warn("[subscription] RevenueCat Android SDK key missing or invalid");
    return false;
  }
  if (!configured) {
    try {
      Purchases.configure({ apiKey });
      configured = true;
    } catch (error) {
      console.warn("[subscription] configure failed", error);
      return false;
    }
  }
  return true;
}

export function isPremium(customerInfo: CustomerInfo): boolean {
  return Boolean(customerInfo.entitlements.active[PREMIUM_ENTITLEMENT]);
}

/** Expiry of the active premium entitlement in ms, or null when it does not expire or is unknown. */
export function premiumExpiry(customerInfo: CustomerInfo): number | null {
  const ent = customerInfo.entitlements.active[PREMIUM_ENTITLEMENT];
  const date = ent?.expirationDate;
  if (!date) return null;
  const ms = Date.parse(date);
  return Number.isFinite(ms) ? ms : null;
}

/** The monthly package of the current offering, or null. Never throws. */
export async function loadMonthlyPackage(): Promise<PurchasesPackage | null> {
  if (!configureRevenueCat()) return null;
  try {
    const offerings = await Purchases.getOfferings();
    const packages = offerings.current?.availablePackages ?? [];
    return packages.find((p) => p.product.identifier === MONTHLY_PRODUCT) ?? packages.find((p) => p.packageType === "MONTHLY") ?? null;
  } catch (error) {
    console.warn("[subscription] offerings failed", error);
    return null;
  }
}

/** Link purchases to the game account so a restore follows the player across devices. */
export async function linkAccount(playerId: string): Promise<void> {
  if (!configureRevenueCat()) return;
  try {
    await Purchases.logIn(playerId);
  } catch (error) {
    console.warn("[subscription] logIn failed", error);
  }
}

export default Purchases;
