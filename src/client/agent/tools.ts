import { tool } from 'ai';
import { z } from 'zod';
import type { GoalOutcome, SimSession } from '../../shared/sim/session.js';
import type { Observation } from '../../shared/state.js';
import { REACH, VIEW_DISTANCE } from '../../shared/world.js';

/**
 * Built-in tools. Each one is a function call on the local simulation.
 * Every call returns the same envelope: ok, an optional reason, and observation.
 */
export interface ToolResult extends GoalOutcome {
  observation: Observation;
}

const thought = z
  .string()
  .describe(
    'One short first-person sentence in the user\'s language saying what you are doing. It is shown beside you. Say what you are doing, not coordinates or the name of the action.',
  );

function call<T extends z.ZodRawShape>(shape: T) {
  return z.object({ description: thought, ...shape });
}

export function spiderTools(session: SimSession) {
  const finish = (outcome: GoalOutcome, distance: number | 'all' = VIEW_DISTANCE): ToolResult => ({
    ...outcome,
    observation: session.observe(distance),
  });

  return {
    observe: tool({
      description:
        'Look without moving. Returns where you are and what is inside the look radius, each with ' +
        `horizontal distance, bearing, y, stage, and whether it is within reach (${REACH} units across and close in height). ` +
        'self.y is your height and self.ground is the ground under you. self.height is only how far you are lifted off that ground. ' +
        'seed is the island. An entity that has left the world is absent. ' +
        `beyond counts entities outside that radius. Other tools use the default radius of ${VIEW_DISTANCE}.`,
      inputSchema: call({
        distance: z
          .union([z.number().min(0), z.literal('all')])
          .optional()
          .describe(`Look radius in units. Omit for ${VIEW_DISTANCE}. "all" includes every entity.`),
      }),
      execute: async ({ distance }) => finish({ ok: true }, distance ?? VIEW_DISTANCE),
    }),
    walk: tool({
      description:
        'Walk a signed distance along the current heading and decelerate into it. ' +
        'Negative distances walk backwards. Set fast for anything longer than about 2 units, ' +
        'or you only creep. Returns target and achieved distance.',
      inputSchema: call({
        distance: z.number().describe('Units along the current heading. Positive is forward.'),
        fast: z.boolean().optional().describe('True to run. Use it when the distance is more than about 2 units.'),
      }),
      execute: async ({ distance, fast }) => finish(await session.walk(distance, fast ?? false)),
    }),
    turn: tool({
      description: 'Turn in place by a signed number of degrees. Positive is clockwise. Returns target and achieved degrees.',
      inputSchema: call({
        degrees: z.number().describe('Degrees to turn. Positive is clockwise.'),
      }),
      execute: async ({ degrees }) => finish(await session.turn(degrees)),
    }),
    turn_to: tool({
      description: 'Face an absolute heading. 0 is world -Z, clockwise positive, in -180 to 180. Returns target and achieved degrees of the turn.',
      inputSchema: call({
        heading: z.number().min(-180).max(180).describe('Absolute heading in degrees.'),
      }),
      execute: async ({ heading }) => finish(await session.turnTo(heading)),
    }),
    move_to: tool({
      description:
        'Turn toward a place on the ground, then walk there. You follow the ground on the way. ' +
        'Set fast when the point is more than about 2 units away. A steep face stops the walk. ' +
        'Returns the walk result and the distance.',
      inputSchema: call({
        x: z.number().describe('Target x in units.'),
        z: z.number().describe('Target z in units.'),
        fast: z.boolean().optional().describe('True to run the walking part.'),
      }),
      execute: async ({ x, z, fast }) => finish(await session.moveTo(x, z, fast ?? false)),
    }),
    approach: tool({
      description:
        'Walk to within reach of an entity and face it. Use the id from the latest observation. ' +
        'Set fast when it is more than about 2 units away. ' +
        'Returns id and the remaining walk, or reason not-found or already-close.',
      inputSchema: call({
        id: z.string().describe('Entity id from the latest observation.'),
        standoff: z.number().min(0).optional().describe(`Stop this many units from the entity. Default ${REACH - 0.3}.`),
        fast: z.boolean().optional().describe('True to run when the entity is more than about 2 units away.'),
      }),
      execute: async ({ id, standoff, fast }) => finish(await session.approach(id, standoff, fast ?? false)),
    }),
    interact: tool({
      description:
        'Act on the nearest entity, or the one named by id. The action takes time and the result names it. ' +
        'Eating an apple changes its stage, then removes it, so later observations do not list it. ' +
        'Resting on a chair leaves the chair where it is. Stopping early keeps the stage already reached. ' +
        `Fails with out-of-reach when farther than ${REACH} units or well above or below you.`,
      inputSchema: call({
        id: z.string().optional().describe('Entity id. Omit to use the nearest entity.'),
      }),
      execute: async ({ id }) => finish(await session.interact(id)),
    }),
    set_height: tool({
      description:
        'Lift or lower yourself a little off the ground under you. This does not climb a hill. Returns target and achieved offset.',
      inputSchema: call({
        level: z.number().min(-0.35).max(0.7).describe('Target deck height.'),
      }),
      execute: async ({ level }) => finish(await session.setHeight(level)),
    }),
    drive: tool({
      description:
        'Hold a direction for a few seconds. Use this only when no other action can say what you are doing. Returns seconds.',
      inputSchema: call({
        seconds: z.number().min(0).max(10).describe('How long to hold the controls, in seconds.'),
        throttle: z.number().min(-1).max(1).optional().describe('Forward 1, back -1. Default 0.'),
        turn: z.number().min(-1).max(1).optional().describe('Right 1, left -1. Default 0.'),
        lift: z.number().min(-1).max(1).optional().describe('Up 1, down -1. Default 0.'),
        boost: z.number().min(0).max(1).optional().describe('1 to boost. Default 0.'),
      }),
      execute: async ({ seconds, throttle, turn, lift, boost }) =>
        finish(await session.drive(seconds, { throttle, turn, lift, boost })),
    }),
    wait: tool({
      description: 'Stay as you are while time passes. Returns seconds.',
      inputSchema: call({
        seconds: z.number().min(0).max(10).describe('How long to wait, in seconds.'),
      }),
      execute: async ({ seconds }) => finish(await session.wait(seconds)),
    }),
  };
}
