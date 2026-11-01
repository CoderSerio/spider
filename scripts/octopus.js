import * as THREE from '../lib/three.module.js';

const PAPER = 0xf3efe6;
const INK = 0x1b1714;

const ARMS = [
  { az: -2.55, droop: 0.58, curl: 0.18, sweep: 0.55, n: 6, len: 0.3, r: 0.075 },
  { az: -1.75, droop: 0.66, curl: 0.22, sweep: 0.42, n: 7, len: 0.3, r: 0.09 },
  { az: -1.0, droop: 0.74, curl: 0.16, sweep: 0.28, n: 7, len: 0.32, r: 0.1 },
  { az: -0.34, droop: 0.86, curl: 0.08, sweep: 0.12, n: 7, len: 0.3, r: 0.11 },
  { az: 0.36, droop: 0.84, curl: -0.08, sweep: -0.12, n: 7, len: 0.3, r: 0.11 },
  { az: 1.05, droop: 0.72, curl: -0.18, sweep: -0.3, n: 7, len: 0.32, r: 0.1 },
  { az: 1.8, droop: 0.64, curl: -0.24, sweep: -0.45, n: 7, len: 0.3, r: 0.088 },
  { az: 2.55, droop: 0.56, curl: -0.16, sweep: -0.52, n: 6, len: 0.28, r: 0.072 },
];

function mantleRadius(y) {
  const t = (y + 0.02) / 1.78;
  const bell = Math.sin(Math.min(1, Math.max(0, t)) * Math.PI * 0.9);
  const crown = t > 0.8 ? Math.max(0, (1 - t) / 0.2) : 1;
  return 0.08 + bell * 0.98 * Math.max(0.15, crown);
}

function armDirection(az, droop) {
  const outward = new THREE.Vector3(Math.sin(az), 0, Math.cos(az));
  return new THREE.Vector3(0, -1, 0).multiplyScalar(droop).add(outward.multiplyScalar(1 - droop)).normalize();
}

export function createOctopus() {
  const paper = new THREE.MeshBasicMaterial({
    color: PAPER,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  const inkMat = new THREE.LineBasicMaterial({ color: INK });
  const root = new THREE.Group();
  const hinges = [];
  const tips = [];

  root.add(mantle(paper, inkMat));
  root.add(eye(paper, inkMat, 0.5, 1.05, 0.2));
  root.add(eye(paper, inkMat, -0.72, 1.16, 0.12));
  root.add(hatch(paper, inkMat));
  root.add(siphon(paper, inkMat));
  root.add(crown(paper, inkMat));
  const beak = beakPair(paper, inkMat);
  root.add(beak.group);
  root.add(collar(paper, inkMat));

  const gear = gearAt(inkMat);
  root.add(gear);

  for (let i = 0; i < ARMS.length; i++) {
    const built = buildArm(ARMS[i], paper, inkMat, hinges);
    built.root.userData.index = i;
    root.add(built.root);
    tips.push(built.tip);
  }

  root.userData.hinges = hinges;
  root.userData.tips = tips;
  root.userData.gear = gear;
  root.userData.beakL = beak.left;
  root.userData.beakR = beak.right;
  root.userData.pupil = root.getObjectByName('pupil');
  return root;
}

function addEdges(mesh, inkMat) {
  const lines = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 12), inkMat);
  mesh.add(lines);
  return mesh;
}

function mantle(paper, inkMat) {
  const group = new THREE.Group();
  const pts = [];
  for (let i = 0; i <= 28; i++) {
    const y = -0.02 + (1.74 * i) / 28;
    pts.push(new THREE.Vector2(Math.max(0.02, mantleRadius(y)), y));
  }
  const shell = new THREE.Mesh(new THREE.LatheGeometry(pts, 40), paper);
  group.add(shell);

  for (let i = 0; i < 7; i++) {
    const y = 0.12 + i * 0.22;
    group.add(ring(mantleRadius(y), y, inkMat));
  }
  for (let k = 0; k < 8; k++) {
    const az = (k / 8) * Math.PI * 2;
    const line = [];
    for (let i = 0; i <= 24; i++) {
      const y = 0.02 + (1.66 * i) / 24;
      const r = mantleRadius(y);
      line.push(new THREE.Vector3(Math.sin(az) * r, y, Math.cos(az) * r));
    }
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(line), inkMat));
  }
  return group;
}

function ring(radius, y, inkMat) {
  const pts = [];
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.sin(a) * radius, y, Math.cos(a) * radius));
  }
  return new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), inkMat);
}

function eye(paper, inkMat, az, y, scale) {
  const r = mantleRadius(y);
  const group = new THREE.Group();
  group.position.set(Math.sin(az) * r, y, Math.cos(az) * r);
  group.lookAt(Math.sin(az) * (r + 1), y, Math.cos(az) * (r + 1));

  const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * scale / 0.2, 0.22 * scale / 0.2, 0.07, 12), paper);
  housing.rotation.x = Math.PI / 2;
  housing.position.z = 0.04;
  group.add(addEdges(housing, inkMat));

  group.add(circleLine(0.16 * (scale / 0.2), inkMat, 0.08));
  group.add(circleLine(0.09 * (scale / 0.2), inkMat, 0.09));

  if (scale > 0.15) {
    const pupil = new THREE.Mesh(
      new THREE.BoxGeometry(0.09, 0.035, 0.02),
      new THREE.MeshBasicMaterial({ color: INK }),
    );
    pupil.position.z = 0.1;
    pupil.name = 'pupil';
    group.add(pupil);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const bolt = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 4), paper);
      bolt.position.set(Math.cos(a) * 0.2, Math.sin(a) * 0.2, 0.08);
      group.add(addEdges(bolt, inkMat));
    }
  }
  return group;
}

function circleLine(radius, inkMat, z) {
  const pts = [];
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * radius, Math.sin(a) * radius, z));
  }
  return new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), inkMat);
}

function gearAt(inkMat) {
  const pts = [];
  const teeth = 8;
  const r = 0.07;
  for (let i = 0; i < teeth; i++) {
    const a0 = (i / teeth) * Math.PI * 2;
    const step = (Math.PI * 2) / teeth;
    pts.push(new THREE.Vector3(Math.cos(a0) * r, Math.sin(a0) * r, 0));
    pts.push(new THREE.Vector3(Math.cos(a0 + step * 0.28) * (r + 0.025), Math.sin(a0 + step * 0.28) * (r + 0.025), 0));
    pts.push(new THREE.Vector3(Math.cos(a0 + step * 0.55) * (r + 0.025), Math.sin(a0 + step * 0.55) * (r + 0.025), 0));
    pts.push(new THREE.Vector3(Math.cos(a0 + step * 0.82) * r, Math.sin(a0 + step * 0.82) * r, 0));
  }
  const gear = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), inkMat);
  const y = 0.78;
  const rad = mantleRadius(y);
  const az = 0.95;
  gear.position.set(Math.sin(az) * rad, y, Math.cos(az) * rad);
  gear.lookAt(Math.sin(az) * (rad + 1), y, Math.cos(az) * (rad + 1));
  gear.position.add(new THREE.Vector3(Math.sin(az), 0, Math.cos(az)).multiplyScalar(0.06));
  return gear;
}

function hatch(paper, inkMat) {
  const y = 0.7;
  const r = mantleRadius(y);
  const az = 1.25;
  const group = new THREE.Group();
  group.position.set(Math.sin(az) * r, y, Math.cos(az) * r);
  group.lookAt(Math.sin(az) * (r + 1), y, Math.cos(az) * (r + 1));
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.32, 0.05), paper);
  door.position.z = 0.04;
  group.add(addEdges(door, inkMat));
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 6), paper);
  handle.rotation.z = Math.PI / 2;
  handle.position.set(0.16, 0, 0.06);
  group.add(addEdges(handle, inkMat));
  return group;
}

function siphon(paper, inkMat) {
  const group = new THREE.Group();
  const samples = [];
  for (let i = 0; i <= 7; i++) {
    const u = i / 7;
    const x = -0.35 - u * 0.85;
    const y = 0.55 + Math.sin(u * Math.PI) * 0.28 - u * 0.15;
    const z = 0.15 + u * 0.15;
    samples.push(new THREE.Vector3(x, y, z));
  }
  for (let i = 0; i < samples.length - 1; i++) {
    const a = samples[i];
    const b = samples[i + 1];
    const len = a.distanceTo(b);
    const seg = new THREE.Group();
    seg.position.copy(a);
    seg.lookAt(b);
    const radius = 0.055 - i * 0.004;
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.92, len, 6), paper);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.z = len / 2;
    seg.add(addEdges(mesh, inkMat));
    group.add(seg);
  }
  return group;
}

function crown(paper, inkMat) {
  const group = new THREE.Group();
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), paper);
  cap.scale.set(1, 0.45, 1);
  cap.position.y = 1.7;
  group.add(addEdges(cap, inkMat));
  for (const x of [-0.08, 0, 0.08]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.1, 5), paper);
    post.position.set(x, 1.82, 0);
    group.add(addEdges(post, inkMat));
  }
  return group;
}

function beakPair(paper, inkMat) {
  const group = new THREE.Group();
  const left = jaw(paper, inkMat, -1);
  const right = jaw(paper, inkMat, 1);
  left.position.set(-0.02, 0.08, 0.42);
  right.position.set(0.02, 0.08, 0.42);
  group.add(left, right);
  return { group, left, right };
}

function jaw(paper, inkMat, sign) {
  const pivot = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.22), paper);
  mesh.position.set(sign * 0.1, -0.02, 0.08);
  pivot.add(addEdges(mesh, inkMat));
  return pivot;
}

function collar(paper, inkMat) {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.028, 6, 36), paper);
  mesh.rotation.x = Math.PI / 2;
  mesh.position.y = 0.2;
  mesh.scale.set(1.12, 0.86, 1);
  return addEdges(mesh, inkMat);
}

function buildArm(spec, paper, inkMat, hinges) {
  const root = new THREE.Group();
  root.position.set(Math.sin(spec.az) * 0.72, 0.2, Math.cos(spec.az) * 0.56);
  const dir = armDirection(spec.az, spec.droop);
  root.lookAt(root.position.clone().sub(dir));

  let parent = root;
  let prevLen = 0;
  for (let i = 0; i < spec.n; i++) {
    const u = i / spec.n;
    const r0 = spec.r * (1 - u * 0.8);
    const r1 = Math.max(0.02, spec.r * (1 - ((i + 1) / spec.n) * 0.8));
    const len = spec.len * (1 - u * 0.35);
    const pivot = new THREE.Group();
    if (i > 0) pivot.position.z = -prevLen;
    parent.add(pivot);
    pivot.add(makeLink(r0, r1, len, paper, inkMat));
    if (i % 2 === 0) pivot.add(makeSucker(r0, len, paper, inkMat));
    hinges.push({
      pivot,
      base: spec.curl * ((i + 1) / spec.n) ** 1.15,
      sweep: spec.sweep * ((i + 1) / spec.n) ** 1.2,
      gain: 0.25 + u * 0.55,
      phase: spec.az * 1.7 + i * 0.55,
    });
    parent = pivot;
    prevLen = len;
  }
  const tip = new THREE.Object3D();
  tip.name = 'tip';
  tip.position.z = -prevLen;
  parent.add(tip);
  return { root, tip };
}

function makeLink(r0, r1, len, paper, inkMat) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, len, 6), paper);
  mesh.rotation.x = Math.PI / 2;
  mesh.position.z = -len / 2;
  const group = new THREE.Group();
  group.add(addEdges(mesh, inkMat));
  const pin = new THREE.Mesh(new THREE.CylinderGeometry(r0 * 0.22, r0 * 0.22, r0 * 1.5, 6), paper);
  pin.rotation.z = Math.PI / 2;
  group.add(addEdges(pin, inkMat));
  return group;
}

function makeSucker(r, len, paper, inkMat) {
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.42, r * 0.3, 0.04, 10), paper);
  mesh.rotation.z = Math.PI / 2;
  mesh.position.set(r + 0.045, 0, -len * 0.55);
  group.add(addEdges(mesh, inkMat));
  const hole = [];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    hole.push(new THREE.Vector3(r + 0.07, Math.cos(a) * r * 0.2, -len * 0.55 + Math.sin(a) * r * 0.2));
  }
  group.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(hole), inkMat));
  return group;
}

export function updateOctopus(root, time, curlBias) {
  for (const hinge of root.userData.hinges) {
    const wave = Math.sin(time * 0.75 + hinge.phase) * 0.06;
    hinge.pivot.rotation.x = hinge.base + curlBias * hinge.gain + wave;
    hinge.pivot.rotation.z = hinge.sweep;
  }
  root.userData.gear.rotation.z = time * 0.45;
  const open = 0.35 + Math.sin(time * 0.9) * 0.12 + curlBias * 0.15;
  root.userData.beakL.rotation.y = open;
  root.userData.beakR.rotation.y = -open;
  const pupil = root.userData.pupil;
  if (pupil) pupil.scale.y = 0.65 + Math.sin(time * 1.3) * 0.35;
  const lead = root.userData.hinges[20];
  return lead ? (lead.pivot.rotation.x * 180) / Math.PI : 0;
}
