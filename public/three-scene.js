import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.164.1/build/three.module.js";

const canvas = document.querySelector("#ram-canvas");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

if (canvas) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  const clock = new THREE.Clock();
  const pointer = new THREE.Vector2();
  const ram = new THREE.Group();
  const traces = [];

  camera.position.set(0, 0.25, 8.2);
  camera.lookAt(0, 0, 0);
  scene.add(new THREE.AmbientLight(0xcfe9df, 1.6));

  const keyLight = new THREE.DirectionalLight(0xb9fff0, 2.4);
  keyLight.position.set(3.5, 4.8, 5.5);
  scene.add(keyLight);

  const boardMaterial = new THREE.MeshStandardMaterial({ color: 0x153d34, roughness: 0.62, metalness: 0.12 });
  const chipMaterial = new THREE.MeshStandardMaterial({ color: 0x0b1112, roughness: 0.5, metalness: 0.36 });
  const contactMaterial = new THREE.MeshStandardMaterial({ color: 0xb69d64, roughness: 0.38, metalness: 0.72 });
  const traceMaterial = new THREE.MeshBasicMaterial({ color: 0x49b894, transparent: true, opacity: 0.42 });

  const board = new THREE.Mesh(new THREE.BoxGeometry(5.7, 1.35, 0.12), boardMaterial);
  ram.add(board);

  for (let i = 0; i < 8; i += 1) {
    const chip = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.7, 0.16), chipMaterial);
    chip.position.set(-2.25 + i * 0.64, 0.17, 0.12);
    ram.add(chip);
  }

  for (let i = 0; i < 18; i += 1) {
    const contact = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.28, 0.08), contactMaterial);
    contact.position.set(-2.65 + i * 0.31, -0.72, 0.12);
    ram.add(contact);
  }

  for (let i = 0; i < 7; i += 1) {
    const trace = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.018, 0.018), traceMaterial.clone());
    trace.position.set(-2.05 + i * 0.72, -0.28 + (i % 3) * 0.17, 0.2);
    trace.rotation.z = (i % 2 ? 1 : -1) * 0.12;
    traces.push(trace);
    ram.add(trace);
  }

  const notch = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.22, 0.14), new THREE.MeshBasicMaterial({ color: 0x080b0c }));
  notch.position.set(0.3, -0.72, 0.15);
  ram.add(notch);

  ram.position.set(0, 0.05, 0);
  ram.rotation.set(-0.2, -0.18, -0.04);
  scene.add(ram);

  const grid = new THREE.GridHelper(8, 18, 0x49b894, 0x14322c);
  grid.position.y = -1.35;
  grid.material.opacity = 0.18;
  grid.material.transparent = true;
  scene.add(grid);

  let pulseUntil = 0;
  window.addEventListener("ram-pulse", () => {
    pulseUntil = clock.getElapsedTime() + 1.2;
  });

  canvas.addEventListener("pointermove", (event) => {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
    pointer.y = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
  });

  function resizeRenderer() {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    renderer.setSize(width, height, false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function animate() {
    const elapsed = clock.getElapsedTime();
    const pulsing = elapsed < pulseUntil;

    ram.rotation.y = -0.18 + Math.sin(elapsed * 0.45) * 0.14 + pointer.x * 0.08;
    ram.rotation.x = -0.2 + pointer.y * 0.06;
    ram.position.y = 0.05 + Math.sin(elapsed * 0.85) * 0.08;
    traces.forEach((trace, index) => {
      trace.material.opacity = pulsing ? 0.3 + Math.sin(elapsed * 12 + index) * 0.24 : 0.24 + Math.sin(elapsed * 2 + index) * 0.08;
    });
    grid.rotation.y = elapsed * 0.045;

    resizeRenderer();
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }

  animate();
} else if (canvas) {
  const context = canvas.getContext("2d");
  context.fillStyle = "#111819";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#49b894";
  context.font = "14px monospace";
  context.fillText("RAM animation paused", 20, 40);
}
