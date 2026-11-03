import { Platform } from "react-native";

import type { Ads } from "./ads.web";

// Guarded require: Expo Go has no native AdMob module, development/production builds do.
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
  canRequestAds: () => false,
  privacyOptionsRequired: () => false,
  async showPrivacyOptions() {},
  interstitialReady: () => false,
  async showInterstitial() {
    return false;
  },
  async showRewarded() {
    return false;
  },
};

const LOAD_WAIT_MS = 8000; // longest wait for a rewarded ad the player asked for
const OPEN_WATCHDOG_MS = 120_000; // an opened ad that never reports "closed" still settles

function buildAds(): Ads {
  const { AdEventType, AdsConsent, AdsConsentPrivacyOptionsRequirementStatus, InterstitialAd, RewardedAd, RewardedAdEventType, TestIds, default: mobileAds } = native;

  const prodInterstitial = Platform.OS === "ios" ? process.env.EXPO_PUBLIC_ADMOB_IOS_INTERSTITIAL : process.env.EXPO_PUBLIC_ADMOB_ANDROID_INTERSTITIAL;
  const prodRewarded = Platform.OS === "ios" ? process.env.EXPO_PUBLIC_ADMOB_IOS_REWARDED : process.env.EXPO_PUBLIC_ADMOB_ANDROID_REWARDED;
  // Google test units in development builds and while EXPO_PUBLIC_ADS_TEST_MODE=1 (before the
  // Play release); the publisher's units only in release builds with test mode off.
  const testMode = __DEV__ || process.env.EXPO_PUBLIC_ADS_TEST_MODE === "1";
  const interstitialId = testMode || !prodInterstitial ? TestIds.INTERSTITIAL : prodInterstitial;
  const rewardedId = testMode || !prodRewarded ? TestIds.REWARDED : prodRewarded;

  // Personalisation follows the UMP/TCF consent signal the SDK reads itself.
  const request = {};
  let interstitial = InterstitialAd.createForAdRequest(interstitialId, request);
  let rewarded = RewardedAd.createForAdRequest(rewardedId, request);
  let initialized = false;
  let initializing: Promise<boolean> | null = null;
  let canRequest = false;
  let privacyRequired = false;
  let showing = false;

  const preload = () => {
    if (!initialized) return;
    try {
      if (!interstitial.loaded) interstitial.load();
      if (!rewarded.loaded) rewarded.load();
    } catch {
      /* ignore: next attempt reloads */
    }
  };

  const readConsent = (info: any) => {
    canRequest = Boolean(info?.canRequestAds);
    privacyRequired = info?.privacyOptionsRequirementStatus === AdsConsentPrivacyOptionsRequirementStatus?.REQUIRED;
  };

  const gatherConsent = async () => {
    try {
      if (typeof AdsConsent?.gatherConsent === "function") {
        readConsent(await AdsConsent.gatherConsent());
      } else {
        await AdsConsent.requestInfoUpdate();
        readConsent(await AdsConsent.loadAndShowConsentFormIfRequired());
      }
    } catch (error) {
      console.warn("[ads] consent flow failed", error);
      try {
        readConsent(await AdsConsent.getConsentInfo());
      } catch {
        canRequest = false;
      }
    }
  };

  return {
    available: true,
    initialize() {
      if (initialized) return Promise.resolve(true);
      if (!initializing) {
        initializing = (async () => {
          await gatherConsent();
          if (!canRequest) return false;
          try {
            await mobileAds().initialize();
            initialized = true;
            preload();
            return true;
          } catch (error) {
            console.warn("[ads] initialize failed", error);
            return false;
          } finally {
            initializing = null;
          }
        })();
      }
      return initializing;
    },

    canRequestAds: () => canRequest,
    privacyOptionsRequired: () => privacyRequired,

    async showPrivacyOptions() {
      try {
        readConsent(await AdsConsent.showPrivacyOptionsForm());
        if (canRequest && !initialized) await this.initialize();
      } catch (error) {
        console.warn("[ads] privacy options failed", error);
      }
    },

    interstitialReady: () => initialized && !showing && Boolean(interstitial.loaded),

    showInterstitial() {
      if (!initialized || showing || !interstitial.loaded) {
        preload();
        return Promise.resolve(false);
      }
      showing = true;
      return new Promise<boolean>((resolve) => {
        let opened = false;
        let settled = false;
        const timers: ReturnType<typeof setTimeout>[] = [];
        const offs: (() => void)[] = [];
        const done = (ok: boolean) => {
          if (settled) return;
          settled = true;
          showing = false;
          timers.forEach(clearTimeout);
          offs.forEach((off) => off());
          interstitial = InterstitialAd.createForAdRequest(interstitialId, request);
          preload();
          resolve(ok);
        };
        offs.push(interstitial.addAdEventListener(AdEventType.OPENED, () => (opened = true)));
        offs.push(interstitial.addAdEventListener(AdEventType.CLOSED, () => done(opened)));
        offs.push(interstitial.addAdEventListener(AdEventType.ERROR, () => done(false)));
        timers.push(setTimeout(() => !opened && done(false), 5000));
        timers.push(setTimeout(() => done(opened), OPEN_WATCHDOG_MS));
        interstitial.show().catch(() => done(false));
      });
    },

    showRewarded() {
      if (!initialized || showing) return Promise.resolve(false);
      showing = true;
      return new Promise<boolean>((resolve) => {
        let earned = false;
        let opened = false;
        let settled = false;
        const timers: ReturnType<typeof setTimeout>[] = [];
        const offs: (() => void)[] = [];
        const done = (ok: boolean) => {
          if (settled) return;
          settled = true;
          showing = false;
          timers.forEach(clearTimeout);
          offs.forEach((off) => off());
          rewarded = RewardedAd.createForAdRequest(rewardedId, request);
          preload();
          resolve(ok);
        };
        const show = () => rewarded.show().catch(() => done(false));
        offs.push(rewarded.addAdEventListener(RewardedAdEventType.LOADED, () => !opened && show()));
        offs.push(rewarded.addAdEventListener(AdEventType.OPENED, () => (opened = true)));
        offs.push(rewarded.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => (earned = true)));
        offs.push(rewarded.addAdEventListener(AdEventType.CLOSED, () => done(earned)));
        offs.push(rewarded.addAdEventListener(AdEventType.ERROR, () => done(false)));
        timers.push(setTimeout(() => !opened && done(false), LOAD_WAIT_MS));
        timers.push(setTimeout(() => done(earned), OPEN_WATCHDOG_MS));
        if (rewarded.loaded) show();
        else rewarded.load();
      });
    },
  };
}

export const ads: Ads = native ? buildAds() : noAds;
