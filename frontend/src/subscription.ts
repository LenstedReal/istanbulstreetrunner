import { Platform } from "react-native";
import Purchases, { type CustomerInfo } from "react-native-purchases";

let configured = false;

/** Configure RevenueCat once per app process. Uses only the public Google SDK key. */
export function configureRevenueCat(): boolean {
  if (Platform.OS !== "android") return false;

  const apiKey = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY?.trim();
  if (!apiKey || !apiKey.startsWith("goog_")) {
    throw new Error("RevenueCat Android SDK anahtarı eksik veya geçersiz. GitHub Actions değişkenini kontrol et.");
  }

  if (!configured) {
    Purchases.configure({ apiKey });
    configured = true;
  }
  return true;
}

export function isPremium(customerInfo: CustomerInfo): boolean {
  return Boolean(customerInfo.entitlements.active["premium"]);
}

export default Purchases;
