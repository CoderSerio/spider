import * as THREE from '../lib/three.module.js';
import { OrbitControls } from '../lib/addons/controls/OrbitControls.js';
import { createOctopus, updateOctopus } from './octopus.js';
import { state } from './state.js';

const PAPER = 0xf3efe6;

export function mountScene(host) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setClearColor(PAPER, 1);
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.08, 80);

  const octopus = createOctopus();
  scene.add(octopus);
  updateOctopus(octopus, 0, state.curl);
  octopus.updateMatrixWorld(true);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.4;
  controls.minPolarAngle = 0.2;
  controls.maxPolarAngle = Math.PI * 0.92;

  const sphere = new THREE.Sphere();
  const view = new THREE.Vector3(0.38, 0.22, 1).normalize();

  function fit() {
    new THREE.Box3().setFromObject(octopus).getBoundingSphere(sphere);
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
    const dist = Math.max(sphere.radius / Math.sin(vFov / 2), sphere.radius / Math.sin(hFov / 2)) * 1.18;
    camera.position.copy(sphere.center).addScaledVector(view, dist);
    controls.target.copy(sphere.center);
    controls.minDistance = dist * 0.55;
    controls.maxDistance = dist * 2.6;
    controls.update();
  }

  let resumeAt = 0;
  controls.addEventListener('start', () => {
    controls.autoRotate = false;
    resumeAt = 0;
  });
  controls.addEventListener('end', () => {
    resumeAt = performance.now() + 2800;
  });

  function resize() {
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (w < 2 || h < 2) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    fit();
  }
  resize();
  window.addEventListener('resize', resize);

  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!state.paused) state.time += dt;
    if (resumeAt && now > resumeAt && !state.paused) {
      controls.autoRotate = true;
      resumeAt = 0;
    }
    controls.autoRotate = controls.autoRotate && !state.paused;
    controls.update();
    state.arm = updateOctopus(octopus, state.time, state.curl);
    const offset = camera.position.clone().sub(controls.target);
    state.azimuth = (Math.atan2(offset.x, offset.z) * 180) / Math.PI;
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
}
