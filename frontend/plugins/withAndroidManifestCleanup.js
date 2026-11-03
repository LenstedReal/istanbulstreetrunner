// Removes the media-playback foreground service that expo-audio merges into the
// manifest. The game never plays audio in the background or on the lock screen,
// and Google Play asks for a declaration (and a video) for every app that keeps
// FOREGROUND_SERVICE_MEDIA_PLAYBACK. The permission itself is removed through
// android.blockedPermissions in app.json; this removes the service entry.
const { withAndroidManifest } = require("@expo/config-plugins");

const REMOVED_SERVICES = ["expo.modules.audio.service.AudioControlsService"];

module.exports = function withAndroidManifestCleanup(config) {
  return withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;
    manifest.$ = manifest.$ || {};
    manifest.$["xmlns:tools"] = manifest.$["xmlns:tools"] || "http://schemas.android.com/tools";
    const app = (manifest.application && manifest.application[0]) || null;
    if (!app) return mod;
    app.service = (app.service || []).filter((s) => !REMOVED_SERVICES.includes(s.$ && s.$["android:name"]));
    for (const name of REMOVED_SERVICES) {
      app.service.push({ $: { "android:name": name, "tools:node": "remove" } });
    }
    return mod;
  });
};
