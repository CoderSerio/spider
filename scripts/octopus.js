import * as THREE from '../lib/three.module.js';

const PAPER = 0xf3efe6;
const INK = 0x1b1714;

const UP = new THREE.Vector3(0, 1, 0);
const SEGMENTS = 28;
const FOOT_Y = 0.16;
const HEIGHT_MIN = -0.42;
const HEIGHT_MAX = 0.95;

// One flat deck. Six sockets sit on that plane, 60° apart, so the
// tentacles leave in different directions instead of stacking.
const DECK_Y = 1.16;
// phase is the only gait state. Diagonals share a beat, so a foot cannot stick.
const MOUNTS = [
  { x: -0.39, y: DECK_Y, z: -0.68, side: -1, fore: 2.05, lateral: 1.18, phase: 0, reach: 2.45, flare: 0.12, lift: 1 },
  { x: 0.39, y: DECK_Y, z: -0.68, side: 1, fore: 2.05, lateral: 1.18, phase: 0.66, reach: 2.45, flare: 0.12, lift: 1 },
  { x: -0.39, y: DECK_Y, z: 0.68, side: -1, fore: -1.85, lateral: 1.08, phase: 0.66, reach: 2.35, flare: 0.12, lift: 1 },
  { x: 0.39, y: DECK_Y, z: 0.68, side: 1, fore: -1.85, lateral: 1.08, phase: 0, reach: 2.35, flare: 0.12, lift: 1 },
  { x: -0.78, y: DECK_Y, z: 0, side: -1, fore: 0.12, lateral: 2.35, phase: 0.33, reach: 2.3, flare: 0.16, lift: 1 },
  { x: 0.78, y: DECK_Y, z: 0, side: 1, fore: -0.12, lateral: 2.35, phase: 0.33, reach: 2.3, flare: 0.16, lift: 1 },
];
const SWING = 0.28;

// Unit cylinder along local −Z, from z = 0 to z = −1. Thicker at the root.
const tubeGeo = new THREE.CylinderGeometry(0.9, 1, 1, 8);
tubeGeo.rotateX(-Math.PI / 2);
tubeGeo.translate(0, 0, -0.5);
const tubeEdges = new THREE.EdgesGeometry(tubeGeo, 18);

const ridgeGeo = new THREE.BoxGeometry(0.26, 0.2, 0.58);
ridgeGeo.translate(0, 1.14, -0.5);
const ridgeEdges = new THREE.EdgesGeometry(ridgeGeo, 1);

const collarGeo = new THREE.TorusGeometry(1, 0.2, 6, 14);
const collarEdges = new THREE.EdgesGeometry(collarGeo, 16);

const hubGeo = new THREE.CylinderGeometry(0.09, 0.12, 0.3, 8);
hubGeo.rotateX(Math.PI / 2);
hubGeo.translate(0, 0, 0.06);
const hubEdges = new THREE.EdgesGeometry(hubGeo, 16);
const yokeGeo = new THREE.BoxGeometry(0.1, 0.07, 0.08);
yokeGeo.translate(0, 0.05, -0.02);
const yokeEdges = new THREE.EdgesGeometry(yokeGeo, 1);
const axleGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.14, 6);
axleGeo.rotateZ(Math.PI / 2);
const axleEdges = new THREE.EdgesGeometry(axleGeo, 12);
const proxGeo = new THREE.BoxGeometry(0.055, 0.05, 0.3);
proxGeo.translate(0, 0, -0.15);
const proxEdges = new THREE.EdgesGeometry(proxGeo, 1);
const distGeo = new THREE.BoxGeometry(0.042, 0.038, 0.34);
distGeo.translate(0, 0, -0.17);
const distEdges = new THREE.EdgesGeometry(distGeo, 1);
const tipGeo = new THREE.CylinderGeometry(0.008, 0.032, 0.32, 5);
tipGeo.rotateX(-Math.PI / 2);
tipGeo.translate(0, 0, -0.16);
const tipEdges = new THREE.EdgesGeometry(tipGeo, 12);
const knuckleGeo = new THREE.SphereGeometry(0.058, 7, 6);
const knuckleEdges = new THREE.EdgesGeometry(knuckleGeo, 14);

const washerGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.035, 8);
const washerEdges = new THREE.EdgesGeometry(washerGeo, 12);
const ballGeo = new THREE.SphereGeometry(0.072, 8, 6);
const ballEdges = new THREE.EdgesGeometry(ballGeo, 16);

export function createWalker() {
  const paper = new THREE.MeshBasicMaterial({
    color: PAPER,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  const ink = new THREE.LineBasicMaterial({ color: INK });

  const root = new THREE.Group();
  const chassis = new THREE.Group();
  root.add(chassis);
  buildBody(chassis, paper, ink);

  const rig = new THREE.Group();
  const arms = MOUNTS.map((mount, index) => buildArm(rig, paper, ink, mount, index));

  const walker = {
    root,
    chassis,
    rig,
    arms,
    yaw: 0,
    yawRate: 0,
    headYaw: 0,
    heightSet: 0,
    time: 0,
    head: chassis.getObjectByName('head'),
    lens: chassis.getObjectByName('lens'),
    stern: chassis.getObjectByName('stern'),
  };
  stepWalker(walker, 0, { throttle: 0, strafe: 0, turn: 0, lift: 0 });
  return walker;
}

function addSolid(parent, geo, ink, paper, x, y, z, rx = 0, ry = 0) {
  const mesh = new THREE.Mesh(geo, paper);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, 0);
  mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 18), ink));
  parent.add(mesh);
  return mesh;
}

function buildBody(chassis, paper, ink) {
  const solid = (geo, x, y, z, rx = 0, ry = 0) => addSolid(chassis, geo, ink, paper, x, y, z, rx, ry);
  const shell = (sx, sy, sz, x, y, z) => {
    const geo = new THREE.SphereGeometry(1, 12, 8);
    geo.scale(sx, sy, sz);
    return solid(geo, x, y, z);
  };

  // Cephalothorax in front, abdomen behind, legs stay on the front shell.
  shell(0.92, 0.26, 0.7, 0, DECK_Y, -0.08);
  solid(new THREE.BoxGeometry(0.55, 0.04, 0.9), 0, DECK_Y + 0.22, -0.1);
  const waist = new THREE.CylinderGeometry(0.16, 0.18, 0.28, 8);
  waist.rotateX(Math.PI / 2);
  solid(waist, 0, DECK_Y + 0.02, 0.58);
  shell(0.62, 0.42, 0.78, 0, DECK_Y + 0.1, 1.32);

  const head = new THREE.Group();
  head.name = 'head';
  head.position.set(0, DECK_Y + 0.04, -0.7);
  chassis.add(head);
  const eye = (x, y, z, r) => {
    const geo = new THREE.CylinderGeometry(r, r, 0.06, 8);
    geo.rotateX(Math.PI / 2);
    return addSolid(head, geo, ink, paper, x, y, z);
  };
  eye(-0.16, 0.06, 0, 0.045);
  eye(0.16, 0.06, 0, 0.045);
  eye(-0.08, -0.04, -0.02, 0.03);
  const lens = eye(0.08, -0.04, -0.02, 0.03);
  lens.name = 'lens';

  const stern = new THREE.Object3D();
  stern.name = 'stern';
  stern.position.set(0, DECK_Y + 0.1, 2.02);
  chassis.add(stern);

  for (let i = 0; i < MOUNTS.length; i++) {
    const mount = MOUNTS[i];
    const washer = new THREE.Mesh(washerGeo, paper);
    washer.position.set(mount.x, mount.y - 0.02, mount.z);
    washer.add(new THREE.LineSegments(washerEdges, ink));
    chassis.add(washer);

    const ball = new THREE.Mesh(ballGeo, paper);
    ball.position.set(mount.x, mount.y + 0.04, mount.z);
    ball.add(new THREE.LineSegments(ballEdges, ink));
    chassis.add(ball);

    const anchor = new THREE.Object3D();
    anchor.name = `mount-${i}`;
    anchor.position.set(mount.x, mount.y + 0.04, mount.z);
    chassis.add(anchor);
  }
}

function buildArm(rig, paper, ink, mount, index) {
  const links = [];
  const collars = [];
  for (let i = 0; i < SEGMENTS; i++) {
    const link = new THREE.Group();
    const mesh = new THREE.Mesh(tubeGeo, paper);
    mesh.add(new THREE.LineSegments(tubeEdges, ink));
    link.add(mesh);
    const ridge = new THREE.Mesh(ridgeGeo, paper);
    ridge.add(new THREE.LineSegments(ridgeEdges, ink));
    link.add(ridge);
    rig.add(link);
    links.push(link);

    const collar = new THREE.Group();
    const ring = new THREE.Mesh(collarGeo, paper);
    ring.add(new THREE.LineSegments(collarEdges, ink));
    collar.add(ring);
    rig.add(collar);
    collars.push(collar);
  }

  const claw = new THREE.Group();
  const hub = new THREE.Mesh(hubGeo, paper);
  hub.add(new THREE.LineSegments(hubEdges, ink));
  claw.add(hub);

  const digits = [];
  for (let i = 0; i < 3; i++) {
    const swivel = new THREE.Group();
    swivel.rotation.z = (i / 3) * Math.PI * 2;
    swivel.position.z = -0.06;
    const yoke = new THREE.Mesh(yokeGeo, paper);
    yoke.add(new THREE.LineSegments(yokeEdges, ink));
    swivel.add(yoke);
    const axle = new THREE.Mesh(axleGeo, paper);
    axle.add(new THREE.LineSegments(axleEdges, ink));
    swivel.add(axle);

    const proximal = new THREE.Group();
    const blade = new THREE.Mesh(proxGeo, paper);
    blade.add(new THREE.LineSegments(proxEdges, ink));
    proximal.add(blade);
    swivel.add(proximal);

    const mid = new THREE.Group();
    mid.position.z = -0.3;
    const knuckle = new THREE.Mesh(knuckleGeo, paper);
    knuckle.add(new THREE.LineSegments(knuckleEdges, ink));
    mid.add(knuckle);
    const phalanx = new THREE.Mesh(distGeo, paper);
    phalanx.add(new THREE.LineSegments(distEdges, ink));
    mid.add(phalanx);

    const hook = new THREE.Group();
    hook.position.z = -0.34;
    const talon = new THREE.Mesh(tipGeo, paper);
    talon.add(new THREE.LineSegments(tipEdges, ink));
    hook.add(talon);
    mid.add(hook);

    claw.add(swivel);
    digits.push({ proximal, mid, hook });
  }
  rig.add(claw);

  const hosePositions = new Float32Array((SEGMENTS + 1) * 3);
  const hoseGeo = new THREE.BufferGeometry();
  hoseGeo.setAttribute('position', new THREE.BufferAttribute(hosePositions, 3));
  rig.add(new THREE.Line(hoseGeo, ink));

  return {
    index,
    mount,
    links,
    collars,
    claw,
    digits,
    hosePositions,
    hoseGeo,
    plant: new THREE.Vector3(),
    swingFrom: new THREE.Vector3(),
    swingTo: new THREE.Vector3(),
    foot: new THREE.Vector3(),
    swingFrom: new THREE.Vector3(),
    swingTo: new THREE.Vector3(),
    lifted: false,
    points: Array.from({ length: 9 }, () => new THREE.Vector3()),
    samples: Array.from({ length: SEGMENTS + 1 }, () => new THREE.Vector3()),
    curve: null,
  };
}

const worldFwd = new THREE.Vector3();
const worldRight = new THREE.Vector3();
const supportW = new THREE.Vector3();
const offsetW = new THREE.Vector3();
const shoulderW = new THREE.Vector3();
const sideW = new THREE.Vector3();
const reachW = new THREE.Vector3();
const axisX = new THREE.Vector3();
const axisY = new THREE.Vector3();
const axisZ = new THREE.Vector3();
const transport = new THREE.Vector3();
const basisM = new THREE.Matrix4();

export function stepWalker(walker, dt, control) {
  const throttle = control.throttle || 0;
  const turn = control.turn || 0;
  const lift = control.lift || 0;
  const boost = control.boost ? 1 : 0;

  walker.root.rotation.y = walker.yaw;
  walker.root.updateMatrixWorld(true);
  worldFwd.set(0, 0, -1).applyQuaternion(walker.root.quaternion);
  worldRight.crossVectors(worldFwd, UP).normalize();
  if (!walker.seeded) seedFeet(walker);

  if (dt <= 0) {
    poseAll(walker);
    return;
  }

  walker.time += dt;
  const yawTarget = turn * (boost ? 2.1 : 1.5);
  walker.yawRate += THREE.MathUtils.clamp(yawTarget - walker.yawRate, -6 * dt, 6 * dt);
  walker.yaw -= walker.yawRate * dt;
  walker.root.rotation.y = walker.yaw;
  walker.headYaw += (-turn * 0.78 - walker.headYaw) * (1 - Math.exp(-10 * dt));
  walker.head.rotation.y = walker.headYaw;

  walker.heightSet = THREE.MathUtils.clamp(walker.heightSet + lift * 0.62 * dt, HEIGHT_MIN, HEIGHT_MAX);
  walker.root.position.y += (walker.heightSet - walker.root.position.y) * Math.min(1, 6 * dt);
  walker.chassis.rotation.x = -throttle * 0.06;
  walker.chassis.rotation.z = walker.yawRate * 0.05;

  worldFwd.set(0, 0, -1).applyQuaternion(walker.root.quaternion);
  worldRight.crossVectors(worldFwd, UP).normalize();

  const moving = Math.abs(throttle) + Math.abs(turn) > 0.05;
  const freq = moving ? (boost ? 2.5 : 1.7) : 0;
  const stride = throttle * (boost ? 1.15 : 0.72);
  for (const arm of walker.arms) {
    const phase = freq === 0 ? 0.5 : (walker.time * freq + arm.mount.phase) % 1;
    const swing = phase < SWING;
    if (swing && !arm.lifted) {
      arm.swingFrom.copy(arm.plant);
      idealFoot(arm.swingTo, arm, worldFwd, worldRight, walker.root.position, stride);
    }
    if (swing) {
      const u = phase / SWING;
      const e = u * u * (3 - 2 * u);
      arm.foot.lerpVectors(arm.swingFrom, arm.swingTo, e);
      arm.foot.y = FOOT_Y + Math.sin(Math.PI * u) * 0.55;
    } else if (arm.lifted) {
      arm.plant.copy(arm.swingTo);
      arm.foot.copy(arm.plant);
    } else {
      arm.foot.copy(arm.plant);
    }
    arm.lifted = swing;
  }

  let planted = 0;
  supportW.set(0, 0, 0);
  for (const arm of walker.arms) {
    if (arm.lifted) continue;
    offsetW.set(arm.mount.side * arm.mount.lateral, 0, -arm.mount.fore);
    offsetW.applyQuaternion(walker.root.quaternion);
    supportW.add(arm.plant).sub(offsetW);
    planted += 1;
  }
  if (planted > 0) {
    supportW.multiplyScalar(1 / planted);
    const blend = Math.min(1, 8 * dt);
    walker.root.position.x += (supportW.x - walker.root.position.x) * blend;
    walker.root.position.z += (supportW.z - walker.root.position.z) * blend;
  }

  poseAll(walker);
}

function seedFeet(walker) {
  for (const arm of walker.arms) {
    idealFoot(arm.plant, arm, worldFwd, worldRight, walker.root.position, 0);
    arm.foot.copy(arm.plant);
    arm.swingFrom.copy(arm.plant);
    arm.swingTo.copy(arm.plant);
    arm.lifted = false;
  }
  walker.seeded = true;
}

function idealFoot(out, arm, fwd, right, origin, stride) {
  out.copy(origin);
  out.addScaledVector(fwd, arm.mount.fore + stride);
  out.addScaledVector(right, arm.mount.side * arm.mount.lateral);
  out.y = FOOT_Y;
}

function poseAll(walker) {
  for (const arm of walker.arms) poseArm(walker, arm, !arm.lifted);
}

function poseArm(walker, arm, planted) {
  const mount = walker.chassis.getObjectByName(`mount-${arm.index}`);
  mount.getWorldPosition(shoulderW);
  // Bow along this leg's own radial, not the body's side axis, so neighbors
  // on the flat deck do not share one vertical plane.
  sideW.subVectors(arm.foot, shoulderW);
  sideW.y = 0;
  if (sideW.lengthSq() < 1e-4) sideW.set(arm.mount.x, 0, arm.mount.z);
  sideW.normalize();

  const p = arm.points;
  if (!arm.curve) arm.curve = new THREE.CatmullRomCurve3(p, false, 'centripetal');

  let bow = 1.7;
  const chord = Math.max(0.3, shoulderW.distanceTo(arm.foot));
  const goal = Math.max(arm.mount.reach, chord + 0.4);
  for (let k = 0; k < 5; k++) {
    layoutArch(p, shoulderW, arm.foot, sideW, bow, arm.mount);
    arm.curve.updateArcLengths();
    const len = arm.curve.getLength();
    if (len < 0.05) break;
    const next = THREE.MathUtils.clamp(bow * THREE.MathUtils.clamp(goal / len, 0.55, 1.55), 0.4, 2.6);
    if (Math.abs(next - bow) < 0.02) {
      bow = next;
      break;
    }
    bow = next;
  }
  layoutArch(p, shoulderW, arm.foot, sideW, bow, arm.mount);
  arm.curve.updateArcLengths();
  const span = arm.curve.getLength();
  for (let i = 0; i <= SEGMENTS; i++) {
    if (span > 0.05) arm.curve.getPointAt(i / SEGMENTS, arm.samples[i]);
    else arm.samples[i].lerpVectors(shoulderW, arm.foot, i / SEGMENTS);
  }

  // Seed the transport with the body's lateral axis so the ridge stays
  // continuous when the tentacle passes through vertical.
  transport.copy(sideW);

  for (let i = 0; i < SEGMENTS; i++) {
    const a = arm.samples[i];
    const b = arm.samples[i + 1];
    reachW.subVectors(b, a);
    const dist = Math.max(0.04, reachW.length());
    reachW.multiplyScalar(1 / dist);

    // Local −Z follows the tentacle. local +Z is the opposite direction.
    axisZ.copy(reachW).negate();
    axisX.copy(transport).addScaledVector(axisZ, -transport.dot(axisZ));
    if (axisX.lengthSq() < 1e-8) {
      axisX.set(0, 1, 0).addScaledVector(axisZ, -axisZ.y);
      if (axisX.lengthSq() < 1e-8) axisX.set(1, 0, 0);
    }
    axisX.normalize();
    axisY.crossVectors(axisZ, axisX).normalize();
    transport.copy(axisX);
    basisM.makeBasis(axisX, axisY, axisZ);

    const t = i / (SEGMENTS - 1);
    const radius = THREE.MathUtils.lerp(0.14, 0.03, Math.pow(t, 0.62));
    const link = arm.links[i];
    link.position.copy(a);
    link.quaternion.setFromRotationMatrix(basisM);
    const distal = t > 0.45 && i !== SEGMENTS - 1;
    link.scale.set(radius, radius, dist * (distal ? 0.64 : 0.94));

    const collar = arm.collars[i];
    const motor = i % 3 === 0;
    collar.position.copy(a);
    collar.quaternion.copy(link.quaternion);
    collar.scale.setScalar(radius * (motor ? 1.55 : distal ? 1.38 : 1.16));
    collar.visible = i !== SEGMENTS - 1;

    const hose = arm.hosePositions;
    const hoseR = radius * 1.55;
    hose[i * 3] = a.x + axisX.x * hoseR;
    hose[i * 3 + 1] = a.y + axisX.y * hoseR;
    hose[i * 3 + 2] = a.z + axisX.z * hoseR;
    if (i === SEGMENTS - 1) {
      hose[(i + 1) * 3] = b.x + axisX.x * hoseR;
      hose[(i + 1) * 3 + 1] = b.y + axisX.y * hoseR;
      hose[(i + 1) * 3 + 2] = b.z + axisX.z * hoseR;
      arm.claw.position.copy(b);
      arm.claw.quaternion.copy(link.quaternion);
      const spread = planted ? 0.62 : 1.15;
      const curl = planted ? 1.2 : 0.7;
      for (const digit of arm.digits) {
        digit.proximal.rotation.x = spread;
        digit.mid.rotation.x = curl;
        digit.mid.rotation.z = 0.45;
        digit.hook.rotation.x = 0.85;
      }
    }
  }
  arm.hoseGeo.attributes.position.needsUpdate = true;
  arm.hoseGeo.computeBoundingSphere();
}

function layoutArch(p, shoulder, foot, side, bow, mount) {
  // One round arch in this leg's own radial plane.
  const h = bow * mount.lift;
  const flare = 0.05 + mount.flare * 0.2;
  const ts = [0, 0.12, 0.28, 0.45, 0.62, 0.76, 0.88, 0.95, 1];
  for (let i = 0; i < ts.length; i++) {
    const t = ts[i];
    const hump = Math.sin(Math.PI * t);
    p[i].lerpVectors(shoulder, foot, t);
    p[i].addScaledVector(UP, h * hump);
    p[i].addScaledVector(side, flare * hump);
  }
}

export function bodyForward(walker, out) {
  return out.set(0, 0, -1).applyQuaternion(walker.root.quaternion);
}
