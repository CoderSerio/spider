import * as THREE from '../lib/three.module.js';

const PAPER = 0xf3efe6;
const INK = 0x1b1714;

const UP = new THREE.Vector3(0, 1, 0);
const SEGMENTS = 16;
const CYCLE = 1.7;
const DUTY = 0.55;
const LIFT = 1.25;
const KICK = 0.34;
const FOOT_Y = 0.16;
const TURN_RATE = 0.8;

// Upper pair reaches forward, lower pair reaches back. Both leave the
// spine harness and arch before they plant — the chord is much shorter
// than the tentacle, so the slack becomes the arch.
const MOUNTS = [
  { x: -0.26, y: 1.72, z: 0.36, side: -1, fore: 1.2, lateral: 1.4, phase: 0.0, reach: 6.4, flare: 0.2, lift: 1 },
  { x: 0.26, y: 1.72, z: 0.36, side: 1, fore: 1.2, lateral: 1.4, phase: 0.5, reach: 6.4, flare: 0.2, lift: 1 },
  { x: -0.36, y: 1.2, z: 0.38, side: -1, fore: -0.35, lateral: 2.25, phase: 0.75, reach: 5.15, flare: 0.95, lift: 0.58 },
  { x: 0.36, y: 1.2, z: 0.38, side: 1, fore: -0.35, lateral: 2.25, phase: 0.25, reach: 5.15, flare: 0.95, lift: 0.58 },
];

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

const turretGeo = new THREE.CylinderGeometry(0.055, 0.085, 0.16, 8);
turretGeo.rotateX(Math.PI / 2);
const turretEdges = new THREE.EdgesGeometry(turretGeo, 16);
const ballGeo = new THREE.SphereGeometry(0.078, 8, 6);
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
    time: CYCLE * (DUTY + (1 - DUTY) * 0.5),
    lens: chassis.getObjectByName('lens'),
    stern: chassis.getObjectByName('stern'),
  };
  stepWalker(walker, 0, { speed: 1.15, turn: 0 });
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

  solid(new THREE.CylinderGeometry(0.3, 0.34, 0.1, 8), 0, 0.58, 0.02);
  solid(new THREE.CylinderGeometry(0.16, 0.22, 0.28, 8), 0, 0.74, 0.02);
  solid(new THREE.CylinderGeometry(0.24, 0.18, 0.36, 8), 0, 1.04, 0.02);
  for (let i = 0; i < 4; i++) {
    solid(new THREE.TorusGeometry(0.27 - i * 0.012, 0.013, 4, 16), 0, 0.9 + i * 0.08, 0.02, Math.PI / 2);
  }

  solid(new THREE.BoxGeometry(0.66, 0.5, 0.38), 0, 1.48, -0.04);
  solid(new THREE.BoxGeometry(0.08, 0.42, 0.05), 0, 1.48, -0.25);
  solid(new THREE.BoxGeometry(0.9, 0.82, 0.1), 0, 1.5, 0.28);
  solid(new THREE.BoxGeometry(0.1, 0.7, 0.07), 0, 1.5, 0.37);

  solid(new THREE.CylinderGeometry(0.055, 0.055, 0.32, 8), -0.16, 1.92, 0.4);
  solid(new THREE.CylinderGeometry(0.055, 0.055, 0.32, 8), 0.16, 1.92, 0.4);

  solid(new THREE.BoxGeometry(0.36, 0.3, 0.34), 0, 1.96, -0.02);
  solid(new THREE.BoxGeometry(0.42, 0.1, 0.14), 0, 1.98, -0.18);
  solid(new THREE.TorusGeometry(0.16, 0.016, 4, 14), 0, 1.76, -0.02, Math.PI / 2);

  const lens = solid(new THREE.CylinderGeometry(0.08, 0.1, 0.12, 8), 0, 1.94, -0.3, Math.PI / 2);
  lens.name = 'lens';
  const pupil = new THREE.Mesh(
    new THREE.CircleGeometry(0.045, 12),
    new THREE.MeshBasicMaterial({ color: INK }),
  );
  pupil.position.set(0, 1.94, -0.37);
  pupil.rotation.y = Math.PI;
  chassis.add(pupil);

  const stern = new THREE.Object3D();
  stern.name = 'stern';
  stern.position.set(0, 1.5, 0.46);
  chassis.add(stern);

  for (let i = 0; i < MOUNTS.length; i++) {
    const mount = MOUNTS[i];
    const turret = new THREE.Mesh(turretGeo, paper);
    turret.position.set(mount.x, mount.y, mount.z + 0.02);
    turret.add(new THREE.LineSegments(turretEdges, ink));
    chassis.add(turret);

    const ball = new THREE.Mesh(ballGeo, paper);
    ball.position.set(mount.x, mount.y, mount.z);
    ball.add(new THREE.LineSegments(ballEdges, ink));
    chassis.add(ball);

    const anchor = new THREE.Object3D();
    anchor.name = `mount-${i}`;
    anchor.position.set(mount.x, mount.y, mount.z);
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
    foot: new THREE.Vector3(),
    wasStance: true,
    points: Array.from({ length: 5 }, () => new THREE.Vector3()),
    samples: Array.from({ length: SEGMENTS + 1 }, () => new THREE.Vector3()),
    curve: null,
  };
}

const worldFwd = new THREE.Vector3();
const worldRight = new THREE.Vector3();
const shoulderW = new THREE.Vector3();
const sideW = new THREE.Vector3();
const backW = new THREE.Vector3();
const midW = new THREE.Vector3();
const reachW = new THREE.Vector3();
const axisX = new THREE.Vector3();
const axisY = new THREE.Vector3();
const axisZ = new THREE.Vector3();
const transport = new THREE.Vector3();
const basisM = new THREE.Matrix4();

export function stepWalker(walker, dt, control) {
  const speed = control.speed;
  const turn = control.turn;
  walker.time += dt;
  walker.yaw -= turn * TURN_RATE * dt;
  walker.root.rotation.y = walker.yaw;

  const stride = (walker.time / CYCLE) * Math.PI * 2;
  walker.root.position.y = Math.sin(stride * 2) * 0.02;
  walker.chassis.rotation.z = Math.sin(stride) * 0.045;
  walker.chassis.rotation.x = Math.cos(stride * 2) * 0.02;
  if (dt > 0) {
    worldFwd.set(0, 0, -1).applyQuaternion(walker.root.quaternion);
    walker.root.position.addScaledVector(worldFwd, speed * dt);
  }
  walker.root.updateMatrixWorld(true);

  worldFwd.set(0, 0, -1).applyQuaternion(walker.root.quaternion);
  worldRight.crossVectors(worldFwd, UP).normalize();

  const stanceTravel = speed * DUTY * CYCLE;
  const swingTravel = speed * (1 - DUTY) * CYCLE;

  for (const arm of walker.arms) {
    const phase = (((walker.time / CYCLE) + arm.mount.phase) % 1 + 1) % 1;
    const inStance = phase < DUTY;
    if (arm.plant.lengthSq() === 0) {
      placeFoot(arm.plant, arm, worldFwd, worldRight, walker.root.position, 0);
      arm.swingFrom.copy(arm.plant);
      arm.wasStance = true;
    }
    if (inStance) {
      arm.wasStance = true;
      arm.foot.copy(arm.plant);
      arm.foot.y = FOOT_Y;
    } else {
      if (arm.wasStance) {
        arm.wasStance = false;
        arm.swingFrom.copy(arm.plant);
        placeFoot(arm.plant, arm, worldFwd, worldRight, walker.root.position, swingTravel + stanceTravel * 0.5);
      }
      const u = (phase - DUTY) / (1 - DUTY);
      const e = u * u * (3 - 2 * u);
      arm.foot.lerpVectors(arm.swingFrom, arm.plant, e);
      arm.foot.y = FOOT_Y + Math.sin(Math.PI * u) * LIFT;
      arm.foot.addScaledVector(worldRight, arm.mount.side * Math.sin(Math.PI * u) * KICK);
    }
    poseArm(walker, arm, inStance);
  }
}

function placeFoot(out, arm, fwdWorld, rightWorld, origin, ahead) {
  out.copy(origin);
  out.addScaledVector(fwdWorld, arm.mount.fore + ahead);
  out.addScaledVector(rightWorld, arm.mount.side * arm.mount.lateral);
  out.y = FOOT_Y;
}

function poseArm(walker, arm, planted) {
  const mount = walker.chassis.getObjectByName(`mount-${arm.index}`);
  mount.getWorldPosition(shoulderW);
  sideW.set(arm.mount.side, 0, 0).applyQuaternion(walker.root.quaternion);
  backW.set(0, 0, 1).applyQuaternion(walker.root.quaternion);

  const p = arm.points;
  if (!arm.curve) arm.curve = new THREE.CatmullRomCurve3(p, false, 'centripetal');

  let bow = 1.7;
  const chord = Math.max(0.3, shoulderW.distanceTo(arm.foot));
  const goal = Math.max(arm.mount.reach, chord + 0.85);
  for (let k = 0; k < 5; k++) {
    layoutArch(p, shoulderW, arm.foot, sideW, backW, bow, arm.mount);
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
  layoutArch(p, shoulderW, arm.foot, sideW, backW, bow, arm.mount);
  arm.curve.updateArcLengths();
  for (let i = 0; i <= SEGMENTS; i++) {
    arm.curve.getPointAt(i / SEGMENTS, arm.samples[i]);
  }

  // Seed the transport with the body's lateral axis so the ridge stays
  // continuous when the tentacle passes through vertical.
  transport.set(arm.mount.side, 0, 0).applyQuaternion(walker.root.quaternion);

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
    const radius = THREE.MathUtils.lerp(0.145, 0.048, Math.pow(t, 0.75));
    const link = arm.links[i];
    link.position.copy(a);
    link.quaternion.setFromRotationMatrix(basisM);
    link.scale.set(radius, radius, dist);

    const collar = arm.collars[i];
    const motor = i % 4 === 0;
    collar.position.copy(a);
    collar.quaternion.copy(link.quaternion);
    collar.scale.setScalar(radius * (motor ? 1.42 : 1.16));
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

function layoutArch(p, shoulder, foot, side, back, bow, mount) {
  // One hump along the chord. Lower arms stay wide and low so they
  // don't climb through the upper pair.
  const lift = mount.lift;
  midW.lerpVectors(shoulder, foot, 0.5);
  p[0].copy(shoulder);
  p[1].copy(shoulder).addScaledVector(UP, bow * 0.26 * lift).addScaledVector(back, 0.14).addScaledVector(side, 0.3 + mount.flare * 0.2);
  p[2].copy(midW).addScaledVector(UP, bow * lift).addScaledVector(side, 0.18 + mount.flare);
  p[3].lerpVectors(shoulder, foot, 0.82).addScaledVector(UP, bow * 0.2 * lift).addScaledVector(side, 0.1);
  p[4].copy(foot);
}

export function bodyForward(walker, out) {
  return out.set(0, 0, -1).applyQuaternion(walker.root.quaternion);
}
