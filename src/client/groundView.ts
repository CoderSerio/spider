import {
  BufferGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  PlaneGeometry,
  Vector3,
} from 'three';
import { PALETTE } from '../shared/config.js';
import { paperMat } from '../shared/sim/parts.js';
import { TERRAIN } from '../shared/terrain.js';

const LINE_STEP = 2;

/** Paper island with ink grid lines draped over the same height function. */
export function buildIsland(height: (x: number, z: number) => number): Group {
  const group = new Group();
  const geo = groundGeometry(height, TERRAIN.half, TERRAIN.segments);
  group.add(new Mesh(geo, paperMat));

  const ink = new LineBasicMaterial({ color: PALETTE.grid });
  const points: Vector3[] = [];
  const half = TERRAIN.half;
  for (let x = -half; x <= half; x += LINE_STEP) {
    for (let z = -half; z < half; z += LINE_STEP) {
      points.push(new Vector3(x, height(x, z) + 0.02, z));
      points.push(new Vector3(x, height(x, z + LINE_STEP) + 0.02, z + LINE_STEP));
    }
  }
  for (let z = -half; z <= half; z += LINE_STEP) {
    for (let x = -half; x < half; x += LINE_STEP) {
      points.push(new Vector3(x, height(x, z) + 0.02, z));
      points.push(new Vector3(x + LINE_STEP, height(x + LINE_STEP, z) + 0.02, z));
    }
  }
  group.add(new LineSegments(new BufferGeometry().setFromPoints(points), ink));
  return group;
}

/** Plane in the x/z ground, displaced by `height`. The normal faces up. */
export function groundGeometry(
  height: (x: number, z: number) => number,
  half: number,
  segments: number,
): BufferGeometry {
  const geo = new PlaneGeometry(half * 2, half * 2, segments, segments);
  // PlaneGeometry faces +z in the xy plane. -90° about x lays it on xz facing +y.
  geo.rotateX(-Math.PI / 2);
  const position = geo.getAttribute('position');
  for (let i = 0; i < position.count; i++) {
    position.setY(i, height(position.getX(i), position.getZ(i)));
  }
  geo.computeVertexNormals();
  return geo;
}
