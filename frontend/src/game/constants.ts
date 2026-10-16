// Gameplay tuning. Adapted from the original Godot runner (sonsuz-kosu) and
// pushed toward Subway Surfers pacing: endless, speed ramps, lanes 2.2 m apart.
export const LANE_W = 2.2;
export const START_SPEED = 13;
export const MAX_SPEED = 32;
export const SPEED_STEP = 1.07; // multiplier every SPEED_INTERVAL seconds
export const SPEED_INTERVAL = 10;

export const SPAWN_AHEAD = 130;
export const DESPAWN_BEHIND = 14;
export const FIRST_ROW_Z = -42;

export const PLAYER_H = 1.75;
export const ROLL_H = 0.85;
export const PLAYER_HALF_W = 0.35;
export const PLAYER_HALF_D = 0.3;

export const JUMP_VY = 9.2;
export const GRAVITY = -26;
export const ROLL_TIME = 0.8;
export const LANE_LERP = 11;

export const CHUNK_LEN = 30;
export const NUM_CHUNKS = 8;

export const POWERUP_TIME: Record<"magnet" | "x2", number> = { magnet: 9, x2: 10 };
export const MAGNET_RANGE = 9;
export const COIN_POINTS = 0; // coins are a separate currency, like Subway Surfers

export const CRASH_DELAY = 1.0; // seconds between crash and the game over sheet
export const HUD_INTERVAL = 0.08;
