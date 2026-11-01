import { kindOf } from './kinds.js';
import { mulberry32 } from './noise.js';
import type { EntityState, WorldState } from './state.js';
import { Terrain, TERRAIN } from './terrain.js';

/** How close the body must be, horizontally, to act on an entity. */
export const REACH = 1.2;

/** How far observe looks when the caller does not pass a distance. */
export const VIEW_DISTANCE = 8;

/** An entity this far above or below the body cannot be acted on. */
export const REACH_Y = 1.6;

const APPLES = 6;
const CHAIRS = 3;
const MIN_GAP = 3.4;
const MIN_FROM_SPIDER = 4;

const quantize = (value: number): number => Math.round(value * 10) / 10;

/**
 * A seeded island. Hills come from Perlin noise. Apples disappear once eaten;
 * chairs stay after a rest. The same seed builds the same world.
 */
export function createWorld(seed = Math.floor(Math.random() * 1_000_000_000)): WorldState {
  const terrain = new Terrain(seed);
  const rng = mulberry32(seed ^ 0x9e3779b9);
  const placed: { x: number; z: number }[] = [];
  const entities = [
    ...scatter(rng, terrain, placed, 'apple', APPLES),
    ...scatter(rng, terrain, placed, 'chair', CHAIRS),
  ];
  return { seed: terrain.seed, terrain, entities };
}

function scatter(
  rng: () => number,
  terrain: Terrain,
  placed: { x: number; z: number }[],
  kind: string,
  count: number,
): EntityState[] {
  const spec = kindOf(kind);
  if (!spec) return [];
  const entities: EntityState[] = [];
  let guard = 0;
  while (entities.length < count && guard < 500) {
    guard += 1;
    const x = quantize((rng() * 2 - 1) * TERRAIN.island * 0.62);
    const z = quantize((rng() * 2 - 1) * TERRAIN.island * 0.62);
    const radius = Math.hypot(x, z);
    if (radius < MIN_FROM_SPIDER || radius > TERRAIN.island * 0.6) continue;
    const ground = terrain.height(x, z);
    const slope =
      Math.hypot(terrain.height(x + 0.8, z) - ground, terrain.height(x, z + 0.8) - ground) / 0.8;
    if (slope > 0.32) continue;
    if (placed.some((point) => Math.hypot(point.x - x, point.z - z) < MIN_GAP)) continue;
    placed.push({ x, z });
    entities.push({
      id: `${kind}-${entities.length + 1}`,
      kind,
      x,
      y: ground + spec.rest,
      z,
      stage: 0,
    });
  }
  return entities;
}
