import * as THREE from '../lib/three.module.js';

// Mechanical spider: a cephalothorax on eight jointed legs, an abdomen hung
// behind it, and an alternating tetrapod gait. Paper fills, ink edges.
const PAPER = 0xf3efe6;
const INK = 0x1b1714;

const UP = new THREE.Vector3(0, 1, 0);
const FOOT_Y = 0.16;
const HEIGHT_MIN = -0.35;
const HEIGHT_MAX = 0.7;
const DECK_Y = 0.78;
const SWING = 0.42;

// Eight legs on the cephalothorax. Same phase lifts one tetrapod.
const MOUNTS = [
  { x: -0.22, y: DECK_Y, z: -0.42, side: -1, fore: 1.55, lateral: 0.95, phase: 0 },
  { x: 0.22, y: DECK_Y, z: -0.42, side: 1, fore: 1.55, lateral: 0.95, phase: 0.5 },
  { x: -0.4, y: DECK_Y, z: -0.16, side: -1, fore: 0.55, lateral: 1.55, phase: 0.5 },
  { x: 0.4, y: DECK_Y, z: -0.16, side: 1, fore: 0.55, lateral: 1.55, phase: 0 },
  { x: -0.4, y: DECK_Y, z: 0.1, side: -1, fore: -0.25, lateral: 1.6, phase: 0 },
  { x: 0.4, y: DECK_Y, z: 0.1, side: 1, fore: -0.25, lateral: 1.6, phase: 0.5 },
  { x: -0.24, y: DECK_Y, z: 0.32, side: -1, fore: -1.05, lateral: 1.2, phase: 0.5 },
  { x: 0.24, y: DECK_Y, z: 0.32, side: 1, fore: -1.05, lateral: 1.2, phase: 0 },
];

const BONES = [
  { len: 0.34, radius: 0.07 },
  { len: 0.86, radius: 0.055 },
  { len: 0.98, radius: 0.04 },
  { len: 0.46, radius: 0.028 },
];

const tubeGeo = new THREE.CylinderGeometry(0.85, 1, 1, 6);
tubeGeo.rotateX(-Math.PI / 2);
tubeGeo.translate(0, 0, -0.5);
const tubeEdges = new THREE.EdgesGeometry(tubeGeo, 12);
const ballGeo = new THREE.SphereGeometry(1, 8, 6);
const ballEdges = new THREE.EdgesGeometry(ballGeo, 14);
const clawGeo = new THREE.BoxGeometry(0.045, 0.03, 0.22);
clawGeo.translate(0.04, 0, -0.1);
const clawEdges = new THREE.EdgesGeometry(clawGeo, 1);

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
  const legs = MOUNTS.map((mount, index) => buildLeg(rig, paper, ink, mount, index));

  const walker = {
    root,
    chassis,
    rig,
    legs,
    yaw: 0,
    yawRate: 0,
    headYaw: 0,
    heightSet: 0,
    speed: 0,
    time: 0,
    head: chassis.getObjectByName('head'),
    lens: chassis.getObjectByName('lens'),
    stern: chassis.getObjectByName('stern'),
  };
  stepWalker(walker, 0, { throttle: 0, turn: 0, lift: 0, boost: 0 });
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

  // Small cephalothorax, gap, then the abdomen. They do not share a volume.
  shell(0.55, 0.18, 0.46, 0, DECK_Y, -0.12);
  solid(new THREE.BoxGeometry(0.36, 0.03, 0.55), 0, DECK_Y + 0.16, -0.14);
  const waist = new THREE.CylinderGeometry(0.1, 0.12, 0.22, 8);
  waist.rotateX(Math.PI / 2);
  solid(waist, 0, DECK_Y, 0.42);
  shell(0.46, 0.32, 0.62, 0, DECK_Y + 0.06, 1.2);

  const head = new THREE.Group();
  head.name = 'head';
  head.position.set(0, DECK_Y + 0.02, -0.52);
  chassis.add(head);
  const eye = (x, y, r) => {
    const geo = new THREE.CylinderGeometry(r, r, 0.05, 8);
    geo.rotateX(Math.PI / 2);
    return addSolid(head, geo, ink, paper, x, y, 0);
  };
  eye(-0.1, 0.05, 0.035);
  eye(0.1, 0.05, 0.035);
  eye(-0.05, -0.02, 0.022);
  const lens = eye(0.05, -0.02, 0.022);
  lens.name = 'lens';

  const stern = new THREE.Object3D();
  stern.name = 'stern';
  stern.position.set(0, DECK_Y + 0.06, 1.78);
  chassis.add(stern);

  for (let i = 0; i < MOUNTS.length; i++) {
    const mount = MOUNTS[i];
    const ball = new THREE.Mesh(ballGeo, paper);
    ball.scale.setScalar(0.06);
    ball.position.set(mount.x, mount.y, mount.z);
    ball.add(new THREE.LineSegments(ballEdges, ink));
    chassis.add(ball);

    const anchor = new THREE.Object3D();
    anchor.name = `mount-${i}`;
    anchor.position.set(mount.x, mount.y, mount.z);
    chassis.add(anchor);
  }
}

function buildLeg(rig, paper, ink, mount, index) {
  const bones = BONES.map(() => {
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(tubeGeo, paper);
    mesh.add(new THREE.LineSegments(tubeEdges, ink));
    group.add(mesh);
    rig.add(group);
    return group;
  });
  const joints = BONES.map((bone) => {
    const joint = new THREE.Mesh(ballGeo, paper);
    joint.scale.setScalar(bone.radius * 1.35);
    joint.add(new THREE.LineSegments(ballEdges, ink));
    rig.add(joint);
    return joint;
  });
  const claw = new THREE.Group();
  for (const sign of [-1, 1]) {
    const mesh = new THREE.Mesh(clawGeo, paper);
    mesh.position.x = sign * 0.03;
    mesh.rotation.y = sign * 0.35;
    mesh.add(new THREE.LineSegments(clawEdges, ink));
    claw.add(mesh);
  }
  rig.add(claw);
  return {
    index,
    mount,
    bones,
    joints,
    claw,
    plant: new THREE.Vector3(),
    foot: new THREE.Vector3(),
    swingFrom: new THREE.Vector3(),
    swingTo: new THREE.Vector3(),
    lifted: false,
  };
}

const worldFwd = new THREE.Vector3();
const worldRight = new THREE.Vector3();
const shoulderW = new THREE.Vector3();
const dirW = new THREE.Vector3();
const coxaW = new THREE.Vector3();
const kneeW = new THREE.Vector3();
const ankleW = new THREE.Vector3();
const poleW = new THREE.Vector3();
const reachW = new THREE.Vector3();
const axisX = new THREE.Vector3();
const axisY = new THREE.Vector3();
const axisZ = new THREE.Vector3();
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
  const yawTarget = turn * (boost ? 2.1 : 1.45);
  walker.yawRate += THREE.MathUtils.clamp(yawTarget - walker.yawRate, -4 * dt, 4 * dt);
  walker.yaw -= walker.yawRate * dt;
  walker.root.rotation.y = walker.yaw;
  walker.headYaw += (-turn * 0.55 - walker.headYaw) * (1 - Math.exp(-8 * dt));
  walker.head.rotation.y = walker.headYaw;

  const cruise = boost ? 3.4 : 1.7;
  walker.speed += (throttle * cruise - walker.speed) * (1 - Math.exp(-3.2 * dt));
  worldFwd.set(0, 0, -1).applyQuaternion(walker.root.quaternion);
  worldRight.crossVectors(worldFwd, UP).normalize();
  walker.root.position.x += worldFwd.x * walker.speed * dt;
  walker.root.position.z += worldFwd.z * walker.speed * dt;

  walker.heightSet = THREE.MathUtils.clamp(walker.heightSet + lift * 0.5 * dt, HEIGHT_MIN, HEIGHT_MAX);
  walker.root.position.y += (walker.heightSet - walker.root.position.y) * Math.min(1, 5 * dt);
  walker.chassis.rotation.x = -throttle * 0.04;
  walker.chassis.rotation.z = walker.yawRate * 0.08;

  const moving = Math.abs(throttle) + Math.abs(turn) > 0.05 || Math.abs(walker.speed) > 0.08;
  const freq = moving ? (boost ? 1.65 : 1) : 0;
  const stride = freq > 0 ? walker.speed * (0.7 / freq) : 0;
  for (const leg of walker.legs) {
    if (freq === 0) {
      if (leg.lifted) leg.plant.copy(leg.foot);
      leg.foot.copy(leg.plant);
      leg.foot.y = FOOT_Y;
      leg.lifted = false;
      continue;
    }
    const phase = (walker.time * freq + leg.mount.phase) % 1;
    const swing = phase < SWING;
    if (swing && !leg.lifted) {
      leg.swingFrom.copy(leg.plant);
      idealFoot(leg.swingTo, leg, worldFwd, worldRight, walker.root.position, stride);
    }
    if (swing) {
      const u = phase / SWING;
      const e = u * u * (3 - 2 * u);
      leg.foot.lerpVectors(leg.swingFrom, leg.swingTo, e);
      leg.foot.y = FOOT_Y + Math.sin(Math.PI * u) * 0.28;
    } else if (leg.lifted) {
      leg.plant.copy(leg.swingTo);
      leg.foot.copy(leg.plant);
    } else {
      leg.foot.copy(leg.plant);
    }
    leg.lifted = swing;
  }

  poseAll(walker);
}

function seedFeet(walker) {
  for (const leg of walker.legs) {
    idealFoot(leg.plant, leg, worldFwd, worldRight, walker.root.position, 0);
    leg.foot.copy(leg.plant);
    leg.swingFrom.copy(leg.plant);
    leg.swingTo.copy(leg.plant);
    leg.lifted = false;
  }
  walker.seeded = true;
}

function idealFoot(out, leg, fwd, right, origin, stride) {
  out.copy(origin);
  out.addScaledVector(fwd, leg.mount.fore + stride);
  out.addScaledVector(right, leg.mount.side * leg.mount.lateral);
  out.y = FOOT_Y;
}

function poseAll(walker) {
  walker.root.updateMatrixWorld(true);
  for (const leg of walker.legs) poseLeg(walker, leg);
}

function poseLeg(walker, leg) {
  const mount = walker.chassis.getObjectByName(`mount-${leg.index}`);
  mount.getWorldPosition(shoulderW);
  dirW.subVectors(leg.foot, shoulderW);
  dirW.y = 0;
  if (dirW.lengthSq() < 1e-6) dirW.set(leg.mount.x, 0, leg.mount.z);
  dirW.normalize();

  coxaW.copy(shoulderW).addScaledVector(dirW, BONES[0].len);
  ankleW.copy(leg.foot).addScaledVector(dirW, -BONES[3].len * 0.75);
  ankleW.y = Math.max(FOOT_Y + 0.08, leg.foot.y + 0.05);
  poleW.copy(UP).addScaledVector(dirW, 0.45);
  bendJoint(coxaW, ankleW, BONES[1].len, BONES[2].len, poleW, kneeW);

  const points = [shoulderW, coxaW, kneeW, ankleW, leg.foot];
  for (let i = 0; i < leg.bones.length; i++) {
    placeBone(leg.bones[i], points[i], points[i + 1], BONES[i].radius);
    leg.joints[i].position.copy(points[i]);
  }
  leg.claw.position.copy(leg.foot);
  leg.claw.quaternion.copy(leg.bones[3].quaternion);
}

function bendJoint(a, b, len1, len2, pole, out) {
  reachW.subVectors(b, a);
  const raw = reachW.length();
  const dist = THREE.MathUtils.clamp(raw, Math.abs(len1 - len2) + 0.04, len1 + len2 - 0.04);
  if (raw > 1e-5) reachW.multiplyScalar(1 / raw);
  else reachW.set(0, 0, -1);
  const cosA = THREE.MathUtils.clamp((len1 * len1 + dist * dist - len2 * len2) / (2 * len1 * dist), -1, 1);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  axisX.copy(pole).addScaledVector(reachW, -pole.dot(reachW));
  if (axisX.lengthSq() < 1e-8) axisX.set(1, 0, 0);
  axisX.normalize();
  out.copy(a).addScaledVector(reachW, cosA * len1).addScaledVector(axisX, sinA * len1);
}

function placeBone(group, a, b, radius) {
  reachW.subVectors(b, a);
  const dist = Math.max(0.02, reachW.length());
  reachW.multiplyScalar(1 / dist);
  axisZ.copy(reachW).negate();
  axisX.crossVectors(UP, axisZ);
  if (axisX.lengthSq() < 1e-8) axisX.set(1, 0, 0);
  axisX.normalize();
  axisY.crossVectors(axisZ, axisX).normalize();
  basisM.makeBasis(axisX, axisY, axisZ);
  group.position.copy(a);
  group.quaternion.setFromRotationMatrix(basisM);
  group.scale.set(radius, radius, dist);
}
