import * as THREE from '../lib/three.module.js';
import { BONES, DECK_Y, GAIT, MOUNTS, PALETTE } from './config.js';

// Mechanical spider: a cephalothorax on eight jointed legs, an abdomen hung
// behind it, and an alternating tetrapod gait. Paper fills, ink edges.

const UP = new THREE.Vector3(0, 1, 0);
const IDLE = { throttle: 0, turn: 0, lift: 0, boost: 0 };

// One set of materials and primitives, shared by every part.
const paperMat = new THREE.MeshBasicMaterial({
  color: PALETTE.paper,
  polygonOffset: true,
  polygonOffsetFactor: 1,
  polygonOffsetUnits: 1,
});
const inkMat = new THREE.LineBasicMaterial({ color: PALETTE.ink });

const tubeGeo = new THREE.CylinderGeometry(0.85, 1, 1, 6);
tubeGeo.rotateX(-Math.PI / 2);
tubeGeo.translate(0, 0, -0.5);
const tubeEdges = new THREE.EdgesGeometry(tubeGeo, 12);

const ballGeo = new THREE.SphereGeometry(1, 8, 6);
const ballEdges = new THREE.EdgesGeometry(ballGeo, 14);

const clawGeo = new THREE.BoxGeometry(0.045, 0.03, 0.22);
clawGeo.translate(0.04, 0, -0.1);
const clawEdges = new THREE.EdgesGeometry(clawGeo, 1);

// Scratch vectors: posing must not allocate per frame.
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

function addSolid(parent, geo, x, y, z, rx = 0, ry = 0) {
  const mesh = new THREE.Mesh(geo, paperMat);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, 0);
  mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 18), inkMat));
  parent.add(mesh);
  return mesh;
}

class Leg {
  constructor(rig, spec, mount, index) {
    this.index = index;
    this.spec = spec;
    this.mount = mount;
    this.plant = new THREE.Vector3();
    this.foot = new THREE.Vector3();
    this.swingFrom = new THREE.Vector3();
    this.swingTo = new THREE.Vector3();
    this.lifted = false;

    this.bones = BONES.map(() => {
      const group = new THREE.Group();
      const mesh = new THREE.Mesh(tubeGeo, paperMat);
      mesh.add(new THREE.LineSegments(tubeEdges, inkMat));
      group.add(mesh);
      rig.add(group);
      return group;
    });

    this.joints = BONES.map((bone) => {
      const joint = new THREE.Mesh(ballGeo, paperMat);
      joint.scale.setScalar(bone.radius * 1.35);
      joint.add(new THREE.LineSegments(ballEdges, inkMat));
      rig.add(joint);
      return joint;
    });

    this.claw = new THREE.Group();
    for (const sign of [-1, 1]) {
      const mesh = new THREE.Mesh(clawGeo, paperMat);
      mesh.position.x = sign * 0.03;
      mesh.rotation.y = sign * 0.35;
      mesh.add(new THREE.LineSegments(clawEdges, inkMat));
      this.claw.add(mesh);
    }
    rig.add(this.claw);
  }
}

export class Spider {
  root = new THREE.Group();
  // The legs are solved and placed in world space, so rig is a sibling of root.
  rig = new THREE.Group();
  chassis = new THREE.Group();

  yaw = 0;
  yawRate = 0;
  headYaw = 0;
  heightSet = 0;
  speed = 0;
  time = 0;

  #head;
  #seeded = false;

  constructor() {
    this.root.add(this.chassis);
    const mounts = this.#buildBody();
    this.legs = MOUNTS.map((spec, index) => new Leg(this.rig, spec, mounts[index], index));
    this.update(0, IDLE);
  }

  update(dt, input = IDLE) {
    const throttle = input.throttle || 0;
    const turn = input.turn || 0;
    const lift = input.lift || 0;
    const boost = input.boost ? 1 : 0;

    this.root.rotation.y = this.yaw;
    this.#readAxes();
    if (!this.#seeded) this.#seedFeet();

    if (dt <= 0) {
      this.#pose();
      return;
    }

    this.time += dt;
    this.#steer(dt, turn, boost);
    this.#drive(dt, throttle, boost);

    this.heightSet = THREE.MathUtils.clamp(
      this.heightSet + lift * GAIT.liftRate * dt,
      GAIT.heightMin,
      GAIT.heightMax,
    );
    this.root.position.y += (this.heightSet - this.root.position.y) * Math.min(1, GAIT.liftEase * dt);
    this.chassis.rotation.x = -throttle * GAIT.pitch;
    this.chassis.rotation.z = this.yawRate * GAIT.roll;

    this.#stepGait(throttle, turn, boost);
    this.#pose();
  }

  #buildBody() {
    const solid = (geo, x, y, z, rx = 0, ry = 0) => addSolid(this.chassis, geo, x, y, z, rx, ry);
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
    head.position.set(0, DECK_Y + 0.02, -0.52);
    this.chassis.add(head);
    const eye = (x, y, r) => {
      const geo = new THREE.CylinderGeometry(r, r, 0.05, 8);
      geo.rotateX(Math.PI / 2);
      return addSolid(head, geo, x, y, 0);
    };
    eye(-0.1, 0.05, 0.035);
    eye(0.1, 0.05, 0.035);
    eye(-0.05, -0.02, 0.022);
    eye(0.05, -0.02, 0.022);
    this.#head = head;

    // Shoulder balls double as each leg's anchor: their world matrix is the
    // only thing posing needs from the body.
    return MOUNTS.map((spec) => {
      const ball = new THREE.Mesh(ballGeo, paperMat);
      ball.scale.setScalar(0.06);
      ball.position.set(spec.x, spec.y, spec.z);
      ball.add(new THREE.LineSegments(ballEdges, inkMat));
      this.chassis.add(ball);
      return ball;
    });
  }

  #readAxes() {
    worldFwd.set(0, 0, -1).applyQuaternion(this.root.quaternion);
    worldRight.crossVectors(worldFwd, UP).normalize();
  }

  #steer(dt, turn, boost) {
    const yawTarget = turn * (boost ? GAIT.yawBoost : GAIT.yaw);
    this.yawRate += THREE.MathUtils.clamp(yawTarget - this.yawRate, -GAIT.yawAccel * dt, GAIT.yawAccel * dt);
    this.yaw -= this.yawRate * dt;
    this.root.rotation.y = this.yaw;
    this.headYaw += (-turn * GAIT.headYaw - this.headYaw) * (1 - Math.exp(-GAIT.headEase * dt));
    this.#head.rotation.y = this.headYaw;
  }

  #drive(dt, throttle, boost) {
    const cruise = boost ? GAIT.cruiseBoost : GAIT.cruise;
    this.speed += (throttle * cruise - this.speed) * (1 - Math.exp(-GAIT.speedEase * dt));
    this.#readAxes();
    this.root.position.x += worldFwd.x * this.speed * dt;
    this.root.position.z += worldFwd.z * this.speed * dt;
  }

  #stepGait(throttle, turn, boost) {
    const moving = Math.abs(throttle) + Math.abs(turn) > 0.05 || Math.abs(this.speed) > 0.08;
    const freq = moving ? (boost ? GAIT.freqBoost : GAIT.freq) : 0;
    const stride = freq > 0 ? this.speed * (GAIT.strideScale / freq) : 0;

    for (const leg of this.legs) {
      if (freq === 0) {
        if (leg.lifted) leg.plant.copy(leg.foot);
        leg.foot.copy(leg.plant);
        leg.foot.y = GAIT.footY;
        leg.lifted = false;
        continue;
      }

      const phase = (this.time * freq + leg.spec.phase) % 1;
      const swing = phase < GAIT.swing;
      if (swing && !leg.lifted) {
        leg.swingFrom.copy(leg.plant);
        this.#idealFoot(leg.swingTo, leg, stride);
      }
      if (swing) {
        const u = phase / GAIT.swing;
        const e = u * u * (3 - 2 * u);
        leg.foot.lerpVectors(leg.swingFrom, leg.swingTo, e);
        leg.foot.y = GAIT.footY + Math.sin(Math.PI * u) * GAIT.swingLift;
      } else if (leg.lifted) {
        leg.plant.copy(leg.swingTo);
        leg.foot.copy(leg.plant);
      } else {
        leg.foot.copy(leg.plant);
      }
      leg.lifted = swing;
    }
  }

  #seedFeet() {
    for (const leg of this.legs) {
      this.#idealFoot(leg.plant, leg, 0);
      leg.foot.copy(leg.plant);
      leg.swingFrom.copy(leg.plant);
      leg.swingTo.copy(leg.plant);
      leg.lifted = false;
    }
    this.#seeded = true;
  }

  #idealFoot(out, leg, stride) {
    out.copy(this.root.position);
    out.addScaledVector(worldFwd, leg.spec.fore + stride);
    out.addScaledVector(worldRight, leg.spec.side * leg.spec.lateral);
    out.y = GAIT.footY;
  }

  #pose() {
    this.root.updateMatrixWorld(true);
    for (const leg of this.legs) this.#poseLeg(leg);
  }

  #poseLeg(leg) {
    shoulderW.setFromMatrixPosition(leg.mount.matrixWorld);
    dirW.subVectors(leg.foot, shoulderW);
    dirW.y = 0;
    if (dirW.lengthSq() < 1e-6) dirW.set(leg.spec.x, 0, leg.spec.z);
    dirW.normalize();

    coxaW.copy(shoulderW).addScaledVector(dirW, BONES[0].len);
    ankleW.copy(leg.foot).addScaledVector(dirW, -BONES[3].len * 0.75);
    ankleW.y = Math.max(GAIT.footY + 0.08, leg.foot.y + 0.05);
    poleW.copy(UP).addScaledVector(dirW, 0.45);
    this.#bendJoint(coxaW, ankleW, BONES[1].len, BONES[2].len, poleW, kneeW);

    const points = [shoulderW, coxaW, kneeW, ankleW, leg.foot];
    for (let i = 0; i < leg.bones.length; i++) {
      this.#placeBone(leg.bones[i], points[i], points[i + 1], BONES[i].radius);
      leg.joints[i].position.copy(points[i]);
    }
    leg.claw.position.copy(leg.foot);
    leg.claw.quaternion.copy(leg.bones[3].quaternion);
  }

  #bendJoint(a, b, len1, len2, pole, out) {
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

  #placeBone(group, a, b, radius) {
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
}
