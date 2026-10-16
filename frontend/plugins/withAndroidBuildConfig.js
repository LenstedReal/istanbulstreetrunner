// Hardens the Android app module against "Unresolved reference 'BuildConfig'" in
// :app:compileReleaseKotlin on EAS (Gradle 9 / AGP 8.12 / Kotlin 2.1):
//  1. explicitly enables buildConfig on the app module,
//  2. emits BuildConfig as bytecode so it is on the compile classpath for Kotlin and Java,
//  3. removes the BuildConfig lookups from the generated Kotlin entry files
//     (values are constants: new arch is always on, release level defaults to "stable").
const { withAppBuildGradle, withGradleProperties, withMainActivity, withMainApplication } = require("@expo/config-plugins");

const BYTECODE_KEY = "android.enableBuildConfigAsBytecode";

function withBuildFeatures(config) {
  return withAppBuildGradle(config, (mod) => {
    const src = mod.modResults.contents;
    if (!/buildFeatures\s*\{[^}]*buildConfig/.test(src)) {
      mod.modResults.contents = src.replace(/(\n\s*namespace\s+['"][^'"]+['"]\s*\n)/, "$1    buildFeatures {\n        buildConfig true\n    }\n");
    }
    return mod;
  });
}

function withBytecodeBuildConfig(config) {
  return withGradleProperties(config, (mod) => {
    mod.modResults = mod.modResults.filter((item) => !(item.type === "property" && item.key === BYTECODE_KEY));
    mod.modResults.push({ type: "property", key: BYTECODE_KEY, value: "true" });
    return mod;
  });
}

function withoutBuildConfigInKotlin(config) {
  config = withMainActivity(config, (mod) => {
    mod.modResults.contents = mod.modResults.contents.replace(/BuildConfig\.IS_NEW_ARCHITECTURE_ENABLED/g, "true");
    return mod;
  });
  return withMainApplication(config, (mod) => {
    mod.modResults.contents = mod.modResults.contents
      .replace(/BuildConfig\.IS_NEW_ARCHITECTURE_ENABLED/g, "true")
      .replace(/BuildConfig\.REACT_NATIVE_RELEASE_LEVEL/g, '"stable"');
    return mod;
  });
}

module.exports = function withAndroidBuildConfig(config) {
  return withoutBuildConfigInKotlin(withBytecodeBuildConfig(withBuildFeatures(config)));
};
