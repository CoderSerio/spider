import * as THREE from '../lib/three.module.js';
import { createWalker, stepWalker } from './octopus.js';
import { state } from './state.js';

const PAPER = 0xf3efe6;

export function mountScene(host) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setClearColor(PAPER, 1);
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.08, 200);
  const walker = createWalker();
  scene.add(walker.root);
  scene.add(walker.rig);
  const grid = floor();
  scene.add(grid);

  // Orbit angles are an offset in the character frame, then applied with the
  // same quaternion the body moves with. They are not a second heading.
  let orbitYaw = Math.PI + 0.62;
  let orbitPitch = 0.32;
  let dist = 9.8;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  const el = renderer.domElement;
  el.addEventListener('pointerdown', (event) => {
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    el.setPointerCapture(event.pointerId);
  });
  el.addEventListener('pointerup', () => {
    dragging = false;
  });
  el.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    orbitYaw -= (event.clientX - lastX) * 0.005;
    orbitPitch = THREE.MathUtils.clamp(orbitPitch + (event.clientY - lastY) * 0.004, 0.12, 1.15);
    lastX = event.clientX;
    lastY = event.clientY;
  });
  el.addEventListener('wheel', (event) => {
    dist = THREE.MathUtils.clamp(dist * (1 + event.deltaY * 0.001), 6, 24);
    event.preventDefault();
  }, { passive: false });

  const local = new THREE.Vector3();
  const look = new THREE.Vector3();
  const desired = new THREE.Vector3();
  const camPos = new THREE.Vector3();
  let camReady = false;

  function placeCamera(dt) {
    const c = Math.cos(orbitPitch);
    local.set(
      Math.sin(orbitYaw) * c * dist,
      Math.sin(orbitPitch) * dist,
      Math.cos(orbitYaw) * c * dist,
    );
    local.applyQuaternion(walker.root.quaternion);
    desired.copy(walker.root.position).add(local);
    if (!camReady) {
      camPos.copy(desired);
      camReady = true;
    } else {
      camPos.lerp(desired, 1 - Math.exp(-6.5 * Math.max(dt, 0.001)));
    }
    camera.position.copy(camPos);
    look.copy(walker.root.position);
    look.y += 1.65;
    camera.lookAt(look);
  }

  function resize() {
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (w < 2 || h < 2) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize);

  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!state.paused) {
      state.time += dt;
      stepWalker(walker, dt, state);
    }
    grid.position.x = Math.round(walker.root.position.x);
    grid.position.z = Math.round(walker.root.position.z);
    placeCamera(dt);
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
}

function floor() {
  const group = new THREE.Group();
  const ink = new THREE.LineBasicMaterial({ color: 0xc8bfb2 });
  const span = 40;
  const step = 1;
  const pts = [];
  for (let i = -span; i <= span; i += step) {
    pts.push(new THREE.Vector3(i, -0.001, -span), new THREE.Vector3(i, -0.001, span));
    pts.push(new THREE.Vector3(-span, -0.001, i), new THREE.Vector3(span, -0.001, i));
  }
  group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), ink));
  return group;
}
