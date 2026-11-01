import {
  toHeading,
  toObservation,
  wrapDegrees,
  type Observation,
  type SpiderState,
  type WorldState,
} from '../state.js';
import type { Controls } from '../types.js';
import { createWorld, REACH, VIEW_DISTANCE } from '../world.js';
import { heightGoal, turnGoal, walkGoal, type Goal } from './goals.js';
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
  readonly world: WorldState = createWorld();
  paused = false;

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

  /** `all` includes every entity. A number is the look radius. The default is VIEW_DISTANCE. */
  observe(distance: number | 'all' = VIEW_DISTANCE): Observation {
    const within = distance === 'all' ? undefined : distance;
    return toObservation(this.spider.capture(), this.world, REACH, within);
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
    return this.run({
      timeout: seconds + 1,
      controls: () => controls,
      done: () => this.spider.time - startedAt >= seconds,
      result: () => ({ seconds }),
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
    const entity = this.world.entities.find((item) => item.id === id && !item.consumed);
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

  /**
   * The interaction key: act on whatever is nearby, the way F works in a game.
   * Apples are eaten today; future kinds dispatch to their own effect here.
   */
  interact(id?: string): GoalOutcome {
    const { x, z } = this.spider.root.position;
    const candidates = this.world.entities.filter(
      (item) => !item.consumed && (id ? item.id === id : true),
    );
    if (candidates.length === 0) return { ok: false, reason: 'nothing-to-interact' };

    const closest = candidates.reduce((best, item) =>
      Math.hypot(item.x - x, item.z - z) < Math.hypot(best.x - x, best.z - z) ? item : best,
    );
    const distance = Math.hypot(closest.x - x, closest.z - z);
    if (distance > REACH) return { ok: false, reason: 'out-of-reach', id: closest.id, distance };

    if (closest.kind === 'apple') {
      closest.consumed = true;
      return { ok: true, action: 'eat', target: closest.id, distance };
    }
    return { ok: false, reason: 'not-interactable', id: closest.id };
  }

  /** Drop a new prop into the world. */
  addEntity(kind: string, x: number, z: number): WorldState['entities'][number] {
    const sameKind = this.world.entities.filter((item) => item.kind === kind).length;
    const entity = { id: `${kind}-${sameKind + 1}`, kind, x, z, consumed: false };
    this.world.entities.push(entity);
    return entity;
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

    active.finish({
      ok: reached,
      reason: reached ? 'reached' : 'timeout',
      ...active.goal.result(),
    });
  }

  #humanHeld(): boolean {
    return this.#human.throttle !== 0 || this.#human.turn !== 0 || this.#human.lift !== 0;
  }
}
