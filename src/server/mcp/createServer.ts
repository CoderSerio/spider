import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { REACH } from '../../shared/world.js';
import type { GoalOutcome, SimSession } from '../sim/session.js';

/**
 * Every tool description carries the frame of reference, because a model will
 * otherwise invent its own convention for "turn 90 degrees".
 */
const FRAME =
  'Frame: one unit is one grid cell; the origin is where the spider started. ' +
  'Heading 0 points at world -Z and angles grow clockwise (to the right). ' +
  'Every action returns the resulting observation, so trust it over your estimate.';

export function createMcpServer(session: SimSession): McpServer {
  const server = new McpServer({ name: 'p5-art-spider', version: '0.1.0' });

  const text = (payload: unknown) => ({
    content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
  });
  const after = (outcome: GoalOutcome) => text({ ...outcome, observation: session.observe() });

  server.registerTool(
    'observe',
    {
      title: 'Observe',
      description:
        'Look without moving. Returns the body pose and every visible entity with its ' +
        `distance, bearing, and whether it is within reach (${REACH} units). ${FRAME}`,
      inputSchema: z.object({}),
    },
    async () => text(session.observe()),
  );

  server.registerTool(
    'walk',
    {
      title: 'Walk',
      description:
        'Walk a signed distance along the current heading, decelerating into the target. ' +
        'Blocks until the body arrives, slows, or times out; the result reports what was ' +
        `actually achieved. Negative distances walk backwards. ${FRAME}`,
      inputSchema: z.object({
        distance: z.number().describe('Distance in units, positive forward.'),
      }),
    },
    async ({ distance }) => after(await session.walk(distance)),
  );

  server.registerTool(
    'turn',
    {
      title: 'Turn',
      description:
        `Turn in place by a signed number of degrees; positive turns right. ${FRAME}`,
      inputSchema: z.object({
        degrees: z.number().describe('Signed degrees, positive clockwise.'),
      }),
    },
    async ({ degrees }) => after(await session.turn(degrees)),
  );

  server.registerTool(
    'turn_to',
    {
      title: 'Turn to heading',
      description: `Face an absolute compass heading. ${FRAME}`,
      inputSchema: z.object({
        heading: z.number().describe('Absolute heading in degrees, -180 to 180.'),
      }),
    },
    async ({ heading }) => after(await session.turnTo(heading)),
  );

  server.registerTool(
    'move_to',
    {
      title: 'Move to a point',
      description: `Turn toward a world point, then walk to it. ${FRAME}`,
      inputSchema: z.object({
        x: z.number().describe('Target x in units.'),
        z: z.number().describe('Target z in units.'),
      }),
    },
    async ({ x, z }) => after(await session.moveTo(x, z)),
  );

  server.registerTool(
    'approach',
    {
      title: 'Approach an entity',
      description:
        'Walk toward an entity and stop within reach of it, facing it. Prefer this over ' +
        `move_to when the target may move or you only know its id. ${FRAME}`,
      inputSchema: z.object({
        id: z.string().describe('Entity id from observe, e.g. "apple".'),
        standoff: z.number().optional().describe('How close to stop, in units.'),
      }),
    },
    async ({ id, standoff }) => after(await session.approach(id, standoff)),
  );

  server.registerTool(
    'interact',
    {
      title: 'Interact',
      description:
        'The interaction key, the way F works in a game: act on the nearest entity, or on the ' +
        'one you name. An apple gets eaten; other kinds dispatch to their own effect. Nothing ' +
        `happens if the target is beyond reach (${REACH} units) — use approach first. ${FRAME}`,
      inputSchema: z.object({
        id: z.string().optional().describe('Entity id; defaults to the nearest one.'),
      }),
    },
    async ({ id }) => after(session.interact(id)),
  );

  server.registerTool(
    'set_height',
    {
      title: 'Set deck height',
      description: `Raise or lower the body to a target height from -0.35 to 0.7. ${FRAME}`,
      inputSchema: z.object({
        level: z.number().min(-0.35).max(0.7).describe('Target deck height.'),
      }),
    },
    async ({ level }) => after(await session.setHeight(level)),
  );

  server.registerTool(
    'drive',
    {
      title: 'Drive raw inputs',
      description:
        'Hold raw controls for a fixed duration. This is the open-loop escape hatch: ' +
        'throttle -1..1, turn -1..1, lift -1..1, boost 0 or 1. Use it for improvised ' +
        `maneuvers that the goal-based tools cannot express. ${FRAME}`,
      inputSchema: z.object({
        seconds: z.number().min(0).max(10).describe('How long to hold the controls.'),
        throttle: z.number().min(-1).max(1).optional(),
        turn: z.number().min(-1).max(1).optional(),
        lift: z.number().min(-1).max(1).optional(),
        boost: z.number().min(0).max(1).optional(),
      }),
    },
    async ({ seconds, throttle, turn, lift, boost }) =>
      after(await session.drive(seconds, { throttle, turn, lift, boost })),
  );

  server.registerTool(
    'wait',
    {
      title: 'Wait',
      description: `Let time pass without acting, then report the new state. ${FRAME}`,
      inputSchema: z.object({
        seconds: z.number().min(0).max(10).describe('How long to wait.'),
      }),
    },
    async ({ seconds }) => after(await session.wait(seconds)),
  );

  server.registerTool(
    'plant_apple',
    {
      title: 'Plant an apple',
      description:
        'Place another apple in the world at a world coordinate. Useful when the current goal ' +
        `needs a fresh target. ${FRAME}`,
      inputSchema: z.object({
        x: z.number().describe('World x in units.'),
        z: z.number().describe('World z in units.'),
      }),
    },
    async ({ x, z }) => {
      const entity = session.addEntity('apple', x, z);
      return text({ planted: entity, observation: session.observe() });
    },
  );

  return server;
}
