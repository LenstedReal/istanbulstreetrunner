// Opening the Play Store page; the prompt rules live in rating-logic.ts (unit-tested).
import { Linking } from "react-native";

import { PLAY_PACKAGE } from "./rating-logic";

export * from "./rating-logic";

/** Opens the game's page in the Play Store app, or the web page if the app is missing. */
export async function openStorePage(): Promise<void> {
  try {
    await Linking.openURL(`market://details?id=${PLAY_PACKAGE}`);
  } catch {
    await Linking.openURL(`https://play.google.com/store/apps/details?id=${PLAY_PACKAGE}`).catch(() => undefined);
  }
}
