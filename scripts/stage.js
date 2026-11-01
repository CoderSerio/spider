import * as THREE from '../lib/three.module.js';
import { PALETTE } from './config.js';
import { Spider } from './spider.js';

// Camera framing. Drag orbits, wheel dollies; both clamp at the same limits.
const VIEW = {
  fov: 32,
  near: 0.08,
  far: 200,
  yaw: Math.PI + 0.62,
  pitch: 0.32,
  distance: 9.8,
  minDistance: 6,
  maxDistance: 24,
  minPitch: 0.12,
  maxPitch: 1.15,
  dragYaw: 0.005,
  dragPitch: 0.004,
  zoom: 0.001,
  ease: 6.5,
  lookUp: 1.15,
};

const GRID = { span: 40, step: 1, y: -0.001 };

const local = new THREE.Vector3();
const look = new THREE.Vector3();
const desired = new THREE.Vector3();

export class Stage {
  #host;
  #input;
  #renderer;
  #scene;
  #camera;
  #spider;
  #grid;
  #resizeObserver;

  #yaw = VIEW.yaw;
  #pitch = VIEW.pitch;
  #distance = VIEW.distance;
  #dragging = false;
  #pointerX = 0;
  #pointerY = 0;
  #camPos = new THREE.Vector3();
  #camReady = false;
  #last = 0;

  constructor(host, input) {
    this.#host = host;
    this.#input = input;

    this.#renderer = new THREE.WebGLRenderer({ antialias: true });
    this.#renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.#renderer.setClearColor(PALETTE.paper, 1);
    host.appendChild(this.#renderer.domElement);

    this.#scene = new THREE.Scene();
    this.#camera = new THREE.PerspectiveCamera(VIEW.fov, 1, VIEW.near, VIEW.far);

    this.#spider = new Spider();
    this.#scene.add(this.#spider.root, this.#spider.rig);

    this.#grid = buildGrid();
    this.#scene.add(this.#grid);

    this.#bindEvents();
    this.#resize();
  }

  start() {
    this.#last = performance.now();
    this.#renderer.setAnimationLoop(this.#frame);
  }

  dispose() {
    this.#renderer.setAnimationLoop(null);
    this.#resizeObserver.disconnect();
    const el = this.#renderer.domElement;
    el.removeEventListener('pointerdown', this.#onPointerDown);
    el.removeEventListener('pointerup', this.#onPointerUp);
    el.removeEventListener('pointermove', this.#onPointerMove);
    el.removeEventListener('wheel', this.#onWheel);
    this.#renderer.dispose();
    el.remove();
  }

  #bindEvents() {
    const el = this.#renderer.domElement;
    el.addEventListener('pointerdown', this.#onPointerDown);
    el.addEventListener('pointerup', this.#onPointerUp);
    el.addEventListener('pointermove', this.#onPointerMove);
    el.addEventListener('wheel', this.#onWheel, { passive: false });

    this.#resizeObserver = new ResizeObserver(() => this.#resize());
    this.#resizeObserver.observe(this.#host);
  }

  #onPointerDown = (event) => {
    this.#dragging = true;
    this.#pointerX = event.clientX;
    this.#pointerY = event.clientY;
    this.#renderer.domElement.setPointerCapture(event.pointerId);
  };

  #onPointerUp = () => {
    this.#dragging = false;
  };

  #onPointerMove = (event) => {
    if (!this.#dragging) return;
    this.#yaw -= (event.clientX - this.#pointerX) * VIEW.dragYaw;
    this.#pitch = THREE.MathUtils.clamp(
      this.#pitch + (event.clientY - this.#pointerY) * VIEW.dragPitch,
      VIEW.minPitch,
      VIEW.maxPitch,
    );
    this.#pointerX = event.clientX;
    this.#pointerY = event.clientY;
  };

  #onWheel = (event) => {
    this.#distance = THREE.MathUtils.clamp(
      this.#distance * (1 + event.deltaY * VIEW.zoom),
      VIEW.minDistance,
      VIEW.maxDistance,
    );
    event.preventDefault();
  };

  // Orbit angles are an offset in the character frame, then applied with the
  // same quaternion the body moves with. They are not a second heading.
  #placeCamera(dt) {
    const c = Math.cos(this.#pitch);
    local.set(
      Math.sin(this.#yaw) * c * this.#distance,
      Math.sin(this.#pitch) * this.#distance,
      Math.cos(this.#yaw) * c * this.#distance,
    );
    local.applyQuaternion(this.#spider.root.quaternion);
    desired.copy(this.#spider.root.position).add(local);

    if (!this.#camReady) {
      this.#camPos.copy(desired);
      this.#camReady = true;
    } else {
      this.#camPos.lerp(desired, 1 - Math.exp(-VIEW.ease * Math.max(dt, 0.001)));
    }
    this.#camera.position.copy(this.#camPos);

    look.copy(this.#spider.root.position);
    look.y += VIEW.lookUp;
    this.#camera.lookAt(look);
  }

  #resize() {
    const w = this.#host.clientWidth;
    const h = this.#host.clientHeight;
    if (w < 2 || h < 2) return;
    this.#renderer.setSize(w, h, false);
    this.#camera.aspect = w / h;
    this.#camera.updateProjectionMatrix();
  }

  #frame = (now) => {
    const dt = Math.min(0.05, (now - this.#last) / 1000);
    this.#last = now;

    if (!this.#input.paused) this.#spider.update(dt, this.#input);

    // The grid follows the body in whole cells, so it reads as an endless floor.
    this.#grid.position.x = Math.round(this.#spider.root.position.x);
    this.#grid.position.z = Math.round(this.#spider.root.position.z);

    this.#placeCamera(dt);
    this.#renderer.render(this.#scene, this.#camera);
  };
}

function buildGrid() {
  const group = new THREE.Group();
  const ink = new THREE.LineBasicMaterial({ color: PALETTE.grid });
  const points = [];
  for (let i = -GRID.span; i <= GRID.span; i += GRID.step) {
    points.push(new THREE.Vector3(i, GRID.y, -GRID.span), new THREE.Vector3(i, GRID.y, GRID.span));
    points.push(new THREE.Vector3(-GRID.span, GRID.y, i), new THREE.Vector3(GRID.span, GRID.y, i));
  }
  group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points), ink));
  return group;
}
