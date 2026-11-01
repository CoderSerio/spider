import { tool } from 'ai';
import { z } from 'zod';
import type { GoalOutcome, SimSession } from '../../shared/sim/session.js';
import type { Observation } from '../../shared/state.js';
import { GRASS_VIEW, REACH, VIEW_DISTANCE } from '../../shared/world.js';

/**
 * Built-in tools. Each one is a function call on the local simulation.
 * Every call returns the same envelope: ok, an optional reason, and observation.
 */
export interface ToolResult extends GoalOutcome {
  observation: Observation;
}

const thought = z
  .string()
  .describe('一句第一人称的短话，用中文说你正在做什么。它出现在你旁边。说你要做的事，不要写坐标，也不要写行动的名字。');

function call<T extends z.ZodRawShape>(shape: T) {
  return z.object({ description: thought, ...shape });
}

export function spiderTools(session: SimSession) {
  const finish = (outcome: GoalOutcome, distance = VIEW_DISTANCE): ToolResult => {
    const { halt: _halt, ...rest } = outcome;
    const observation = session.observe(distance);
    return {
      ...rest,
      ahead: observation.self.ahead,
      nearby: observation.self.nearby,
      ways: observation.self.ways,
      nearing: observation.self.nearing,
      observation,
    };
  };

  return {
    observe: tool({
      description:
        '停下看看。返回你在哪里，以及你看得见的东西：位置、stage，还有 properties。' +
        `不填距离就看 ${VIEW_DISTANCE}，最远也是这么远，没有一次看完这片地方的办法。` +
        `走进草丛后距离会缩到 ${GRASS_VIEW}。self.view 是这一次实际看见的距离。` +
        'beyond 是超出视线的数目，hidden 是被比你高的固体挡住的数目。' +
        `inReach 表示水平距离在 ${REACH} 以内，而且没有被挡住。` +
        'self.carrying 是你正带着的东西。self.home 为真表示你在巢里。self.cover 为 grass 表示你站在草丛里。' +
        'ahead 是你面前这一段：open 是沿着朝向还能走多远；by 为 wall 时 id 和 kind 是挡住的固体，slope 是陡坡，clear 是这段是空的。' +
        'ways 是算好的短句，告诉你相对朝向转多少度之后能走多远，正数是顺时针，这个度数就是转身的度数。' +
        'nearing 是你和巢的出入口的关系，也是一句短话；没有靠近出入口时是 null。' +
        '被墙挡住就按 ways 里写的角度转，再往前走。',
      inputSchema: call({
        distance: z
          .number()
          .min(0)
          .max(VIEW_DISTANCE)
          .optional()
          .describe(`往外看多远，最多 ${VIEW_DISTANCE}。不填就看这么远。`),
      }),
      execute: async ({ distance }) => finish({ ok: true }, distance ?? VIEW_DISTANCE),
    }),
    walk: tool({
      description:
        '顺着现在的朝向走一段路，快到的时候慢下来。负数是后退。大约超过 2 个单位就设 fast，不然你只会慢慢挪。返回要走的距离和实际走过的距离。走之前看 ways。被固体挡住时 ok 是 false、reason 是 blocked；坡太陡是 steep。按 ways 里的角度转身再走，不要用同样的参数再顶。',
      inputSchema: call({
        distance: z.number().describe('顺着朝向走多少单位。正数向前。'),
        fast: z.boolean().optional().describe('为真就跑。距离大约超过 2 个单位时用。'),
      }),
      execute: async ({ distance, fast }) => finish(await session.walk(distance, fast ?? false)),
    }),
    turn: tool({
      description: '原地转过若干度。正数是顺时针。返回要转的度数和实际转过的度数。',
      inputSchema: call({
        degrees: z.number().describe('转多少度。正数顺时针。'),
      }),
      execute: async ({ degrees }) => finish(await session.turn(degrees)),
    }),
    turn_to: tool({
      description: '转到一个绝对朝向。0 是世界的 -Z，顺时针为正，范围 -180 到 180。返回目标朝向和这次转过的度数。',
      inputSchema: call({
        heading: z.number().min(-180).max(180).describe('绝对朝向，单位是度。'),
      }),
      execute: async ({ heading }) => finish(await session.turnTo(heading)),
    }),
    move_to: tool({
      description:
        '转向地上的一个点，再走过去。路上跟着地面起伏。大约超过 2 个单位就设 fast。走之前看 ways。被固体挡住时 reason 是 blocked，坡太陡是 steep。按 ways 里的角度绕开，不要用同样的参数再顶。返回走路的结果和距离。',
      inputSchema: call({
        x: z.number().describe('目标的 x，单位。'),
        z: z.number().describe('目标的 z，单位。'),
        fast: z.boolean().optional().describe('走路这一段要不要跑。'),
      }),
      execute: async ({ x, z, fast }) => finish(await session.moveTo(x, z, fast ?? false)),
    }),
    approach: tool({
      description:
        '走到一件东西够得着的地方，并面向它。id 用最近一次观察里的。大约超过 2 个单位就设 fast。被固体挡住时 reason 是 blocked，ahead 会写出那堵墙；坡太陡是 steep。返回 id 和剩下的路程；找不到是 not-found，已经够近是 already-close。',
      inputSchema: call({
        id: z.string().describe('最近一次观察里的 id。'),
        standoff: z.number().min(0).optional().describe(`停在离它多远的地方。默认 ${REACH - 0.3}。`),
        fast: z.boolean().optional().describe('离它大约超过 2 个单位时就跑。'),
      }),
      execute: async ({ id, standoff, fast }) => finish(await session.approach(id, standoff, fast ?? false)),
    }),
    eat: tool({
      description:
        '吃一件 properties 里有 edible 的东西。它在够得着的地方，或者已经在你身上。吃要花时间，stage 会变。吃完它就没了，以后的观察里也不会再出现。中途停下的话，咬到哪算哪。',
      inputSchema: call({
        id: z.string().optional().describe('观察里的 id，或你正带着的那件。不填就吃最近的能吃的。'),
      }),
      execute: async ({ id }) => finish(await session.eat(id)),
    }),
    pick_up: tool({
      description: '搬起一件 properties 里有 carryable 的东西。你一次只能带一件。手上已经有东西时，原因是 carrying。',
      inputSchema: call({
        id: z.string().optional().describe('观察里的 id。不填就搬最近的、够得着的、能搬的。'),
      }),
      execute: async ({ id }) => finish(await session.pickUp(id)),
    }),
    drop: tool({
      description: '把身上的东西放在面前。放下之后你就空了。',
      inputSchema: call({}),
      execute: async () => finish(session.drop()),
    }),
    store: tool({
      description: '把身上的东西留在巢里。你得在家里。留下之后你就空了。',
      inputSchema: call({}),
      execute: async () => finish(session.store()),
    }),
    sleep: tool({
      description: '在巢里睡觉。你得在家里。醒来还在你躺下的地方。',
      inputSchema: call({}),
      execute: async () => finish(await session.sleep()),
    }),
    set_height: tool({
      description: '把身子相对脚下的地面抬高或放低一点。这不是爬山。返回目标和实际抬起的高度。',
      inputSchema: call({
        level: z.number().min(-0.35).max(0.7).describe('想离地多高。'),
      }),
      execute: async ({ level }) => finish(await session.setHeight(level)),
    }),
    drive: tool({
      description: '朝一个方向撑一小会儿。只有别的行动都说不清你要做什么时才用。顶到固体上会提前停下，reason 是 blocked；坡太陡是 steep。返回秒数。',
      inputSchema: call({
        seconds: z.number().min(0).max(10).describe('撑多久，秒。'),
        throttle: z.number().min(-1).max(1).optional().describe('向前 1，向后 -1。默认 0。'),
        turn: z.number().min(-1).max(1).optional().describe('向右 1，向左 -1。默认 0。'),
        lift: z.number().min(-1).max(1).optional().describe('抬高 1，放低 -1。默认 0。'),
        boost: z.number().min(0).max(1).optional().describe('1 是加速。默认 0。'),
      }),
      execute: async ({ seconds, throttle, turn, lift, boost }) =>
        finish(await session.drive(seconds, { throttle, turn, lift, boost })),
    }),
    wait: tool({
      description: '停在原地，让时间过去。返回秒数。',
      inputSchema: call({
        seconds: z.number().min(0).max(10).describe('等多久，秒。'),
      }),
      execute: async ({ seconds }) => finish(await session.wait(seconds)),
    }),
  };
}
