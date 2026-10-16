# İstanbul Koşusu — PRD

## Original problem statement
"https://github.com/yusufipk/sonsuz-kosu bu repoyu çek ve klonla Android tarafında çalışan kotlin oyununa dönüştür ve çoğu işlevi değiştir ama ana mantık Subway surfers tarzında yerleri binalari falan değiştir."
User agreed to Expo (React Native) instead of Kotlin. Choices: Expo + 3D (expo-gl + three.js), Istanbul streets theme, endless run + high scores (Subway Surfers logic), swipe-only controls (mobile), local scores + online friends/global leaderboard. Priority: quality, performance, working build.

## Source analysis (sonsuz-kosu, Godot 4.7)
Three lanes (2.5 m), speed ramp ×1.08 every 10 s, 90 s round, barriers (jump), pillars (lane change), cart (2 lanes), crystal lines/arcs. Assets not MIT → nothing reused; everything rebuilt procedurally.

## Architecture
- Backend: FastAPI + MongoDB (`/app/backend/server.py`) — players, runs, friendships (soft delete), leaderboard. BaseDocument/PyObjectId pattern.
- Frontend: Expo Router. `app/index.tsx` game screen (GLView canvas + overlays: menu, HUD, pause, game over, tutorial), `app/leaderboard.tsx` (Yerel/Arkadaşlar/Dünya), `app/settings.tsx` (modal).
- Game engine: `src/game/` — `engine.ts` (loop, spawning, collisions, powerups), `world.ts` (recycled 30 m city chunks, backdrop skyline), `objects.ts` (tram, simit cart, barrier, sign, pillar, coin, powerups), `runner.ts` (box-built runner), `constants.ts`, `palette.ts`. three.js renderer created directly on expo-gl context (no expo-three).
- Profile: `src/profile.tsx` (storage util; nickname, best score, coins, local top 10, haptics, tutorial flag; anonymous online profile w/ friend code created lazily).
- Design tokens: `src/theme.ts` (filled from design_guidelines.json), `src/tokens.ts` (fonts Fredoka/Nunito via expo-font, spacing, radius).

## User personas
- Casual mobile gamer wanting a quick Subway Surfers style run.
- Friends comparing high scores via friend codes.

## Core requirements (static)
- Swipe left/right/up/down → lane, jump, roll. Endless, speed ramps, crash ends run.
- Istanbul theme: red tram, simit carts, Ottoman lamps, pastel Galata facades, mosque + Galata tower skyline.
- Score = distance × multiplier; coins separate currency. Powerups: magnet, x2, shield.
- Local top-10 + best; online friends & global leaderboard; nickname edit.

## Implemented (2026-06-16)
- Full backend API, tested (16/16).
- 3D runner game with HUD, tutorial, pause, game over, new record badge, haptics.
- Leaderboard (local/friends/global) with add/remove friend by code; settings (nickname, haptics, tutorial reset, controls help).
- Web preview keyboard support (arrows/WASD/space/Esc) for testing.

## Backlog
- P0: Device test on Android via Expo Go (performance of full-res GL on high-DPI phones; consider lower internal resolution if needed).
- P1: Sound effects & music (expo-audio), daily missions, character/skin shop spending coins, jump-onto-tram mechanic.
- P2: Share score card, nickname uniqueness, avatar colors, dark mode.

## Next tasks
- Collect user feedback on difficulty/speed tuning; add audio; coin shop.

## Update (2026-06-16, iteration 2-4)
- Real NCS tracks (5) selectable in Settings, seamless 2.2 s crossfade loop; SFX synthesized (scripts/gen_audio.py). Music plays only during a run or as Settings preview.
- Launch screen (IntroOverlay, 3-7 s), branding regenerated (scripts/gen_branding.py), app renamed "Istanbul Runner", no Emergent assets.
- Realism: procedural textures, shadows (toggle), tram/building details, runner facing fixed.
- Backend soft-delete (deleted_at) + scripts/cleanup_test_data.py; DB cleaned of test accounts; profile self-heals on 404.
- 2026-06-16 (iter 5): haptics on web (navigator.vibrate) + test button + VIBRATE permission; local data reset; Expo Go crash fix (hide WebGLRenderingContext global while creating three renderer). DB: only the user's own profile (8RNZ49) remains active.
- 2026-06-16 (iter 6-7): AdMob via react-native-google-mobile-ads (interstitial every 3rd Oyna, rewarded for revive keys & song change; user's Android IDs in .env/app.json, Google test IDs in dev builds; web/Expo Go fallback). Subway Surfers revive: keys 1-2-4-8-16, max 5 revives, 8 s countdown. Keys spawn ~every 2 km. Pause -> settings gear. Ad-free 199 TL/month placeholder (RevenueCat pending Play Console) with 50-key welcome pack once. Coin visuals redesigned.
- 2026-06-16: copy simplified (intro loading texts, menu tagline, ad-free card, NCS credit, revive sheet).
- 2026-06-16: Android EAS build fix — react-native-google-mobile-ads 17.2.0 gradle reads root-level `react-native-google-mobile-ads` key from app.json (library bug: sets `googleAdsJson` typo when key missing → "Cannot get property googleMobileAdsJson"). Added root key (android_app_id/ios_app_id), removed duplicate plugin entry; .gitignore no longer excludes .env. iOS app id is still Google's sample id (user has no iOS AdMob app yet).
- 2026-06-16: 2nd EAS failure: `:app:compileReleaseKotlin` "Unresolved reference 'BuildConfig'" in MainActivity/MainApplication (BuildConfig generated but not resolved by Kotlin). Added local config plugin `frontend/plugins/withAndroidBuildConfig.js` (listed in app.json plugins): explicit `buildFeatures { buildConfig true }` in app/build.gradle, `android.enableBuildConfigAsBytecode=true` in gradle.properties, and replaces BuildConfig lookups in the generated Kotlin entry files with constants (`true`, `"stable"`). Verified via local `expo prebuild`.
- 2026-06-16: settings helper texts restored with balanced wording (one short line each); all "store-version only" / "activates after Google Play publish" messages removed. Subscribe button is silent until RevenueCat is wired.
