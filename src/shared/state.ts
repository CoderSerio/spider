/** Serializable simulation state, world state, and the observation format. */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface SpiderState {
  time: number;
  position: Vec3;
  /** three.js yaw in radians; the body's forward is -Z rotated by this. */
  yaw: number;
  speed: number;
  /** Target deck height, the value the lift keys move. */
  height: number;
  chassisPitch: number;
  chassisRoll: number;
  headYaw: number;
  /** One entry per leg, in mount order. */
  feet: Vec3[];
}

export interface EntityState {
  id: string;
  kind: string;
  x: number;
  z: number;
  consumed: boolean;
}

export interface WorldState {
  entities: EntityState[];
}

export interface SeenEntity extends EntityState {
  /** Units from the body. One unit is one grid cell. */
  distance: number;
  /** Degrees relative to the body's heading, clockwise positive. */
  bearing: number;
  /** Whether the body is close enough to act on it. */
  inReach: boolean;
}

export interface Observation {
  time: number;
  /** Look radius in units. Null means every entity was included. */
  range: number | null;
  /** Entities left out because they sit beyond range. */
  beyond: number;
  self: {
    x: number;
    z: number;
    /** Degrees. 0 is world -Z, clockwise positive. */
    heading: number;
    height: number;
    speed: number;
    /** Indices of legs off the ground right now. */
    legsLifting: number[];
  };
  entities: SeenEntity[];
}

/** A foot above this height is mid-swing rather than planted. */
const GROUND_LIFT = 0.17;

/** Compass-style degrees from a three.js yaw. */
export function toHeading(yaw: number): number {
  return wrapDegrees((-yaw * 180) / Math.PI);
}

export function wrapDegrees(degrees: number): number {
  const wrapped = (((degrees + 180) % 360) + 360) % 360 - 180;
  return wrapped === -180 ? 180 : wrapped;
}

export function toObservation(
  state: SpiderState,
  world: WorldState,
  reach: number,
  within?: number,
): Observation {
  const heading = toHeading(state.yaw);
  const seen: SeenEntity[] = [];
  let beyond = 0;
  for (const entity of world.entities) {
    const dx = entity.x - state.position.x;
    const dz = entity.z - state.position.z;
    const distance = Math.hypot(dx, dz);
    if (within != null && distance > within) {
      beyond += 1;
      continue;
    }
    seen.push({
      ...entity,
      distance: Number(distance.toFixed(3)),
      bearing: Number(wrapDegrees((Math.atan2(dx, -dz) * 180) / Math.PI - heading).toFixed(1)),
      inReach: distance <= reach,
    });
  }
  return {
    time: Number(state.time.toFixed(3)),
    range: within ?? null,
    beyond,
    self: {
      x: Number(state.position.x.toFixed(3)),
      z: Number(state.position.z.toFixed(3)),
      heading: Number(heading.toFixed(1)),
      height: Number(state.height.toFixed(3)),
      speed: Number(state.speed.toFixed(3)),
      legsLifting: state.feet
        .map((foot, index) => (foot.y > GROUND_LIFT ? index : -1))
        .filter((index) => index >= 0),
    },
    entities: seen,
  };
}
