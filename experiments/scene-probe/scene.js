import * as THREE from 'three';
const status = document.querySelector('#status'), view = document.querySelector('#view');
const metric = data => { const result = { ...data, at: Date.now(), userAgent: navigator.userAgent }; status.textContent = JSON.stringify(result, null, 2); window.SceneHost.metric(JSON.stringify(result)); };
let documentState = { schemaVersion: 1, camera: [6, 4, 8], objects: [] };
function validateScene(scene) {
  const vector = value => Array.isArray(value) && value.length === 3 && value.every(n => Number.isFinite(n) && Math.abs(n) <= 100);
  if (!scene || scene.schemaVersion !== 1 || !vector(scene.camera) || !Array.isArray(scene.objects) || scene.objects.length > 100 || scene.objects.some(o => !vector(o.position) || !Number.isInteger(o.color) || o.color < 0 || o.color > 0xffffff)) throw Error('Unsupported scene');
  return { schemaVersion: 1, camera: [...scene.camera], objects: scene.objects.map(o => ({ position: [...o.position], color: o.color })) };
}
const scene = new THREE.Scene(); scene.background = new THREE.Color('#dae5df');
const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 200);
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: false });
renderer.setPixelRatio(1); renderer.setSize(960, 540, false); view.appendChild(renderer.domElement);
const light = new THREE.DirectionalLight(0xffffff, 3); light.position.set(4, 8, 5); scene.add(light, new THREE.AmbientLight(0xffffff, 1.3));
const group = new THREE.Group(); scene.add(group, new THREE.GridHelper(20, 20, 0x758d7b, 0xa4b8a9));
const geometry = new THREE.BoxGeometry(0.65, 1.6, 0.65);
function render() { camera.position.fromArray(documentState.camera); camera.lookAt(0, 0.6, 0); renderer.render(scene, camera); }
function apply(state) {
  documentState = validateScene(state);
  for (const child of [...group.children]) { group.remove(child); child.material.dispose(); }
  for (const object of documentState.objects) { const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: object.color, roughness: 0.8 })); mesh.position.fromArray(object.position); group.add(mesh); }
  render();
}
const makeScene = count => ({ schemaVersion: 1, camera: [6, 4, 8], objects: Array.from({ length: count }, (_, i) => ({ position: [(i % 10 - 4.5) * 0.9, 0.8, (Math.floor(i / 10) - 1) * 0.9], color: i % 2 ? 0xb46e4d : 0x427c70 })) });
function save() { const id = window.SceneHost.saveScene(JSON.stringify(documentState)); if (!id) throw Error('Save failed'); return id; }
const stored = window.SceneHost.loadScene();
try { apply(stored ? JSON.parse(stored) : makeScene(20)); } catch (error) { apply(makeScene(20)); metric({ kind: 'load-failed', message: String(error) }); }
metric({ kind: 'ready', restored: !!stored, objects: group.children.length, renderer: renderer.getContext().getParameter(renderer.getContext().RENDERER) });
document.querySelector('#save').onclick = () => metric({ kind: 'saved', sceneVersion: save(), camera: documentState.camera });
document.querySelector('#load').onclick = () => { try { apply(JSON.parse(window.SceneHost.loadScene())); metric({ kind: 'reopened', camera: documentState.camera, objects: group.children.length }); } catch (error) { metric({ kind: 'load-failed', message: String(error) }); } };
document.querySelector('#export').onclick = () => {
  const start = performance.now(), source = save();
  renderer.setSize(1280, 720, false); render();
  const data = renderer.domElement.toDataURL('image/png').split(',')[1];
  const image = window.SceneHost.exportPng(source, data);
  renderer.setSize(960, 540, false); render();
  metric({ kind: 'export', sceneVersion: source, image, milliseconds: performance.now() - start, bytesApprox: data.length * 0.75 });
};
let down, moveCount = 0, maxDragMs = 0;
renderer.domElement.onpointerdown = event => { down = { x: event.clientX, z: documentState.camera[2] }; renderer.domElement.setPointerCapture(event.pointerId); };
renderer.domElement.onpointermove = event => { if (!down) return; const start = performance.now(); documentState.camera[0] = Math.max(-12, Math.min(12, (event.clientX - down.x) / 30 + 6)); render(); maxDragMs = Math.max(maxDragMs, performance.now() - start); moveCount++; };
renderer.domElement.onpointerup = () => { down = null; metric({ kind: 'drag', moves: moveCount, maxJsRenderMs: maxDragMs, camera: documentState.camera }); moveCount = 0; maxDragMs = 0; };
let lostAt;
renderer.domElement.addEventListener('webglcontextlost', event => { event.preventDefault(); lostAt = performance.now(); metric({ kind: 'context-lost' }); });
renderer.domElement.addEventListener('webglcontextrestored', () => { render(); metric({ kind: 'context-restored', milliseconds: performance.now() - lostAt, objects: group.children.length }); });
document.querySelector('#context').onclick = () => { renderer.forceContextLoss(); setTimeout(() => renderer.forceContextRestore(), 750); };
let measuring = false;
async function benchmark(count) {
  if (measuring) return; measuring = true; apply(makeScene(count));
  const frames = []; let previous = performance.now();
  for (let i = 0; i < 180; i++) { await new Promise(requestAnimationFrame); const now = performance.now(); if (i >= 30) frames.push(now - previous); previous = now; documentState.camera[0] = 6 + Math.sin(i / 30); render(); }
  frames.sort((a, b) => a - b); measuring = false;
  metric({ kind: 'benchmark', count, frames: frames.length, p50: frames[Math.floor(frames.length * 0.5)], p95: frames[Math.floor(frames.length * 0.95)], max: frames.at(-1), calls: renderer.info.render.calls, triangles: renderer.info.render.triangles });
}
document.querySelector('#bench20').onclick = () => void benchmark(20);
document.querySelector('#bench100').onclick = () => void benchmark(100);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { render(); metric({ kind: 'foreground', objects: group.children.length }); } });
window.addEventListener('error', event => metric({ kind: 'error', message: event.message }));
