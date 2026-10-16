import { Platform } from "react-native";

import type { Ads } from "./ads.web";

// Guarded require: Expo Go has no native AdMob module, development/production builds do.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let native: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  native = require("react-native-google-mobile-ads");
  if (!native?.default) native = null;
} catch {
  native = null;
}

const noAds: Ads = {
  available: false,
  async initialize() {
    return false;
  },
  async showInterstitial() {
    return false;
  },
  async showRewarded() {
    return false;
  },
};

function buildAds(): Ads {
  const { AdEventType, InterstitialAd, RewardedAd, RewardedAdEventType, TestIds, default: mobileAds } = native;

  const prodInterstitial = Platform.OS === "ios" ? process.env.EXPO_PUBLIC_ADMOB_IOS_INTERSTITIAL : process.env.EXPO_PUBLIC_ADMOB_ANDROID_INTERSTITIAL;
  const prodRewarded = Platform.OS === "ios" ? process.env.EXPO_PUBLIC_ADMOB_IOS_REWARDED : process.env.EXPO_PUBLIC_ADMOB_ANDROID_REWARDED;
  // Google test units in development builds; the publisher's units only in release builds.
  const interstitialId = __DEV__ || !prodInterstitial ? TestIds.INTERSTITIAL : prodInterstitial;
  const rewardedId = __DEV__ || !prodRewarded ? TestIds.REWARDED : prodRewarded;

  const request = { requestNonPersonalizedAdsOnly: false };
  let interstitial = InterstitialAd.createForAdRequest(interstitialId, request);
  let rewarded = RewardedAd.createForAdRequest(rewardedId, request);
  let initialized = false;

  const preload = () => {
    try {
      if (!interstitial.loaded) interstitial.load();
      if (!rewarded.loaded) rewarded.load();
    } catch {
      /* ignore */
    }
  };

  return {
    available: true,
    async initialize() {
      if (!initialized) {
        try {
          await mobileAds().initialize();
          initialized = true;
          preload();
        } catch {
          return false;
        }
      }
      return true;
    },

    showInterstitial() {
      return new Promise<boolean>((resolve) => {
        let shown = false;
        let settled = false;
        const done = (ok: boolean) => {
          if (settled) return;
          settled = true;
          offLoaded();
          offOpened();
          offClosed();
          offError();
          interstitial = InterstitialAd.createForAdRequest(interstitialId, request);
          interstitial.load();
          resolve(ok);
        };
        const offLoaded = interstitial.addAdEventListener(AdEventType.LOADED, () => interstitial.show().catch(() => done(false)));
        const offOpened = interstitial.addAdEventListener(AdEventType.OPENED, () => (shown = true));
        const offClosed = interstitial.addAdEventListener(AdEventType.CLOSED, () => done(shown));
        const offError = interstitial.addAdEventListener(AdEventType.ERROR, () => done(false));
        // Never block the player for more than 6 s if there is no fill.
        setTimeout(() => !shown && done(false), 6000);
        if (interstitial.loaded) interstitial.show().catch(() => done(false));
        else interstitial.load();
      });
    },

    showRewarded() {
      return new Promise<boolean>((resolve) => {
        let earned = false;
        let shown = false;
        let settled = false;
        const done = (ok: boolean) => {
          if (settled) return;
          settled = true;
          offLoaded();
          offOpened();
          offEarned();
          offClosed();
          offError();
          rewarded = RewardedAd.createForAdRequest(rewardedId, request);
          rewarded.load();
          resolve(ok);
        };
        const offLoaded = rewarded.addAdEventListener(RewardedAdEventType.LOADED, () => rewarded.show().catch(() => done(false)));
        const offOpened = rewarded.addAdEventListener(AdEventType.OPENED, () => (shown = true));
        const offEarned = rewarded.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => (earned = true));
        const offClosed = rewarded.addAdEventListener(AdEventType.CLOSED, () => done(earned));
        const offError = rewarded.addAdEventListener(AdEventType.ERROR, () => done(false));
        setTimeout(() => !shown && done(false), 8000);
        if (rewarded.loaded) rewarded.show().catch(() => done(false));
        else rewarded.load();
      });
    },
  };
}

export const ads: Ads = native ? buildAds() : noAds;
