import type { WorldState } from './state.js';

/** How close the body must be to act on an entity. */
export const REACH = 1.2;

/** The scene the agent is dropped into. */
export function createWorld(): WorldState {
  return {
    entities: [{ id: 'apple', kind: 'apple', x: 4, z: -6, consumed: false }],
  };
}
