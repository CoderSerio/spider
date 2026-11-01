import type { Spider } from './Spider.js';
import type { Controls } from '../../shared/types.js';

/**
 * A goal is a closed-loop controller: every fixed step it reads the body and
 * returns the inputs that move it toward a target, until done() or timeout.
 */
export interface Goal {
  readonly timeout: number;
  controls(): Controls;
  done(): boolean;
  /** Partial results, reported whether the goal finished or timed out. */
  result(): Record<string, unknown>;
}

const IDLE: Controls = { throttle: 0, turn: 0, lift: 0, boost: 0 };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function wrapRadians(radians: number): number {
  const wrapped = (((radians + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  return wrapped === -Math.PI ? Math.PI : wrapped;
}

function forwardOf(spider: Spider): { x: number; z: number } {
  return { x: -Math.sin(spider.yaw), z: -Math.cos(spider.yaw) };
}

/** Walk a signed distance along the current heading, decelerating into it. */
export function walkGoal(spider: Spider, distance: number, fast = false): Goal {
  const sign = Math.sign(distance) || 1;
  const start = { x: spider.root.position.x, z: spider.root.position.z };
  const forward = forwardOf(spider);
  const target = Math.abs(distance);

  const progress = () => {
    const dx = spider.root.position.x - start.x;
    const dz = spider.root.position.z - start.z;
    return (dx * forward.x + dz * forward.z) * sign;
  };

  return {
    timeout: Math.max(4, target / (fast ? 2.4 : 1.2) + 3),
    controls() {
      const remaining = target - progress();
      // Fast holds full throttle until the last stride, so the body actually reaches a run.
      const throttle = clamp(remaining / (fast ? 1.2 : 0.7), 0, 1) * sign;
      return { ...IDLE, throttle, boost: fast ? 1 : 0 };
    },
    done() {
      return target - progress() <= 0.05 && Math.abs(spider.speed) < 0.2;
    },
    result() {
      return { target: distance, achieved: progress() * sign };
    },
  };
}

/** Turn a signed number of degrees; positive is clockwise (the body's right). */
export function turnGoal(spider: Spider, degrees: number): Goal {
  const startYaw = spider.yaw;
  const targetYaw = startYaw - (degrees * Math.PI) / 180;
  const error = () => wrapRadians(targetYaw - spider.yaw);
  const turned = () => ((startYaw - spider.yaw) * 180) / Math.PI;

  return {
    timeout: Math.max(3, Math.abs(degrees) / 60 + 2),
    controls() {
      const u = -1.5 * (2.5 * error() + spider.yawRate);
      return { ...IDLE, turn: clamp(u, -1, 1) };
    },
    done() {
      return Math.abs(error()) < 0.02 && Math.abs(spider.yawRate) < 0.08;
    },
    result() {
      return { target: degrees, achieved: turned() };
    },
  };
}

/** Raise or lower the deck to a target height. */
export function heightGoal(spider: Spider, level: number): Goal {
  const target = clamp(level, -0.35, 0.7);
  return {
    timeout: 4,
    controls() {
      return { ...IDLE, lift: Math.sign(target - spider.heightSet) };
    },
    done() {
      return Math.abs(spider.heightSet - target) < 0.01;
    },
    result() {
      return { target, achieved: spider.heightSet };
    },
  };
}
