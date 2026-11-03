// Release build tuning for CI runners (16 GB RAM, limited disk):
//  - more Gradle/Kotlin heap so packaging the APK/AAB does not run out of memory,
//  - only the ARM ABIs every real Android phone uses (x86 is for emulators and a
//    few Intel Chromebooks); halves native compile time, build size and disk use.
const { withGradleProperties } = require("@expo/config-plugins");

const PROPS = {
  "org.gradle.jvmargs": "-Xmx6g -XX:MaxMetaspaceSize=1536m -Dfile.encoding=UTF-8",
  "kotlin.daemon.jvmargs": "-Xmx2g",
  reactNativeArchitectures: "armeabi-v7a,arm64-v8a",
};

module.exports = function withAndroidReleaseTuning(config) {
  return withGradleProperties(config, (mod) => {
    mod.modResults = mod.modResults.filter((item) => !(item.type === "property" && item.key in PROPS));
    for (const [key, value] of Object.entries(PROPS)) mod.modResults.push({ type: "property", key, value });
    return mod;
  });
};
