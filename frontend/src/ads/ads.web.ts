export interface Ads {
  /** True when a native ad SDK is available (development/production build). */
  readonly available: boolean;
  initialize: () => Promise<boolean>;
  /** Resolves true if an interstitial was actually shown. */
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
  async showInterstitial() {
    return false;
  },
  async showRewarded() {
    return false;
  },
};
