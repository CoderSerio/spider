import type { SpiderState, WorldState } from './state.js';

/** One frame of the local simulation, for the renderer. */
export interface SnapshotMessage {
  type: 'snapshot';
  state: SpiderState;
  world: WorldState;
}
