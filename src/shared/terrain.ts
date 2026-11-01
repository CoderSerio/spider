import { createNoise, fbm } from './noise.js';

/** The island sits inside this square. Past the rim the ground is flat at 0. */
export const TERRAIN = {
  half: 36,
  /** Radius at which the hills have faded out. */
  island: 30,
  /** Flat pad around the spawn, so the body does not start on a slope. */
  pad: 6,
} as const;

const HEIGHT = 3.6;

export class Terrain {
  readonly seed: number;
  readonly #noise: (x: number, y: number) => number;

  constructor(seed: number) {
    this.seed = seed >>> 0;
    this.#noise = createNoise(this.seed);
  }

  /** World height at a horizontal point. The origin is flattened. */
  height(x: number, z: number): number {
    const radius = Math.hypot(x, z);
    const rim = radius / TERRAIN.island;
    if (rim >= 1) return 0;
    const edge = rim <= 0.72 ? 1 : (1 - rim) / 0.28;
    const mask = edge * edge * (3 - 2 * edge);
    const pad = radius >= TERRAIN.pad ? 1 : (radius / TERRAIN.pad) ** 2;
    const n = fbm(this.#noise, x * 0.055, z * 0.055);
    return n * HEIGHT * mask * pad;
  }
}
