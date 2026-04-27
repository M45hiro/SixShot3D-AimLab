import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

/* =========================================================
   DOM
========================================================= */

const canvas = document.getElementById("gameCanvas");

const startBtn = document.getElementById("startBtn");
const restartBtn = document.getElementById("restartBtn");
const playAgainBtn = document.getElementById("playAgainBtn");

const statusText = document.getElementById("statusText");

const timeText = document.getElementById("timeText");
const scoreText = document.getElementById("scoreText");
const comboText = document.getElementById("comboText");
const accuracyText = document.getElementById("accuracyText");

const finalScore = document.getElementById("finalScore");
const finalHits = document.getElementById("finalHits");
const finalMisses = document.getElementById("finalMisses");
const finalAccuracy = document.getElementById("finalAccuracy");
const finalBestCombo = document.getElementById("finalBestCombo");

const endModal = document.getElementById("endModal");

const sensitivityRange = document.getElementById("sensitivityRange");
const sensitivityNumber = document.getElementById("sensitivityNumber");

const crosshair = document.getElementById("crosshair");
const crosshairType = document.getElementById("crosshairType");
const crosshairColor = document.getElementById("crosshairColor");
const crosshairSize = document.getElementById("crosshairSize");
const crosshairThickness = document.getElementById("crosshairThickness");
const crosshairGap = document.getElementById("crosshairGap");

const targetSizeInput = document.getElementById("targetSize");

/* =========================================================
   Valorant-style constants
========================================================= */

/**
 * Valorant 常用灵敏度换算：
 * 每个鼠标输入增量对应的角度 = sensitivity * 0.07 度
 *
 * 注意：
 * 浏览器 Pointer Lock 的 movementX / movementY 不是所有系统上都保证是完全 raw input。
 * 代码里会优先请求 unadjustedMovement，但最终是否生效取决于浏览器支持。
 */
const VALORANT_DEGREES_PER_COUNT = 0.07;
const DEG_TO_RAD = Math.PI / 180;

// Valorant 常见水平 FOV：103°
const VALORANT_HORIZONTAL_FOV = 103;

/* =========================================================
   Three.js state
========================================================= */

let renderer;
let scene;
let camera;
let raycaster;

let wallMesh;
let floorMesh;

const targets = [];
const decorations = [];

const WALL_WIDTH = 18;
const WALL_HEIGHT = 10;
const WALL_CENTER_Y = 2.8;
const WALL_Z = -18;
const TARGET_Z = WALL_Z + 0.16;
const TARGET_AREA_RATIO = 0.5;

const TARGET_COUNT = 6;

let targetRadius = Number(targetSizeInput.value);

/* =========================================================
   Game state
========================================================= */

let yaw = 0;
let pitch = 0;

let gameActive = false;
let remainingTime = 60;
let lastFrameTime = performance.now();

let score = 0;
let combo = 0;
let bestCombo = 0;
let hits = 0;
let misses = 0;

const ROUND_SECONDS = 60;

const BASE_HIT_SCORE = 100;
const MISS_PENALTY = 60;

/* =========================================================
   Init
========================================================= */

initThree();
buildRandomScene();
spawnInitialTargets();
setupEvents();
updateCrosshair();
updateHud();
animate();

/* =========================================================
   Scene
========================================================= */

function initThree() {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance",
  });

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9bd7ff);
  scene.fog = new THREE.Fog(0x9bd7ff, 30, 90);

  camera = new THREE.PerspectiveCamera(
    horizontalFovToVerticalFov(VALORANT_HORIZONTAL_FOV, window.innerWidth / window.innerHeight),
    window.innerWidth / window.innerHeight,
    0.01,
    1000,
  );

  camera.position.set(0, 1.6, 0);
  camera.rotation.order = "YXZ";

  raycaster = new THREE.Raycaster();
  raycaster.far = 100;

  const hemiLight = new THREE.HemisphereLight(0xffffff, 0x9db6c8, 1.8);
  scene.add(hemiLight);

  const sunLight = new THREE.DirectionalLight(0xffffff, 2.2);
  sunLight.position.set(4, 12, 6);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.width = 2048;
  sunLight.shadow.mapSize.height = 2048;
  sunLight.shadow.camera.near = 0.5;
  sunLight.shadow.camera.far = 60;
  sunLight.shadow.camera.left = -25;
  sunLight.shadow.camera.right = 25;
  sunLight.shadow.camera.top = 25;
  sunLight.shadow.camera.bottom = -25;
  scene.add(sunLight);

  createMainWall();
  createFloor();
}

function createMainWall() {
  const wallGeometry = new THREE.PlaneGeometry(WALL_WIDTH, WALL_HEIGHT, 1, 1);
  const wallMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.82,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });

  wallMesh = new THREE.Mesh(wallGeometry, wallMaterial);
  wallMesh.position.set(0, WALL_CENTER_Y, WALL_Z);
  wallMesh.receiveShadow = true;

  scene.add(wallMesh);

  const frameMaterial = new THREE.MeshStandardMaterial({
    color: 0xdcecff,
    roughness: 0.75,
  });

  const frameThickness = 0.16;

  const topFrame = new THREE.Mesh(
    new THREE.BoxGeometry(WALL_WIDTH + frameThickness * 2, frameThickness, 0.18),
    frameMaterial,
  );
  topFrame.position.set(0, WALL_CENTER_Y + WALL_HEIGHT / 2 + frameThickness / 2, WALL_Z + 0.03);

  const bottomFrame = new THREE.Mesh(
    new THREE.BoxGeometry(WALL_WIDTH + frameThickness * 2, frameThickness, 0.18),
    frameMaterial,
  );
  bottomFrame.position.set(0, WALL_CENTER_Y - WALL_HEIGHT / 2 - frameThickness / 2, WALL_Z + 0.03);

  const leftFrame = new THREE.Mesh(
    new THREE.BoxGeometry(frameThickness, WALL_HEIGHT + frameThickness * 2, 0.18),
    frameMaterial,
  );
  leftFrame.position.set(-WALL_WIDTH / 2 - frameThickness / 2, WALL_CENTER_Y, WALL_Z + 0.03);

  const rightFrame = new THREE.Mesh(
    new THREE.BoxGeometry(frameThickness, WALL_HEIGHT + frameThickness * 2, 0.18),
    frameMaterial,
  );
  rightFrame.position.set(WALL_WIDTH / 2 + frameThickness / 2, WALL_CENTER_Y, WALL_Z + 0.03);

  topFrame.receiveShadow = true;
  bottomFrame.receiveShadow = true;
  leftFrame.receiveShadow = true;
  rightFrame.receiveShadow = true;

  scene.add(topFrame, bottomFrame, leftFrame, rightFrame);
}

function createFloor() {
  const floorGeometry = new THREE.PlaneGeometry(80, 80);
  const floorMaterial = new THREE.MeshStandardMaterial({
    color: 0xc7f4ff,
    roughness: 0.78,
    metalness: 0.0,
  });

  floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.position.y = -2.3;
  floorMesh.receiveShadow = true;

  scene.add(floorMesh);
}

function buildRandomScene() {
  for (const obj of decorations) {
    scene.remove(obj);
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) obj.material.dispose();
  }
  decorations.length = 0;

  const platformMaterial = new THREE.MeshStandardMaterial({
    color: 0xe8fbff,
    roughness: 0.72,
  });

  const sideMaterialA = new THREE.MeshStandardMaterial({
    color: 0x7fdcff,
    roughness: 0.68,
  });

  const sideMaterialB = new THREE.MeshStandardMaterial({
    color: 0x4aa3ff,
    roughness: 0.7,
  });

  const backPlatform = new THREE.Mesh(
    new THREE.BoxGeometry(24, 0.18, 5),
    platformMaterial,
  );
  backPlatform.position.set(0, -2.2, WALL_Z + 2.2);
  backPlatform.receiveShadow = true;
  scene.add(backPlatform);
  decorations.push(backPlatform);

  const count = randomInt(8, 14);

  for (let i = 0; i < count; i++) {
    const side = Math.random() > 0.5 ? 1 : -1;

    const w = randomFloat(0.6, 1.8);
    const h = randomFloat(0.6, 3.6);
    const d = randomFloat(0.6, 1.8);

    const x = side * randomFloat(11, 23);
    const z = randomFloat(-24, 6);
    const y = -2.3 + h / 2;

    const mat = Math.random() > 0.5 ? sideMaterialA : sideMaterialB;

    const box = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      mat.clone(),
    );

    box.position.set(x, y, z);
    box.castShadow = true;
    box.receiveShadow = true;

    scene.add(box);
    decorations.push(box);
  }
}

/* =========================================================
   Targets
========================================================= */

function spawnInitialTargets() {
  clearTargets();

  for (let i = 0; i < TARGET_COUNT; i++) {
    spawnTarget();
  }
}

function clearTargets() {
  for (const target of targets) {
    scene.remove(target);
    target.geometry.dispose();
    target.material.dispose();
  }
  targets.length = 0;
}

function spawnTarget() {
  const geometry = new THREE.SphereGeometry(targetRadius, 32, 16);
  const material = new THREE.MeshStandardMaterial({
    color: 0x020202,
    roughness: 0.55,
    metalness: 0.0,
  });

  const mesh = new THREE.Mesh(geometry, material);
  const pos = getRandomTargetPosition();

  mesh.position.set(pos.x, pos.y, TARGET_Z);
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  mesh.userData.isTarget = true;

  scene.add(mesh);
  targets.push(mesh);
}

function replaceTarget(target) {
  const index = targets.indexOf(target);
  if (index !== -1) {
    targets.splice(index, 1);
  }

  scene.remove(target);
  target.geometry.dispose();
  target.material.dispose();

  spawnTarget();
}

function getRandomTargetPosition() {
  // 中心 50% 区域
  const spawnWidth = WALL_WIDTH * TARGET_AREA_RATIO;
  const spawnHeight = WALL_HEIGHT * TARGET_AREA_RATIO;

  const centerX = 0;
  const centerY = WALL_CENTER_Y;

  const minX = centerX - spawnWidth / 2 + targetRadius * 1.25;
  const maxX = centerX + spawnWidth / 2 - targetRadius * 1.25;

  const minY = centerY - spawnHeight / 2 + targetRadius * 1.35;
  const maxY = centerY + spawnHeight / 2 - targetRadius * 1.35;

  for (let attempt = 0; attempt < 160; attempt++) {
    const x = randomFloat(minX, maxX);
    const y = randomFloat(minY, maxY);

    let valid = true;

    for (const target of targets) {
      const dx = target.position.x - x;
      const dy = target.position.y - y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < targetRadius * 2.9 + 0.25) {
        valid = false;
        break;
      }
    }

    if (valid) {
      return { x, y };
    }
  }

  return {
    x: randomFloat(minX, maxX),
    y: randomFloat(minY, maxY),
  };
}

function resizeExistingTargets() {
  targetRadius = Number(targetSizeInput.value);

  for (const target of targets) {
    target.geometry.dispose();
    target.geometry = new THREE.SphereGeometry(targetRadius, 32, 16);

    const minX = -WALL_WIDTH / 2 + targetRadius * 1.25;
    const maxX = WALL_WIDTH / 2 - targetRadius * 1.25;
    const minY = WALL_CENTER_Y - WALL_HEIGHT / 2 + targetRadius * 1.35;
    const maxY = WALL_CENTER_Y + WALL_HEIGHT / 2 - targetRadius * 1.35;

    target.position.x = clamp(target.position.x, minX, maxX);
    target.position.y = clamp(target.position.y, minY, maxY);
  }
}

/* =========================================================
   Input
========================================================= */

function setupEvents() {
  window.addEventListener("resize", onResize);

  startBtn.addEventListener("click", () => {
    startGame();
  });

  restartBtn.addEventListener("click", () => {
    startGame();
  });

  playAgainBtn.addEventListener("click", () => {
    startGame();
  });

  canvas.addEventListener("click", () => {
    if (gameActive && document.pointerLockElement !== canvas) {
      requestPointerLock();
    }
  });

  document.addEventListener("pointerlockchange", () => {
    if (document.pointerLockElement === canvas) {
      statusText.textContent = "训练中。左键射击，ESC 释放鼠标。";
    } else if (gameActive) {
      statusText.textContent = "已暂停。点击画面继续训练。";
    }
  });

  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mousedown", onMouseDown);

  sensitivityRange.addEventListener("input", () => {
    sensitivityNumber.value = sensitivityRange.value;
  });

  sensitivityNumber.addEventListener("input", () => {
    const value = clamp(Number(sensitivityNumber.value), 0.05, 3.0);
    sensitivityRange.value = value.toFixed(2);
    sensitivityNumber.value = value.toFixed(2);
  });

  crosshairType.addEventListener("change", updateCrosshair);
  crosshairColor.addEventListener("input", updateCrosshair);
  crosshairSize.addEventListener("input", updateCrosshair);
  crosshairThickness.addEventListener("input", updateCrosshair);
  crosshairGap.addEventListener("input", updateCrosshair);

  targetSizeInput.addEventListener("input", resizeExistingTargets);
}

function onMouseMove(event) {
  if (!gameActive) return;
  if (document.pointerLockElement !== canvas) return;

  const sensitivity = Number(sensitivityRange.value);
  const radiansPerCount = sensitivity * VALORANT_DEGREES_PER_COUNT * DEG_TO_RAD;

  yaw -= event.movementX * radiansPerCount;
  pitch -= event.movementY * radiansPerCount;

  const maxPitch = Math.PI / 2 - 0.001;
  pitch = clamp(pitch, -maxPitch, maxPitch);

  camera.rotation.y = yaw;
  camera.rotation.x = pitch;
}

function onMouseDown(event) {
  if (!gameActive) return;
  if (document.pointerLockElement !== canvas) return;
  if (event.button !== 0) return;

  shoot();
}

function requestPointerLock() {
  try {
    const result = canvas.requestPointerLock({
      unadjustedMovement: true,
    });

    if (result && typeof result.catch === "function") {
      result.catch(() => {
        canvas.requestPointerLock();
      });
    }
  } catch {
    canvas.requestPointerLock();
  }
}

/* =========================================================
   Shooting
========================================================= */

function shoot() {
  raycaster.setFromCamera({ x: 0, y: 0 }, camera);

  const intersects = raycaster.intersectObjects(targets, false);

  if (intersects.length > 0) {
    handleHit(intersects[0].object);
  } else {
    handleMiss();
  }

  updateHud();
}

function handleHit(target) {
  hits += 1;
  combo += 1;
  bestCombo = Math.max(bestCombo, combo);

  const comboBonus = Math.round(combo * 18 + combo * combo * 1.8);
  const gained = BASE_HIT_SCORE + comboBonus;

  score += gained;

  replaceTarget(target);
}

function handleMiss() {
  misses += 1;

  const extraPenalty = Math.round(combo * 8);
  score = Math.max(0, score - MISS_PENALTY - extraPenalty);

  combo = 0;
}

/* =========================================================
   Game lifecycle
========================================================= */

function startGame() {
  gameActive = true;
  remainingTime = ROUND_SECONDS;

  score = 0;
  combo = 0;
  bestCombo = 0;
  hits = 0;
  misses = 0;

  yaw = 0;
  pitch = 0;
  camera.rotation.set(0, 0, 0);
  camera.position.set(0, 1.6, 0);

  endModal.classList.add("hidden");

  buildRandomScene();
  spawnInitialTargets();
  updateHud();

  statusText.textContent = "训练中。左键射击，ESC 释放鼠标。";

  requestPointerLock();
}

function endGame() {
  gameActive = false;

  if (document.pointerLockElement === canvas) {
    document.exitPointerLock();
  }

  updateHud();

  const shots = hits + misses;
  const accuracy = shots > 0 ? Math.round((hits / shots) * 100) : 0;

  finalScore.textContent = String(score);
  finalHits.textContent = String(hits);
  finalMisses.textContent = String(misses);
  finalAccuracy.textContent = `${accuracy}%`;
  finalBestCombo.textContent = String(bestCombo);

  endModal.classList.remove("hidden");

  statusText.textContent = "训练结束。可以重新开始。";
}

/* =========================================================
   HUD
========================================================= */

function updateHud() {
  const shots = hits + misses;
  const accuracy = shots > 0 ? Math.round((hits / shots) * 100) : 0;

  timeText.textContent = remainingTime.toFixed(1);
  scoreText.textContent = String(score);
  comboText.textContent = String(combo);
  accuracyText.textContent = `${accuracy}%`;
}

/* =========================================================
   Crosshair
========================================================= */

function updateCrosshair() {
  const type = crosshairType.value;
  const color = crosshairColor.value;
  const size = Number(crosshairSize.value);
  const thickness = Number(crosshairThickness.value);
  const gap = Number(crosshairGap.value);

  const dotSize = Math.max(thickness * 2, Math.round(size * 0.22));
  const ringSize = Math.max(size + 8, Math.round(size * 1.45));

  crosshair.style.setProperty("--ch-color", color);
  crosshair.style.setProperty("--ch-size", `${size}px`);
  crosshair.style.setProperty("--ch-thickness", `${thickness}px`);
  crosshair.style.setProperty("--ch-gap", `${gap}px`);
  crosshair.style.setProperty("--dot-size", `${dotSize}px`);
  crosshair.style.setProperty("--ring-size", `${ringSize}px`);

  if (type === "cross") {
    crosshair.innerHTML = `
      <span class="line h left"></span>
      <span class="line h right"></span>
      <span class="line v top"></span>
      <span class="line v bottom"></span>
    `;
    return;
  }

  if (type === "dot") {
    crosshair.innerHTML = `
      <span class="big-dot"></span>
    `;
    return;
  }

  if (type === "crossdot") {
    crosshair.innerHTML = `
      <span class="line h left"></span>
      <span class="line h right"></span>
      <span class="line v top"></span>
      <span class="line v bottom"></span>
      <span class="dot"></span>
    `;
    return;
  }

  if (type === "circle") {
    crosshair.innerHTML = `
      <span class="ring"></span>
      <span class="dot"></span>
    `;
    return;
  }

  if (type === "fourline") {
    crosshair.innerHTML = `
      <span class="line h left"></span>
      <span class="line h right"></span>
      <span class="line v top"></span>
      <span class="line v bottom"></span>
    `;

    const compactGap = Math.max(gap, 8);
    crosshair.style.setProperty("--ch-gap", `${compactGap}px`);
  }
}

/* =========================================================
   Animation
========================================================= */

function animate() {
  requestAnimationFrame(animate);

  const now = performance.now();
  const dt = (now - lastFrameTime) / 1000;
  lastFrameTime = now;

  if (gameActive && document.pointerLockElement === canvas) {
    remainingTime = Math.max(0, remainingTime - dt);

    if (remainingTime <= 0) {
      endGame();
    } else {
      updateHud();
    }
  }

  animateTargets(now);

  renderer.render(scene, camera);
}

function animateTargets(now) {
  const t = now * 0.001;

  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];

    target.rotation.y += 0.01;
    target.position.z = TARGET_Z + Math.sin(t * 2.4 + i) * 0.025;
  }
}

/* =========================================================
   Resize
========================================================= */

function onResize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const aspect = width / height;

  renderer.setSize(width, height);

  camera.aspect = aspect;
  camera.fov = horizontalFovToVerticalFov(VALORANT_HORIZONTAL_FOV, aspect);
  camera.updateProjectionMatrix();
}

/* =========================================================
   Utils
========================================================= */

function horizontalFovToVerticalFov(horizontalFovDeg, aspect) {
  const hFovRad = horizontalFovDeg * DEG_TO_RAD;
  const vFovRad = 2 * Math.atan(Math.tan(hFovRad / 2) / aspect);
  return vFovRad / DEG_TO_RAD;
}

function randomFloat(min, max) {
  return min + Math.random() * (max - min);
}

function randomInt(min, max) {
  return Math.floor(randomFloat(min, max + 1));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}