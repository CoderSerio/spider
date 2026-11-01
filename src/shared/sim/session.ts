import {
  toHeading,
  toObservation,
  wrapDegrees,
  type EntityState,
  type Observation,
  type SpiderState,
  type WorldState,
} from '../state.js';
import { kindOf, propertiesOf, slicesOf } from '../kinds.js';
import type { Controls } from '../types.js';
import { blockedAt, grassHere, insideHome, occluded } from '../sight.js';
import { createWorld, GRASS_VIEW, REACH, REACH_Y, restingY, VIEW_DISTANCE } from '../world.js';
import { TERRAIN } from '../terrain.js';
import { heightGoal, STUCK_LIMIT, turnGoal, walkGoal, type Goal } from './goals.js';
import { Spider } from './Spider.js';

const STEP = 1 / 60;
const ZERO: Controls = { throttle: 0, turn: 0, lift: 0, boost: 0 };

export interface GoalOutcome {
  ok: boolean;
  reason?: string;
  [key: string]: unknown;
}

interface ActiveGoal {
  goal: Goal;
  startedAt: number;
  guard: ReturnType<typeof setTimeout>;
  finish(outcome: GoalOutcome): void;
}

/**
 * Owns the simulation. The page ticks it locally; nothing else is authoritative.
 */
export class SimSession {
  readonly spider = new Spider();
  readonly world: WorldState;
  paused = false;

  constructor(seed?: number) {
    this.world = createWorld(seed);
    this.spider.bindGround((x, z) => this.world.terrain.height(x, z), TERRAIN.half - 1);
    this.spider.bindBlocked((x, z) => blockedAt(x, z, this.world.blocks));
  }

  #human: Controls = ZERO;
  #active: ActiveGoal | null = null;
  #last = performance.now();
  #acc = 0;
  #timer?: ReturnType<typeof setInterval>;

  start(): void {
    this.#last = performance.now();
    this.#timer = setInterval(() => this.tick(), 16);
  }

  stop(): void {
    if (this.#timer) clearInterval(this.#timer);
  }

  setHumanInput(input: Controls): void {
    this.#human = input;
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  /** Drop the goal that currently owns the body, if one is running. */
  cancel(): void {
    const active = this.#active;
    if (!active) return;
    active.finish({ ok: false, reason: 'cancelled', ...active.goal.result() });
  }

  snapshot(): { state: SpiderState; world: WorldState } {
    return { state: this.spider.capture(), world: this.world };
  }

  /**
   * Look. The distance cannot exceed the default, and grass shortens it further.
   * There is no way to see the whole island at once.
   */
  observe(distance = VIEW_DISTANCE): Observation {
    const asked = Math.min(VIEW_DISTANCE, Math.max(0, distance));
    const { x, z } = this.spider.root.position;
    const view = grassHere(x, z, this.world.entities) ? Math.min(asked, GRASS_VIEW) : asked;
    return toObservation(this.spider.capture(), this.world, REACH, view);
  }

  /** One visible frame. The page calls this from its render loop. */
  frame(dt: number): void {
    this.#step(Math.min(0.05, Math.max(0, dt)));
  }

  tick(): void {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.#last) / 1000);
    this.#last = now;
    this.#acc += dt;
    while (this.#acc >= STEP) {
      this.#acc -= STEP;
      this.#step(STEP);
    }
  }

  /** Run a goal to completion; resolves on reach, timeout, or preemption. */
  run(goal: Goal): Promise<GoalOutcome> {
    const previous = this.#active;
    if (previous) previous.finish({ ok: false, reason: 'cancelled', ...previous.goal.result() });

    return new Promise<GoalOutcome>((resolve) => {
      const active: ActiveGoal = {
        goal,
        startedAt: this.spider.time,
        guard: undefined as unknown as ReturnType<typeof setTimeout>,
        finish: (outcome: GoalOutcome) => {
          if (this.#active === active) this.#active = null;
          clearTimeout(active.guard);
          resolve(outcome);
        },
      };
      // Wall-clock guard: if the sim is paused, sim time never reaches the
      // goal's timeout, and the tool call would otherwise hang forever.
      active.guard = setTimeout(
        () => active.finish({ ok: false, reason: 'timeout', ...goal.result() }),
        (goal.timeout + 3) * 1000,
      );
      this.#active = active;
    });
  }

  walk(distance: number, fast = false): Promise<GoalOutcome> {
    return this.run(walkGoal(this.spider, distance, fast));
  }

  turn(degrees: number): Promise<GoalOutcome> {
    return this.run(turnGoal(this.spider, degrees));
  }

  /** Turn to an absolute compass heading (0 = world -Z, clockwise positive). */
  turnTo(heading: number): Promise<GoalOutcome> {
    return this.turn(wrapDegrees(heading - toHeading(this.spider.yaw)));
  }

  setHeight(level: number): Promise<GoalOutcome> {
    return this.run(heightGoal(this.spider, level));
  }

  drive(seconds: number, input: Partial<Controls>): Promise<GoalOutcome> {
    const controls: Controls = {
      throttle: input.throttle ?? 0,
      turn: input.turn ?? 0,
      lift: input.lift ?? 0,
      boost: input.boost ?? 0,
    };
    const startedAt = this.spider.time;
    const held = () => Math.abs(controls.throttle) > 0.05 && this.spider.stuckFor >= STUCK_LIMIT;
    return this.run({
      timeout: seconds + 1,
      controls: () => controls,
      done: () => this.spider.time - startedAt >= seconds || held(),
      result: () => (held() ? { seconds, halt: this.spider.halt } : { seconds }),
    });
  }

  wait(seconds: number): Promise<GoalOutcome> {
    return this.drive(seconds, {});
  }

  async moveTo(x: number, z: number, fast = false): Promise<GoalOutcome> {
    const { x: x0, z: z0 } = this.spider.root.position;
    const distance = Math.hypot(x - x0, z - z0);
    const bearing = (Math.atan2(x - x0, -(z - z0)) * 180) / Math.PI;
    const turn = await this.turn(wrapDegrees(bearing - toHeading(this.spider.yaw)));
    if (!turn.ok) return { ...turn, ok: false, reason: `turn ${turn.reason}` };
    const walk = await this.walk(distance, fast);
    return { ...walk, distance };
  }

  /** Walk to within `standoff` of an entity, facing it. */
  async approach(id: string, standoff = REACH - 0.3, fast = false): Promise<GoalOutcome> {
    const entity = this.world.entities.find((item) => item.id === id);
    if (!entity) return { ok: false, reason: 'not-found', id };

    const { x, z } = this.spider.root.position;
    const distance = Math.hypot(entity.x - x, entity.z - z) - standoff;
    if (distance <= 0.05) return { ok: true, reason: 'already-close', id };

    const bearing = (Math.atan2(entity.x - x, -(entity.z - z)) * 180) / Math.PI;
    const turn = await this.turn(wrapDegrees(bearing - toHeading(this.spider.yaw)));
    if (!turn.ok) return { ...turn, ok: false, reason: `turn ${turn.reason}` };
    const walk = await this.walk(distance, fast);
    return { ...walk, id, distance };
  }

  /** Eat something edible that is in reach, or the thing you are holding. */
  eat(id?: string): Promise<GoalOutcome> {
    const held = this.world.carrying;
    let entity =
      id && held?.id === id
        ? held
        : this.#nearest(id, (item) => propertiesOf(item.kind).includes('edible'));
    if (!entity && !id && held && propertiesOf(held.kind).includes('edible')) entity = held;
    if (!entity) return Promise.resolve({ ok: false, reason: id ? 'not-found' : 'nothing-to-eat', id });
    if (!propertiesOf(entity.kind).includes('edible')) {
      return Promise.resolve({ ok: false, reason: 'not-edible', id: entity.id });
    }
    if (entity !== held) {
      const reach = this.#reachable(entity);
      if (!reach.ok) return Promise.resolve(reach);
    }

    const kind = kindOf(entity.kind);
    const meal = kind?.eat;
    if (!kind || !meal) return Promise.resolve({ ok: false, reason: 'not-edible', id: entity.id });

    const startedAt = this.spider.time;
    const slices = slicesOf(kind);
    const elapsed0 = slices === 0 ? 0 : (entity.stage * meal.duration) / slices;
    const remaining = Math.max(0.05, meal.duration - elapsed0);
    const sync = (): number => {
      const now = elapsed0 + (this.spider.time - startedAt);
      if (slices > 0 && (this.world.entities.includes(entity) || this.world.carrying === entity)) {
        const visual = Math.min(meal.stages, Math.floor(now / (meal.duration / slices)));
        entity.stage = Math.max(entity.stage, visual);
      }
      return now;
    };

    return this.run({
      timeout: remaining + 1,
      controls: () => ZERO,
      done: () => sync() >= meal.duration - 1e-4,
      result: () => ({ action: 'eat', target: entity.id, stage: entity.stage, removed: false }),
    }).then((outcome) => {
      if (!outcome.ok || !meal.removes) return { ...outcome, stage: entity.stage, removed: false };
      const stage = entity.stage;
      this.#remove(entity);
      return { ...outcome, action: 'eat', target: entity.id, stage, removed: true };
    });
  }

  /** Pick up one carryable thing. You can hold only one. */
  pickUp(id?: string): Promise<GoalOutcome> {
    if (this.world.carrying) {
      return Promise.resolve({ ok: false, reason: 'carrying', id: this.world.carrying.id });
    }
    const entity = this.#nearest(id, (item) => propertiesOf(item.kind).includes('carryable'));
    if (!entity) return Promise.resolve({ ok: false, reason: id ? 'not-found' : 'nothing-to-carry', id });
    if (!propertiesOf(entity.kind).includes('carryable')) {
      return Promise.resolve({ ok: false, reason: 'not-carryable', id: entity.id });
    }
    const reach = this.#reachable(entity);
    if (!reach.ok) return Promise.resolve(reach);

    const startedAt = this.spider.time;
    return this.run({
      timeout: 2,
      controls: () => ZERO,
      done: () => this.spider.time - startedAt >= 0.7,
      result: () => ({ action: 'pick-up', target: entity.id }),
    }).then((outcome) => {
      if (!outcome.ok) return outcome;
      if (!this.world.entities.includes(entity)) return { ok: false, reason: 'not-found', id: entity.id };
      this.#remove(entity);
      this.world.carrying = entity;
      return { ok: true, action: 'pick-up', target: entity.id, carrying: entity.id };
    });
  }

  /** Put down what you are holding. Your grasp is free again. */
  drop(): GoalOutcome {
    const item = this.world.carrying;
    if (!item) return { ok: false, reason: 'not-carrying' };
    const spot = this.#spotAhead();
    if (!spot) return { ok: false, reason: 'no-room' };
    this.#putDown(item, spot.x, spot.z);
    return { ok: true, action: 'drop', target: item.id, x: item.x, z: item.z };
  }

  /** Leave what you are holding inside the nest, and free your grasp. */
  store(): GoalOutcome {
    const item = this.world.carrying;
    if (!item) return { ok: false, reason: 'not-carrying' };
    const { x, z } = this.spider.root.position;
    if (!insideHome(x, z)) return { ok: false, reason: 'not-home' };
    const spot = this.#stash();
    if (!spot) return { ok: false, reason: 'no-room' };
    this.#putDown(item, spot.x, spot.z);
    return { ok: true, action: 'store', target: item.id, x: item.x, z: item.z };
  }

  /** Sleep in the nest. You have to be home. */
  sleep(): Promise<GoalOutcome> {
    const { x, z } = this.spider.root.position;
    if (!insideHome(x, z)) return Promise.resolve({ ok: false, reason: 'not-home' });
    const duration = 4;
    const startedAt = this.spider.time;
    const woke = this.spider.heightSet;
    return this.run({
      timeout: duration + 2,
      controls: () => {
        const elapsed = this.spider.time - startedAt;
        const target = elapsed < duration * 0.75 ? -0.28 : woke;
        const lift = Math.abs(this.spider.heightSet - target) < 0.02 ? 0 : Math.sign(target - this.spider.heightSet);
        return { ...ZERO, lift };
      },
      done: () => this.spider.time - startedAt >= duration && Math.abs(this.spider.heightSet - woke) < 0.05,
      result: () => ({ action: 'sleep', home: true }),
    });
  }

  /** Drop a new prop into the world, sitting on the ground. */
  addEntity(kind: string, x: number, z: number): WorldState['entities'][number] {
    const sameKind = this.world.entities.filter((item) => item.kind === kind).length;
    const entity = {
      id: `${kind}-${sameKind + 1}`,
      kind,
      x,
      y: restingY(this.world.terrain, kind, x, z),
      z,
      stage: 0,
    };
    this.world.entities.push(entity);
    return entity;
  }

  #nearest(id: string | undefined, want: (entity: EntityState) => boolean): EntityState | null {
    const { x, z } = this.spider.root.position;
    const pool = this.world.entities.filter((item) => (id ? item.id === id : want(item)));
    if (pool.length === 0) return null;
    return pool.reduce((best, item) =>
      Math.hypot(item.x - x, item.z - z) < Math.hypot(best.x - x, best.z - z) ? item : best,
    );
  }

  #reachable(entity: EntityState): GoalOutcome {
    const { x, y, z } = this.spider.root.position;
    const distance = Math.hypot(entity.x - x, entity.z - z);
    const vertical = Math.abs(entity.y - y);
    if (distance > REACH || vertical > REACH_Y) {
      return { ok: false, reason: 'out-of-reach', id: entity.id, distance };
    }
    const eye = this.world.terrain.height(x, z) + 0.85;
    if (occluded(x, z, entity.x, entity.z, this.world.blocks, entity.id, eye)) {
      return { ok: false, reason: 'blocked', id: entity.id };
    }
    return { ok: true };
  }

  #spotAhead(): { x: number; z: number } | null {
    const { x, z } = this.spider.root.position;
    const forward = { x: -Math.sin(this.spider.yaw), z: -Math.cos(this.spider.yaw) };
    const ahead = { x: x + forward.x * 0.85, z: z + forward.z * 0.85 };
    if (!blockedAt(ahead.x, ahead.z, this.world.blocks, 0.2)) return ahead;
    if (!blockedAt(x, z, this.world.blocks, 0.2)) return { x, z };
    return null;
  }

  #stash(): { x: number; z: number } | null {
    const used = this.world.entities.filter((item) => insideHome(item.x, item.z)).length;
    const x = 1.15;
    const z = 1.15 - used * 0.4;
    if (!insideHome(x, z) || blockedAt(x, z, this.world.blocks, 0.2)) return null;
    return { x, z };
  }

  #putDown(item: EntityState, x: number, z: number): void {
    item.x = x;
    item.z = z;
    item.y = restingY(this.world.terrain, item.kind, x, z, item.footprint);
    this.world.carrying = null;
    this.world.entities.push(item);
  }

  #remove(entity: EntityState): void {
    if (this.world.carrying === entity) {
      this.world.carrying = null;
      return;
    }
    const index = this.world.entities.indexOf(entity);
    if (index >= 0) this.world.entities.splice(index, 1);
  }

  #step(dt: number): void {
    if (this.paused) return;

    const active = this.#active;
    // While a goal owns the body nothing else may steer it: a dropped keyup in
    // the browser would otherwise hold the controls and starve the agent.
    const input = active ? active.goal.controls() : this.#humanHeld() ? this.#human : ZERO;
    this.spider.update(dt, input);
    if (!active) return;

    const reached = active.goal.done();
    const overtime = this.spider.time - active.startedAt > active.goal.timeout;
    if (!reached && !overtime) return;

    const detail = active.goal.result();
    const halt = detail.halt;
    const stopped = halt === 'solid' || halt === 'steep';
    active.finish({
      ok: reached && !stopped,
      reason: stopped ? (halt === 'steep' ? 'steep' : 'blocked') : reached ? 'reached' : 'timeout',
      ...detail,
    });
  }

  #humanHeld(): boolean {
    return this.#human.throttle !== 0 || this.#human.turn !== 0 || this.#human.lift !== 0;
  }
}
