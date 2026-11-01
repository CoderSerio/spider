import type { SpiderState, WorldState } from './state.js';
import type { Controls } from './types.js';

/** Server -> browser, ~30 times a second. */
export interface SnapshotMessage {
  type: 'snapshot';
  state: SpiderState;
  world: WorldState;
}

/** Browser -> server. The human can drive too; held keys win over the agent. */
export interface InputMessage extends Controls {
  type: 'input';
}

export interface PauseMessage {
  type: 'pause';
  paused: boolean;
}

export type ClientMessage = InputMessage | PauseMessage;
export type ServerMessage = SnapshotMessage;

/** Events streamed from the agent loop to the page (NDJSON, one per line). */
export type AgentEvent =
  | { type: 'text'; text: string }
  | { type: 'tool-call'; name: string; input: unknown }
  | { type: 'tool-result'; name: string; output: unknown }
  | { type: 'error'; message: string }
  | { type: 'done'; text: string };
