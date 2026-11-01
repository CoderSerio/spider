import { GAIT } from './config.js';
import { blockAt, insideHome } from './sight.js';
import type { Block } from './state.js';

/** How far a look along the heading bothers to check. */
const AHEAD = 8;
const STEP = 0.25;
/** Solids reported around the body. */
const NEAR = 6;

export interface Ahead {
  /** Meters you can still walk along your heading. 0 means you are against it. */
  open: number;
  /** clear: nothing in that stretch. wall: a solid. slope: the ground rises too fast. */
  by: 'clear' | 'wall' | 'slope';
  /** The solid's id, when by is wall. */
  id: string | null;
  kind: 'nest' | 'building' | null;
}

export interface NearbySolid {
  id: string;
  kind: 'nest' | 'building';
  /** Distance from you to the nearest point of it. */
  distance: number;
  /** Degrees off your heading, clockwise positive. 0 is straight ahead. */
  bearing: number;
}

const round = (value: number, places = 2): number => {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
};

function kindOfBlock(id: string): 'nest' | 'building' {
  return id.startsWith('nest') ? 'nest' : 'building';
}

interface Probe {
  open: number;
  by: 'clear' | 'wall' | 'slope';
  id: string | null;
  kind: 'nest' | 'building' | null;
}

/** Heading 0 faces world -Z. Clockwise is positive, matching the body's turn. */
function probe(
  x: number,
  z: number,
  heading: number,
  height: (x: number, z: number) => number,
  blocks: readonly Block[],
): Probe {
  const rad = (heading * Math.PI) / 180;
  const fx = Math.sin(rad);
  const fz = -Math.cos(rad);
  let previous = height(x, z);
  for (let traveled = STEP; traveled <= AHEAD + 1e-6; traveled += STEP) {
    const nx = x + fx * traveled;
    const nz = z + fz * traveled;
    const ground = height(nx, nz);
    const hit = blockAt(nx, nz, blocks);
    if (hit) return { open: round(traveled), by: 'wall', id: hit.id, kind: kindOfBlock(hit.id) };
    if (ground - previous > GAIT.maxSlope * STEP) return { open: round(traveled), by: 'slope', id: null, kind: null };
    previous = ground;
  }
  return { open: AHEAD, by: 'clear', id: null, kind: null };
}

function wrap(degrees: number): number {
  const wrapped = (((degrees + 180) % 360) + 360) % 360 - 180;
  return wrapped === -180 ? 180 : wrapped;
}

function meters(value: number): string {
  const text = round(value, 1).toFixed(1);
  return text.endsWith('.0') ? text.slice(0, -2) : text;
}

/** Sentences the agent can follow: which way is walkable, and how far. */
function waysFrom(x: number, z: number, heading: number, height: (x: number, z: number) => number, blocks: readonly Block[]): string[] {
  const samples = [];
  for (let step = 0; step < 24; step++) {
    const absolute = step * 15;
    const seen = probe(x, z, absolute, height, blocks);
    samples.push({ bearing: wrap(absolute - heading), open: seen.open });
  }
  const forward = samples.reduce((a, b) => (Math.abs(a.bearing) < Math.abs(b.bearing) ? a : b));
  const line = (sample: { bearing: number; open: number }) =>
    Math.abs(sample.bearing) < 12
      ? `正前方可以走 ${meters(sample.open)} 米。`
      : `相对朝向转 ${Math.round(sample.bearing)} 度（正数顺时针）后，可以走 ${meters(sample.open)} 米。`;
  const alternatives = samples
    .filter((sample) => sample.open >= Math.max(2.5, forward.open + 1.5) && Math.abs(sample.bearing) >= 40)
    .sort((a, b) => b.open - a.open || Math.abs(a.bearing) - Math.abs(b.bearing));
  const picked: { bearing: number; open: number }[] = [];
  for (const sample of alternatives) {
    if (picked.every((other) => Math.abs(wrap(sample.bearing - other.bearing)) >= 40)) picked.push(sample);
    if (picked.length === 2) break;
  }
  if (forward.open >= 2.5) return [line(forward), ...picked.map(line)];
  if (picked.length > 0) return picked.map(line);
  const best = samples.reduce((a, b) => (b.open > a.open ? b : a));
  return [`周围都不远。${line(best)}`];
}

/** The nest mouth, from the two south wall blocks. Inside face, then outside face. */
function nestMouth(blocks: readonly Block[]): { x: number; innerZ: number; outerZ: number } | null {
  const south = blocks.filter((block) => block.id.startsWith('nest-s'));
  if (south.length < 2) return null;
  const west = Math.max(...south.map((block) => block.maxX).filter((edge) => edge < 0));
  const east = Math.min(...south.map((block) => block.minX).filter((edge) => edge > 0));
  if (!Number.isFinite(west) || !Number.isFinite(east)) return null;
  return {
    x: (west + east) / 2,
    innerZ: Math.max(...south.map((block) => block.maxZ)),
    outerZ: Math.min(...south.map((block) => block.minZ)),
  };
}

function bearingTo(x: number, z: number, tx: number, tz: number, heading: number): number {
  return wrap((Math.atan2(tx - x, -(tz - z)) * 180) / Math.PI - heading);
}

/** Where the nest mouth is, as a sentence, when you are in it or beside it. */
function nearingMouth(x: number, z: number, heading: number, blocks: readonly Block[]): string | null {
  const mouth = nestMouth(blocks);
  if (!mouth) return null;
  if (insideHome(x, z)) {
    const distance = Math.hypot(x - mouth.x, z - mouth.innerZ);
    const bearing = Math.round(bearingTo(x, z, mouth.x, mouth.innerZ, heading));
    if (distance < 1.1 && Math.abs(bearing) < 35) return `你正在出巢，再向前约 ${meters(distance)} 米就到门外。`;
    if (distance < 1.1) return `你就在巢的出口旁边，约 ${meters(distance)} 米，相对朝向 ${bearing} 度。转过去往前是出去。`;
    return `你在巢里。出口约 ${meters(distance)} 米，相对朝向 ${bearing} 度（正数顺时针）。朝出口转，再往前就能出去。`;
  }
  const distance = Math.hypot(x - mouth.x, z - mouth.outerZ);
  if (distance > 4) return null;
  const bearing = Math.round(bearingTo(x, z, mouth.x, mouth.outerZ, heading));
  if (distance < 1.2 && Math.abs(bearing) < 35) return `你正在进巢，再向前约 ${meters(distance)} 米就进门。`;
  return `你在巢外，靠近入口。入口约 ${meters(distance)} 米，相对朝向 ${bearing} 度（正数顺时针）。`;
}

/**
 * What is in front of the body, which solids stand nearby, and the sentences
 * that say which way is walkable and whether the nest mouth is close.
 * Forward matches the spider: yaw 0 faces world -Z.
 */
export function senseBody(
  x: number,
  z: number,
  _yaw: number,
  heading: number,
  height: (x: number, z: number) => number,
  blocks: readonly Block[],
): { ahead: Ahead; nearby: NearbySolid[]; ways: string[]; nearing: string | null } {
  const facing = probe(x, z, heading, height, blocks);
  let ahead: Ahead = facing;
  const here = blockAt(x, z, blocks);
  if (here) ahead = { open: 0, by: 'wall', id: here.id, kind: kindOfBlock(here.id) };

  const nearby: NearbySolid[] = [];
  for (const block of blocks) {
    const cx = Math.min(block.maxX, Math.max(block.minX, x));
    const cz = Math.min(block.maxZ, Math.max(block.minZ, z));
    const distance = Math.hypot(x - cx, z - cz);
    if (distance > NEAR) continue;
    const bearing = (((Math.atan2(cx - x, -(cz - z)) * 180) / Math.PI - heading + 540) % 360) - 180;
    nearby.push({
      id: block.id,
      kind: kindOfBlock(block.id),
      distance: round(distance),
      bearing: round(bearing, 1),
    });
  }
  nearby.sort((a, b) => a.distance - b.distance);

  const nearing = nearingMouth(x, z, heading, blocks);
  let ways = waysFrom(x, z, heading, height, blocks);
  if (nearing?.includes('再向前')) ways = ways.filter((line) => line.startsWith('正前方'));
  return { ahead, nearby: nearby.slice(0, 8), ways, nearing };
}
