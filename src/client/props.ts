import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  EdgesGeometry,
  Group,
  LineSegments,
  Mesh,
  SphereGeometry,
} from 'three';
import { inkMat, paperMat } from '../shared/sim/parts.js';

const APPLE_RADIUS = 0.34;

/** Line-art prop. Apple origin is the center. Chair origin is the feet. */
export function buildProp(kind: string, stage: number): Group | null {
  if (kind === 'apple') return buildApple(stage);
  if (kind === 'chair') return buildChair();
  return null;
}

function buildApple(stage: number): Group {
  const apple = new Group();
  const bite = stage <= 0 ? 0 : stage === 1 ? 0.34 : 0.68;
  const body = new Mesh(bittenSphere(bite), paperMat);
  body.add(new LineSegments(new EdgesGeometry(body.geometry, 12), inkMat));
  apple.add(body);

  const stem = new Mesh(new CylinderGeometry(0.028, 0.022, 0.2, 6), paperMat);
  stem.position.set(0.02, APPLE_RADIUS + 0.06, 0);
  stem.rotation.z = 0.18;
  stem.add(new LineSegments(new EdgesGeometry(stem.geometry, 12), inkMat));
  apple.add(stem);
  return apple;
}

/** Flatten one side. amount 0 is whole, 1 would shave the whole radius. */
function bittenSphere(amount: number): BufferGeometry {
  const geo = new SphereGeometry(APPLE_RADIUS, 14, 10);
  if (amount <= 0) return geo;
  const position = geo.getAttribute('position');
  const cut = APPLE_RADIUS * (1 - amount);
  for (let i = 0; i < position.count; i++) {
    if (position.getX(i) > cut) position.setX(i, cut);
  }
  geo.computeVertexNormals();
  return geo;
}

function buildChair(): Group {
  const chair = new Group();
  const solid = (geo: BufferGeometry, x: number, y: number, z: number) => {
    const mesh = new Mesh(geo, paperMat);
    mesh.position.set(x, y, z);
    mesh.add(new LineSegments(new EdgesGeometry(geo, 1), inkMat));
    chair.add(mesh);
  };

  solid(new BoxGeometry(0.62, 0.06, 0.56), 0, 0.46, 0);
  solid(new BoxGeometry(0.62, 0.5, 0.05), 0, 0.74, 0.25);
  const leg = new CylinderGeometry(0.035, 0.03, 0.44, 6);
  for (const [x, z] of [
    [-0.24, -0.2],
    [0.24, -0.2],
    [-0.24, 0.2],
    [0.24, 0.2],
  ] as const) {
    solid(leg, x, 0.22, z);
  }
  return chair;
}
