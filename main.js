/* AimForge — browser aim trainer (Three.js, classic script so it runs from file://) */
(() => {
'use strict';

const $ = (id) => document.getElementById(id);
const DEG = Math.PI / 180;
const V3 = THREE.Vector3;
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ======================================================================
// Settings & persistence
// ======================================================================
const STORE_KEY = 'aimforge.v1';
const GAMES = {
  cs:  { name: 'CS2 / CS:GO / Apex', yaw: 0.022 },
  val: { name: 'Valorant',           yaw: 0.07 },
  ow:  { name: 'Overwatch 2',        yaw: 0.0066 },
  deg: { name: 'Raw (degrees / count)', yaw: 1 },
};
const DEFAULTS = {
  game: 'cs', sens: 1.0, dpi: 800, fov: 103, duration: 60,
  xColor: '#00ffc8', xLength: 6, xThickness: 2, xGap: 3, xDot: false, xOutline: true,
  targetColor: '#ff3b5c', volume: 0.5, showFps: false,
};
const store = { settings: { ...DEFAULTS }, history: {} };
try {
  const raw = localStorage.getItem(STORE_KEY);
  if (raw) {
    const p = JSON.parse(raw);
    Object.assign(store.settings, p.settings || {});
    store.history = p.history || {};
  }
} catch (e) { /* storage unavailable */ }
const save = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) {} };
const S = store.settings;
if (!GAMES[S.game]) S.game = 'cs';

const degPerCount = () => S.sens * GAMES[S.game].yaw;
const cm360 = () => 360 / degPerCount() / S.dpi * 2.54;

// ======================================================================
// Renderer / scene
// ======================================================================
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputEncoding = THREE.sRGBEncoding;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0e14);
const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 500);
camera.rotation.order = 'YXZ';
let yaw = 0, pitch = 0;

function applyFov() {
  const aspect = window.innerWidth / window.innerHeight;
  // Setting is horizontal FOV; three.js wants vertical.
  camera.fov = 2 * Math.atan(Math.tan(S.fov * DEG / 2) / aspect) / DEG;
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
}
function resize() { renderer.setSize(window.innerWidth, window.innerHeight, false); applyFov(); }
window.addEventListener('resize', resize);
resize();

// --- Room ---
function gridCanvas(base, line, minor) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = minor; g.lineWidth = 1;
  g.beginPath(); g.moveTo(128, 0); g.lineTo(128, 256); g.moveTo(0, 128); g.lineTo(256, 128); g.stroke();
  g.strokeStyle = line; g.lineWidth = 3; g.strokeRect(0, 0, 256, 256);
  return c;
}
const wallCanvas = gridCanvas('#2a3244', '#3d4860', '#323b50');
const floorCanvas = gridCanvas('#1e2433', '#343e55', '#272e40');
function plane(w, h, cnv, tint, setup) {
  const tex = new THREE.CanvasTexture(cnv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(w / 4, h / 4);
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  tex.encoding = THREE.sRGBEncoding;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({ map: tex, color: tint, roughness: 0.95, metalness: 0 }));
  setup(m); scene.add(m); return m;
}
const RW = 64, RH = 28, RD = 60, FLOOR = -8;          // room: x ±32, y -8..20, z -30..30
const midY = FLOOR + RH / 2;
plane(RW, RD, floorCanvas, 0xffffff, m => { m.rotation.x = -Math.PI / 2; m.position.y = FLOOR; });
plane(RW, RD, floorCanvas, 0xbfc6d6, m => { m.rotation.x = Math.PI / 2; m.position.y = FLOOR + RH; });
plane(RW, RH, wallCanvas, 0xffffff, m => { m.position.set(0, midY, -RD / 2); });
plane(RW, RH, wallCanvas, 0xd0d6e2, m => { m.rotation.y = Math.PI; m.position.set(0, midY, RD / 2); });
plane(RD, RH, wallCanvas, 0xd8dde8, m => { m.rotation.y = Math.PI / 2; m.position.set(-RW / 2, midY, 0); });
plane(RD, RH, wallCanvas, 0xd8dde8, m => { m.rotation.y = -Math.PI / 2; m.position.set(RW / 2, midY, 0); });

scene.add(new THREE.AmbientLight(0xffffff, 0.85));
const sun = new THREE.DirectionalLight(0xffffff, 0.8); sun.position.set(6, 18, 12); scene.add(sun);
const fill = new THREE.DirectionalLight(0x88aaff, 0.25); fill.position.set(-10, -4, 6); scene.add(fill);

// ======================================================================
// Targets & effects
// ======================================================================
const targetGeo = new THREE.SphereGeometry(1, 40, 28);
const targets = [];

function makeTarget(pos, radius, data = {}) {
  const col = new THREE.Color(S.targetColor);
  const mat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.35, metalness: 0.05, emissive: col, emissiveIntensity: 0.22 });
  const mesh = new THREE.Mesh(targetGeo, mat);
  mesh.position.copy(pos);
  mesh.scale.setScalar(radius);
  scene.add(mesh);
  const t = { mesh, radius, born: G.elapsed, data };
  mesh.userData.target = t;
  targets.push(t);
  return t;
}
function removeTarget(t) {
  scene.remove(t.mesh);
  t.mesh.material.dispose();
  const i = targets.indexOf(t);
  if (i >= 0) targets.splice(i, 1);
}
function clearTargets() { while (targets.length) removeTarget(targets[0]); }

// Find a spot that doesn't overlap existing targets.
function freeSpot(gen, r, tries = 40) {
  for (let i = 0; i < tries; i++) {
    const p = gen();
    if (targets.every(t => t.mesh.position.distanceTo(p) > t.radius + r + 0.5)) return p;
  }
  return gen();
}

const raycaster = new THREE.Raycaster();
const CENTER = new THREE.Vector2(0, 0);
function aimTarget() {
  if (!targets.length) return null;
  camera.updateMatrixWorld();
  for (const t of targets) t.mesh.updateMatrixWorld();
  raycaster.setFromCamera(CENTER, camera);
  const hit = raycaster.intersectObjects(targets.map(t => t.mesh), false)[0];
  return hit ? hit.object.userData.target : null;
}

const bursts = [];
function burst(pos, color) {
  const n = 26, arr = new Float32Array(n * 3), vel = [];
  for (let i = 0; i < n; i++) {
    arr.set([pos.x, pos.y, pos.z], i * 3);
    vel.push(new V3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(rand(4, 10)));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color, size: 0.2, transparent: true, depthWrite: false }));
  scene.add(pts);
  bursts.push({ pts, vel, life: 0 });
}
function updateBursts(dt) {
  for (let i = bursts.length - 1; i >= 0; i--) {
    const b = bursts[i]; b.life += dt;
    const a = b.pts.geometry.attributes.position;
    for (let k = 0; k < b.vel.length; k++) {
      a.array[k * 3] += b.vel[k].x * dt; a.array[k * 3 + 1] += b.vel[k].y * dt; a.array[k * 3 + 2] += b.vel[k].z * dt;
      b.vel[k].multiplyScalar(0.9);
    }
    a.needsUpdate = true;
    b.pts.material.opacity = 1 - b.life / 0.35;
    if (b.life > 0.35) { scene.remove(b.pts); b.pts.geometry.dispose(); b.pts.material.dispose(); bursts.splice(i, 1); }
  }
}

// ======================================================================
// Audio (synthesised, no assets)
// ======================================================================
let actx = null;
function beep(freq, dur, type, vol, slideTo) {
  if (S.volume <= 0) return;
  try {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol * S.volume * 0.35), t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(actx.destination);
    o.start(t); o.stop(t + dur + 0.02);
  } catch (e) {}
}
const sfx = {
  hit:  () => beep(900, 0.07, 'triangle', 1, 1500),
  miss: () => beep(170, 0.09, 'sine', 0.7, 90),
  tick: () => beep(620, 0.06, 'square', 0.35),
  go:   () => beep(1100, 0.18, 'square', 0.4),
  end:  () => { beep(700, 0.12, 'triangle', 0.6); setTimeout(() => beep(1050, 0.2, 'triangle', 0.6), 110); },
};

// ======================================================================
// Scenarios
// ======================================================================
const WALL_Z = -22;
const onWall = (xr, yr) => () => new V3(rand(-xr, xr), rand(-yr, yr), WALL_Z);

const MODES = [
  {
    id: 'grid', name: 'Grid Burst', tag: 'Flicking', type: 'click',
    desc: 'Three targets on a 5×5 grid. Every kill spawns a new one — clear them as fast as you can.',
    init(g) {
      g.cells = [];
      for (let r = -2; r <= 2; r++) for (let c = -2; c <= 2; c++) g.cells.push(new V3(c * 2.9, r * 2.9, WALL_Z));
      for (let i = 0; i < 3; i++) this.spawn(g, -1);
    },
    spawn(g, exclude) {
      const used = new Set(targets.map(t => t.data.cell));
      const free = g.cells.map((_, i) => i).filter(i => !used.has(i) && i !== exclude);
      const i = free[Math.floor(Math.random() * free.length)];
      makeTarget(g.cells[i], 1.0, { cell: i });
    },
    hit(g, t) { removeTarget(t); this.spawn(g, t.data.cell); return 100; },
  },
  {
    id: 'micro', name: 'Micro Flick', tag: 'Precision', type: 'click',
    desc: 'One small target at a time, close to center. Tiny, controlled adjustments win here.',
    init() { this.spawn(); },
    spawn() { makeTarget(freeSpot(onWall(6, 3.5), 0.42), 0.42); },
    hit(g, t) { removeTarget(t); this.spawn(); return 120; },
  },
  {
    id: 'spider', name: 'Center Return', tag: 'Flicking', type: 'click',
    desc: 'Alternates between a center target and a wide flick. Train fast flicks and resetting to center.',
    init(g) { g.center = true; this.spawn(g); },
    spawn(g) {
      if (g.center) { makeTarget(new V3(0, 0, WALL_Z), 0.8); return; }
      let p; do { p = onWall(17, 8)(); } while (Math.hypot(p.x, p.y) < 6);
      makeTarget(p, 0.8);
    },
    hit(g, t) { removeTarget(t); g.center = !g.center; this.spawn(g); return 100; },
  },
  {
    id: 'track', name: 'Strafe Track', tag: 'Tracking', type: 'track',
    desc: 'A strafing target changes direction unpredictably. Keep your crosshair on it — no clicking needed.',
    init(g) {
      g.tr = { t: makeTarget(new V3(0, 0, WALL_Z), 1.0), vx: 8, vy: 0, timer: 0.8 };
    },
    update(g, dt) {
      const s = g.tr, m = s.t.mesh;
      s.timer -= dt;
      if (s.timer <= 0) {
        s.timer = rand(0.3, 1.2);
        const dir = Math.random() < 0.7 ? -Math.sign(s.vx || 1) : Math.sign(s.vx || 1);
        s.vx = dir * rand(5, 12);
        s.vy = rand(-2.2, 2.2);
      }
      m.position.x += s.vx * dt; m.position.y += s.vy * dt;
      if (m.position.x > 13) { m.position.x = 13; s.vx = -Math.abs(s.vx); }
      if (m.position.x < -13) { m.position.x = -13; s.vx = Math.abs(s.vx); }
      if (m.position.y > 3.5) { m.position.y = 3.5; s.vy = -Math.abs(s.vy); }
      if (m.position.y < -3.5) { m.position.y = -3.5; s.vy = Math.abs(s.vy); }
      const on = aimTarget() === s.t;
      if (on) { g.onTime += dt; g.score += dt * 100; }
      m.material.emissiveIntensity = on ? 0.95 : 0.22;
      m.scale.setScalar(on ? 1.04 : 1.0);
    },
  },
  {
    id: 'reflex', name: 'Reflex Shrink', tag: 'Reflex', type: 'click',
    desc: 'Targets pop up and shrink away. Hit them early for more points; let one vanish and your streak resets.',
    life: 1.8,
    init(g) { g.next = 0.2; },
    update(g, dt) {
      g.next -= dt;
      if (g.next <= 0 && targets.length < 3) { makeTarget(freeSpot(onWall(15, 7), 1.1), 1.1); g.next = rand(0.45, 0.8); }
      for (const t of targets.slice()) {
        const f = 1 - (g.elapsed - t.born) / this.life;
        if (f <= 0) { removeTarget(t); g.expired++; g.streak = 0; sfx.miss(); }
        else t.mesh.scale.setScalar(t.radius * f);
      }
    },
    hit(g, t) {
      const f = 1 - (g.elapsed - t.born) / this.life;
      removeTarget(t);
      return Math.round(50 + 100 * f);
    },
  },
  {
    id: 'depth', name: 'Depth Swarm', tag: 'Depth', type: 'click',
    desc: 'Four targets scattered around you at different distances. Judge size and depth on every flick.',
    init() { for (let i = 0; i < 4; i++) this.spawn(); },
    spawn() {
      const gen = () => {
        const y = rand(-45, 45) * DEG, p = rand(-14, 22) * DEG, d = rand(9, 26);
        return new V3(-Math.sin(y) * Math.cos(p) * d, Math.sin(p) * d, -Math.cos(y) * Math.cos(p) * d);
      };
      makeTarget(freeSpot(gen, 0.7), 0.7);
    },
    hit(g, t) { removeTarget(t); this.spawn(); return 100; },
  },
];

// ======================================================================
// Game state
// ======================================================================
const G = {
  state: 'menu', prev: null, mode: null,
  timeLeft: 0, elapsed: 0, countdown: 0, lastCount: 0,
  score: 0, shots: 0, hits: 0, streak: 0, bestStreak: 0, ttk: [], onTime: 0, expired: 0,
};

function resetStats() {
  Object.assign(G, { timeLeft: +S.duration, elapsed: 0, score: 0, shots: 0, hits: 0, streak: 0,
    bestStreak: 0, ttk: [], onTime: 0, expired: 0 });
}

function showScreen(id) {
  for (const s of ['menu', 'settings', 'pause', 'results']) $(s).classList.toggle('hidden', s !== id);
}

function startMode(mode) {
  G.mode = mode;
  clearTargets();
  resetStats();
  yaw = 0; pitch = 0;
  showScreen(null);
  $('hud').classList.remove('hidden');
  $('hud-mode').textContent = mode.name;
  $('hud-streak').textContent = '';
  G.state = 'countdown'; G.countdown = 3; G.lastCount = 4;
  updateHud();
  lockPointer();
}

function beginRound() {
  $('countdown').classList.add('hidden');
  G.state = 'running';
  G.mode.init(G);
  sfx.go();
}

function pause(hint) {
  if (G.state !== 'running' && G.state !== 'countdown') return;
  G.prev = G.state; G.state = 'paused';
  $('pause-hint').textContent = hint || 'Click Resume to lock your mouse and continue.';
  showScreen('pause');
}

function quitToMenu() {
  G.state = 'menu';
  clearTargets();
  $('hud').classList.add('hidden');
  $('countdown').classList.add('hidden');
  if (document.pointerLockElement) document.exitPointerLock();
  renderMenu();
  showScreen('menu');
}

function accuracy() {
  if (G.mode.type === 'track') return G.elapsed > 0 ? G.onTime / G.elapsed : 0;
  return G.shots ? G.hits / G.shots : 0;
}

function finish() {
  G.state = 'results';
  clearTargets();
  $('hud').classList.add('hidden');
  if (document.pointerLockElement) document.exitPointerLock();
  sfx.end();

  const m = G.mode, score = Math.round(G.score), acc = accuracy();
  const h = store.history[m.id] || (store.history[m.id] = { best: 0, runs: [] });
  const prevBest = h.best || 0;
  const newBest = score > prevBest;
  if (newBest) h.best = score;
  h.runs.push({ score, acc: +acc.toFixed(4), t: Date.now(), d: +S.duration });
  if (h.runs.length > 30) h.runs.splice(0, h.runs.length - 30);
  save();

  $('res-mode').textContent = `${m.name} · ${S.duration}s`;
  $('res-score').textContent = score.toLocaleString();
  $('res-newbest').classList.toggle('hidden', !newBest);
  $('res-best').textContent = newBest
    ? (prevBest ? `Previous best ${prevBest.toLocaleString()} (+${(score - prevBest).toLocaleString()})` : 'First run recorded')
    : `Personal best ${prevBest.toLocaleString()}`;

  const cells = [['Accuracy', (acc * 100).toFixed(1) + '%']];
  if (m.type === 'track') {
    cells.push(['Time on target', G.onTime.toFixed(1) + 's']);
  } else {
    const avg = G.ttk.length ? G.ttk.reduce((a, b) => a + b, 0) / G.ttk.length : 0;
    cells.push(['Hits', G.hits], ['Misses', G.shots - G.hits]);
    if (m.id === 'reflex') cells.push(['Expired', G.expired]);
    cells.push(['Kills / sec', (G.hits / Math.max(G.elapsed, 0.001)).toFixed(2)],
               ['Avg time to kill', avg ? Math.round(avg) + ' ms' : '—'],
               ['Best streak', G.bestStreak]);
  }
  $('res-grid').innerHTML = cells.map(([k, v]) => `<div class="res-cell"><span>${k}</span><b>${v}</b></div>`).join('');
  $('res-chart').innerHTML = chartSvg(h.runs.slice(-20));
  showScreen('results');
}

function chartSvg(runs) {
  if (!runs.length) return '';
  const W = 600, H = 110, max = Math.max(...runs.map(r => r.score), 1), n = runs.length;
  const bw = W / Math.max(n, 10);
  const bars = runs.map((r, i) => {
    const h = Math.max(2, (r.score / max) * (H - 22));
    const last = i === n - 1;
    return `<rect x="${i * bw + 3}" y="${H - h}" width="${bw - 6}" height="${h}" rx="3"
      fill="${last ? 'var(--accent)' : '#2e3850'}"><title>${r.score} · ${(r.acc * 100).toFixed(1)}%</title></rect>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${bars}</svg>`;
}

// ======================================================================
// Input
// ======================================================================
function lockFailed() {
  pause('Pointer lock was blocked — wait a second, then click Resume.');
}
function lockPointer() {
  let p;
  try { p = canvas.requestPointerLock({ unadjustedMovement: true }); } catch (e) { p = null; }
  if (p && typeof p.catch === 'function') {
    p.catch(err => {
      if (err && err.name === 'NotSupportedError') {
        try { const p2 = canvas.requestPointerLock(); if (p2 && p2.catch) p2.catch(lockFailed); } catch (e) { lockFailed(); }
      } else lockFailed();
    });
  }
}
document.addEventListener('pointerlockerror', lockFailed);
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  if (!locked) pause();
  else if (G.state === 'paused') { G.state = G.prev; showScreen(null); }
});
window.addEventListener('blur', () => pause());

document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== canvas) return;
  if (G.state !== 'running' && G.state !== 'countdown') return;
  const dx = e.movementX || 0, dy = e.movementY || 0;
  if (Math.abs(dx) > 1500 || Math.abs(dy) > 1500) return; // ignore browser spikes
  const d = degPerCount() * DEG;
  yaw -= dx * d;
  pitch = clamp(pitch - dy * d, -89 * DEG, 89 * DEG);
});

let hitFlash = 0;
canvas.addEventListener('mousedown', (e) => {
  if (e.button !== 0 || G.state !== 'running' || document.pointerLockElement !== canvas) return;
  shoot();
});
function shoot() {
  if (G.mode.type === 'track') return;
  G.shots++;
  const t = aimTarget();
  if (t) {
    const pos = t.mesh.position.clone(), col = t.mesh.material.color.clone();
    G.hits++; G.streak++; G.bestStreak = Math.max(G.bestStreak, G.streak);
    G.ttk.push((G.elapsed - t.born) * 1000);
    const pts = G.mode.hit(G, t);
    G.score += Math.round(pts * (1 + Math.min(G.streak, 25) * 0.02));
    burst(pos, col);
    sfx.hit();
    hitFlash = 0.08; $('crosshair').classList.add('hitmark');
  } else {
    G.streak = 0;
    sfx.miss();
  }
}

document.addEventListener('keydown', (e) => {
  if ((e.key === 'r' || e.key === 'R') && (G.state === 'running' || G.state === 'countdown')) startMode(G.mode);
});

// ======================================================================
// HUD & crosshair
// ======================================================================
function updateHud() {
  const tl = $('hud-time');
  tl.textContent = Math.max(G.timeLeft, 0).toFixed(1);
  tl.parentElement.classList.toggle('low', G.timeLeft <= 5);
  $('hud-score').textContent = Math.round(G.score).toLocaleString();
  const hasAcc = G.mode && (G.mode.type === 'track' ? G.elapsed > 0 : G.shots > 0);
  $('hud-acc').textContent = hasAcc ? (accuracy() * 100).toFixed(1) + '%' : '—';
  $('hud-streak').textContent = G.streak >= 5 ? `${G.streak} STREAK` : '';
}

function crosshairSvg() {
  const L = +S.xLength, T = +S.xThickness, Gp = +S.xGap;
  const size = Math.ceil((L + Gp) * 2 + T + 6), c = size / 2;
  const stroke = S.xOutline ? 'stroke="#000" stroke-width="1" paint-order="stroke"' : '';
  const r = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${S.xColor}" ${stroke}/>`;
  let s = '';
  if (L > 0) {
    s += r(c - T / 2, c - Gp - L, T, L) + r(c - T / 2, c + Gp, T, L)
       + r(c - Gp - L, c - T / 2, L, T) + r(c + Gp, c - T / 2, L, T);
  }
  if (S.xDot || L === 0) s += r(c - T / 2, c - T / 2, T, T);
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">${s}</svg>`;
}
function renderCrosshair() {
  const svg = crosshairSvg();
  $('crosshair').innerHTML = svg;
  $('xh-preview').innerHTML = svg;
}

// ======================================================================
// Menu & settings UI
// ======================================================================
function sensLine() {
  return `${GAMES[S.game].name} ${(+S.sens).toString()} @ ${S.dpi} DPI · ${cm360().toFixed(1)} cm/360 · FOV ${S.fov}`;
}
function renderMenu() {
  $('mode-grid').innerHTML = MODES.map(m => {
    const best = (store.history[m.id] || {}).best;
    return `<button class="mode-card" data-mode="${m.id}">
      <span class="tag ${m.tag}">${m.tag}</span>
      <h4>${m.name}</h4>
      <p>${m.desc}</p>
      <div class="mode-meta"><span>Best</span><strong>${best ? best.toLocaleString() : '—'}</strong></div>
    </button>`;
  }).join('');
  $('sens-summary').textContent = sensLine();
}
$('mode-grid').addEventListener('click', (e) => {
  const card = e.target.closest('[data-mode]');
  if (card) startMode(MODES.find(m => m.id === card.dataset.mode));
});

$('set-game').innerHTML = Object.entries(GAMES).map(([k, g]) => `<option value="${k}">${g.name}</option>`).join('');
const inputs = document.querySelectorAll('#settings [data-key]');
function fillSettings() {
  inputs.forEach(el => {
    const v = S[el.dataset.key];
    if (el.type === 'checkbox') el.checked = !!v; else el.value = v;
  });
  refreshSettingsReadouts();
}
function refreshSettingsReadouts() {
  document.querySelectorAll('#settings output[data-for]').forEach(o => {
    const k = o.dataset.for;
    o.textContent = k === 'volume' ? Math.round(S.volume * 100) + '%' : k === 'fov' ? S.fov + '°' : S[k] + 'px';
  });
  const dpc = degPerCount();
  $('sens-readout').innerHTML =
    `<b>${cm360().toFixed(2)}</b> cm / 360° &nbsp;·&nbsp; <b>${(cm360() / 2.54).toFixed(2)}</b> in / 360°<br>` +
    `${dpc.toFixed(5)}° per count`;
  renderCrosshair();
}
inputs.forEach(el => el.addEventListener('input', () => {
  const k = el.dataset.key;
  let v;
  if (el.type === 'checkbox') v = el.checked;
  else if (el.type === 'number' || el.type === 'range' || k === 'duration') {
    v = parseFloat(el.value);
    if (!isFinite(v) || ((k === 'sens' || k === 'dpi') && v <= 0)) return;
  } else v = el.value;
  S[k] = v;
  save();
  if (k === 'fov') applyFov();
  $('fps').classList.toggle('hidden', !S.showFps);
  refreshSettingsReadouts();
}));

$('btn-settings').onclick = () => { fillSettings(); showScreen('settings'); };
$('btn-settings-back').onclick = () => { renderMenu(); showScreen('menu'); };
$('btn-reset').onclick = () => { Object.assign(S, DEFAULTS); save(); applyFov(); fillSettings(); };
$('btn-resume').onclick = () => lockPointer();
$('btn-restart').onclick = () => startMode(G.mode);
$('btn-quit').onclick = quitToMenu;
$('btn-again').onclick = () => startMode(G.mode);
$('btn-menu').onclick = quitToMenu;

// ======================================================================
// Main loop
// ======================================================================
let last = performance.now(), fpsAcc = 0, fpsFrames = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const rawDt = (now - last) / 1000; last = now;
  const dt = Math.min(rawDt, 0.05);

  if (G.state === 'menu' || G.state === 'results') {      // idle camera drift behind menus
    yaw += dt * 0.06; pitch = Math.sin(now / 4000) * 0.06;
  }
  camera.rotation.set(pitch, yaw, 0);

  if (G.state === 'countdown') {
    G.countdown -= dt;
    const n = Math.ceil(G.countdown);
    if (n !== G.lastCount && n > 0) { G.lastCount = n; sfx.tick(); }
    const cd = $('countdown'); cd.classList.remove('hidden'); cd.textContent = Math.max(n, 1);
    if (G.countdown <= 0) beginRound();
  } else if (G.state === 'running') {
    G.elapsed += dt; G.timeLeft -= dt;
    if (G.mode.update) G.mode.update(G, dt);
    if (G.timeLeft <= 0) { G.timeLeft = 0; finish(); }
    else updateHud();
  }

  if (hitFlash > 0) { hitFlash -= dt; if (hitFlash <= 0) $('crosshair').classList.remove('hitmark'); }
  updateBursts(dt);
  renderer.render(scene, camera);

  if (S.showFps) {
    fpsAcc += rawDt; fpsFrames++;
    if (fpsAcc >= 0.5) { $('fps').textContent = Math.round(fpsFrames / fpsAcc) + ' FPS'; fpsAcc = 0; fpsFrames = 0; }
  }
}

// Test hook (only with ?debug in the URL)
if (/[?&]debug\b/.test(location.search)) {
  window.__aim = { G, MODES, targets, camera, startMode, shoot, finish,
    aimAt(p) { const d = p.clone().sub(camera.position).normalize(); yaw = Math.atan2(-d.x, -d.z); pitch = Math.asin(d.y);
      camera.rotation.set(pitch, yaw, 0); camera.updateMatrixWorld(); } };
}

// Boot
$('fps').classList.toggle('hidden', !S.showFps);
renderCrosshair();
renderMenu();
showScreen('menu');
requestAnimationFrame(frame);
})();
