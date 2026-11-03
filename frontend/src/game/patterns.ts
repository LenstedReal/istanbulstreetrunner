// Obstacle rows. Pure (no three.js) so fairness is unit-tested: every row leaves
// at least one lane that can be passed by running, jumping or rolling, and the
// lane used for pick-ups is one of them.
import { DISTRICTS, OBSTACLES, type DistrictId, type ObstacleKind } from "./districts";
import { START_SPEED } from "./constants";
import type { Rng } from "./rng";

export type Lane = -1 | 0 | 1;

export interface Placement {
  kind: ObstacleKind;
  lane: Lane;
  /** Offset from the row's z (negative = further away). */
  dz: number;
}

export interface CoinPlan {
  lane: Lane;
  shape: "line" | "arc";
  /** Height of a coin line (rolling lines are lower). */
  y?: number;
}

export interface RowPlan {
  family: "low" | "block" | "moving" | "high";
  obstacles: Placement[];
  coins: CoinPlan[];
  /** A passable lane (empty, or a full row of jumps), where power-ups and keys go. */
  freeLane: Lane;
}

interface Pools {
  low: ObstacleKind[];
  high: ObstacleKind[];
  block: ObstacleKind[];
  moving: ObstacleKind[];
}

const poolCache = new Map<DistrictId, Pools>();

export function poolsFor(id: DistrictId): Pools {
  let p = poolCache.get(id);
  if (!p) {
    const kinds = DISTRICTS[id].obstacles;
    p = {
      low: kinds.filter((k) => OBSTACLES[k].passage === "low"),
      high: kinds.filter((k) => OBSTACLES[k].passage === "high"),
      block: kinds.filter((k) => OBSTACLES[k].passage === "block" && OBSTACLES[k].motion !== "oncoming"),
      moving: kinds.filter((k) => OBSTACLES[k].passage === "block" && OBSTACLES[k].motion === "oncoming"),
    };
    poolCache.set(id, p);
  }
  return p;
}

/** One row of obstacles at `distance` metres into the run. */
export function planRow(rng: Rng, district: DistrictId, distance: number): RowPlan {
  const pools = poolsFor(district);
  const lanes = rng.shuffle<Lane>([-1, 0, 1]);
  const late = distance > 350;
  const hard = distance > 900;
  const roll = rng.next();
  const obstacles: Placement[] = [];
  const coins: CoinPlan[] = [];
  const add = (kind: ObstacleKind, lane: Lane, dz = 0) => obstacles.push({ kind, lane, dz });

  let family: RowPlan["family"] =
    roll < 0.3 ? "low" : roll < 0.52 ? "block" : roll < 0.76 ? "moving" : "high";
  if (family === "moving" && pools.moving.length === 0) family = "block";
  if (family === "high" && pools.high.length === 0) family = "low";
  if (family === "block" && pools.block.length === 0) family = pools.moving.length ? "moving" : "low";
  if (family === "low" && pools.low.length === 0) family = "block";

  let freeLane: Lane = lanes[2];
  if (family === "low") {
    // Jump over. One lane early, up to all three later (still fair: every lane can be jumped).
    const count = late ? rng.int(1, hard ? 3 : 2) : 1;
    for (let i = 0; i < count; i++) add(rng.pick(pools.low), lanes[i]);
    if (rng.chance(0.5)) coins.push({ lane: lanes[0], shape: "arc" });
    if (count < 3) coins.push({ lane: lanes[count], shape: "line" });
    freeLane = lanes[Math.min(count, 2)];
  } else if (family === "block") {
    // Change lane. Never all three.
    const count = rng.chance(0.6) ? 1 : 2;
    for (let i = 0; i < count; i++) add(rng.pick(pools.block), lanes[i]);
    if (late && count === 1 && pools.low.length && rng.chance(0.5)) {
      add(rng.pick(pools.low), lanes[1]);
      coins.push({ lane: lanes[2], shape: "line" });
      freeLane = lanes[2];
    } else {
      coins.push({ lane: lanes[count], shape: "line" });
      freeLane = lanes[count];
    }
  } else if (family === "moving") {
    // Trams and buses come toward the runner and block whole lanes.
    const count = hard && rng.chance(0.5) ? 2 : 1;
    for (let i = 0; i < count; i++) add(rng.pick(pools.moving), lanes[i], -3);
    if (count === 1 && late && pools.high.length && rng.chance(0.4)) add(rng.pick(pools.high), lanes[1]);
    coins.push({ lane: lanes[count], shape: "line" });
    freeLane = lanes[count];
  } else {
    // Roll under.
    const count = late ? rng.int(1, 2) : 1;
    for (let i = 0; i < count; i++) add(rng.pick(pools.high), lanes[i]);
    coins.push({ lane: lanes[0], shape: "line", y: 0.45 });
    freeLane = lanes[0];
    // With two high obstacles the third lane is free; prefer it for pick-ups.
    if (count === 2) freeLane = lanes[2];
  }
  return { family, obstacles, coins, freeLane };
}

/** True when some lane can be passed without a lane change (empty, jump or roll). */
export function isFair(plan: RowPlan): boolean {
  const byLane = new Map<Lane, Placement[]>();
  for (const o of plan.obstacles) byLane.set(o.lane, [...(byLane.get(o.lane) ?? []), o]);
  const passable = (lane: Lane) => {
    const list = byLane.get(lane) ?? [];
    if (list.length === 0) return true;
    // Two different passages in one lane would need jump and roll at once.
    const passages = new Set(list.map((o) => OBSTACLES[o.kind].passage));
    return passages.size === 1 && !passages.has("block");
  };
  // The pick-up lane must itself be passable; a lane-blocking tram or bus never sits in it.
  return ([-1, 0, 1] as Lane[]).some(passable) && passable(plan.freeLane);
}

/** Start speed and difficulty offset for a district level (0 = first). */
export function levelTuning(level: number): { startSpeed: number; distanceOffset: number } {
  const l = Math.max(0, Math.min(4, Math.floor(level)));
  return { startSpeed: START_SPEED + l, distanceOffset: l * 250 };
}
