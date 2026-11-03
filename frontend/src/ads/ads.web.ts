export interface Ads {
  /** True when a native ad SDK is available (development/production build). */
  readonly available: boolean;
  /** Gathers consent (UMP) first; initialises the SDK only if ads may be requested. */
  initialize: () => Promise<boolean>;
  /** Consent allows requesting ads (false until initialize() has run). */
  canRequestAds: () => boolean;
  /** Show the "ad privacy options" entry in Settings (EEA/UK/CH and similar). */
  privacyOptionsRequired: () => boolean;
  showPrivacyOptions: () => Promise<void>;
  /** An interstitial is loaded and can be shown immediately. */
  interstitialReady: () => boolean;
  /** Shows a loaded interstitial; resolves false at once when none is loaded. */
  showInterstitial: () => Promise<boolean>;
  /** Resolves true if the user earned the reward. */
  showRewarded: () => Promise<boolean>;
}

// Web preview: no ads. Callers treat `available === false` as "skip the ad".
export const ads: Ads = {
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
