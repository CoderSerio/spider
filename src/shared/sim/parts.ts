import {
  BoxGeometry,
  CylinderGeometry,
  EdgesGeometry,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  type BufferGeometry,
  type Object3D,
} from 'three';
import { PALETTE } from '../config.js';

// Every part of the model shares these materials and primitives.

export const paperMat = new MeshBasicMaterial({
  color: PALETTE.paper,
  polygonOffset: true,
  polygonOffsetFactor: 1,
  polygonOffsetUnits: 1,
});

export const inkMat = new LineBasicMaterial({ color: PALETTE.ink });

export const tubeGeo = new CylinderGeometry(0.85, 1, 1, 6);
tubeGeo.rotateX(-Math.PI / 2);
tubeGeo.translate(0, 0, -0.5);
export const tubeEdges = new EdgesGeometry(tubeGeo, 12);

export const ballGeo = new SphereGeometry(1, 8, 6);
export const ballEdges = new EdgesGeometry(ballGeo, 14);

export const clawGeo = new BoxGeometry(0.045, 0.03, 0.22);
clawGeo.translate(0.04, 0, -0.1);
export const clawEdges = new EdgesGeometry(clawGeo, 1);

/** A paper-filled solid with its own ink edges. */
export function addSolid(
  parent: Object3D,
  geo: BufferGeometry,
  x: number,
  y: number,
  z: number,
  rx = 0,
  ry = 0,
): Mesh {
  const mesh = new Mesh(geo, paperMat);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, 0);
  mesh.add(new LineSegments(new EdgesGeometry(geo, 18), inkMat));
  parent.add(mesh);
  return mesh;
}
