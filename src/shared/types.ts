/** Anything the spider can be driven by: the keyboard, a replay, a script. */
export interface Controls {
  readonly throttle: number;
  readonly turn: number;
  readonly lift: number;
  readonly boost: number;
}
