import type { WorldState } from './state.js';

/** How close the body must be to act on an entity. */
export const REACH = 1.2;

/** How far observe looks when the caller does not pass a distance. */
export const VIEW_DISTANCE = 8;

const APPLE_COUNT = 3;
/** Apples stay inside this square, and away from the spider's spawn point. */
const SPREAD = 7;
const MIN_GAP = 3.5;
const MIN_DISTANCE_FROM_SPIDER = 3;

const round = (value: number): number => Math.round(value * 2) / 2;

/**
 * The scene the agent is dropped into: three apples, spread out so no single
 * heading covers two of them.
 */
export function createWorld(): WorldState {
  const placed: { x: number; z: number }[] = [];
  const entities: WorldState['entities'] = [];

  while (entities.length < APPLE_COUNT) {
    const x = round((Math.random() * 2 - 1) * SPREAD);
    const z = round((Math.random() * 2 - 1) * SPREAD);

    if (Math.hypot(x, z) < MIN_DISTANCE_FROM_SPIDER) continue;
    if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < MIN_GAP)) continue;

    placed.push({ x, z });
    entities.push({
      id: entities.length === 0 ? 'apple' : `apple-${entities.length + 1}`,
      kind: 'apple',
      x,
      z,
      consumed: false,
    });
  }

  return { entities };
}
