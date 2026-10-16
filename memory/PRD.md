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
