// Scene 3 — "AI LOVES US" (reprise)
// An empty station. A red metro slides in from the right, brakes, and stops with
// its doors dead-centre: every window packed with blank-eyed commuters.

import * as THREE from 'three';
import gsap from 'gsap';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { rng, damp, canvasTex, roundRect } from '../utils.js';

const CAR_LEN = 18;
const HALF = CAR_LEN / 2;
const PITCH = CAR_LEN + 0.7;
const Y0 = -0.25; // bottom of the body shell
const Y1 = 3.45; // top of the body shell
const FOV = 40;
const TAN = Math.tan(THREE.MathUtils.degToRad(FOV / 2));

const WINDOWS = [];
for (const dx of [-6, 0, 6]) {
  WINDOWS.push({ x: dx - 0.6, y: 2.0, w: 0.88, h: 1.56, r: 0.13, door: dx });
  WINDOWS.push({ x: dx + 0.6, y: 2.0, w: 0.88, h: 1.56, r: 0.13, door: dx });
}
for (const sx of [-3, 3]) WINDOWS.push({ x: sx, y: 2.12, w: 2.5, h: 1.22, r: 0.15 });
for (const ex of [-8.12, 8.12]) WINDOWS.push({ x: ex, y: 2.12, w: 1.0, h: 1.22, r: 0.15 });
const isHeroWindow = (w) => Math.abs(w.x) < 4.5;

const SKIN = ['#c98a55', '#b9884a', '#d9a273', '#8a6a3c', '#7a4a2e', '#9a8a55', '#a3623a', '#c7b07a', '#6f6a45'];
const CLOTH = ['#2f3320', '#25303a', '#3a2a22', '#1f2a24', '#40382a', '#2a2233', '#4a4630'];
const HAIR = ['#17110c', '#2a2420', '#3d2414', '#8f8a80', '#0f0f12', '#4a3a26'];

// ------------------------------------------------------------------ sculpting helpers
const _c = new THREE.Color();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const ONE = new THREE.Vector3(1, 1, 1);

/** Give a geometry faceted, hand-painted vertex colours (one tone per triangle). */
function paint(geo, hex, r, jitter = 0.15) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  const n = g.attributes.normal;
  const col = new Float32Array(n.count * 3);
  const base = new THREE.Color(hex);
  for (let i = 0; i < n.count; i += 3) {
    const ny = n.getY(i);
    _c.copy(base).multiplyScalar(1 + (r() - 0.5) * jitter * 2 + ny * 0.2 + n.getZ(i) * 0.08);
    if (ny < -0.25) {
      _c.r *= 0.72; // undersides fall off into a cold green-blue, like the painting
      _c.b *= 1.25;
    } else if (r() < 0.12) {
      _c.r *= 1.18; // the odd hot brush-stroke
    }
    for (let k = 0; k < 3; k++) col.set([_c.r, _c.g, _c.b], (i + k) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
const place = (geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = ONE) =>
  geo.applyMatrix4(_m.compose(new THREE.Vector3(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), s));

/** One commuter: head, features, neck and shoulders. Unit scale ≈ head radius. */
function buildHead(r, detail) {
  const pick = (a) => a[Math.floor(r() * a.length)];
  const skin = pick(SKIN);
  const hair = pick(HAIR);
  const cloth = pick(CLOTH);
  const parts = [];
  const eyes = [];
  const add = (geo, color, jit) => parts.push(paint(geo, color, r, jit));
  const dark = new THREE.Color(skin).multiplyScalar(0.55).getStyle();

  const jawW = 0.6 + r() * 0.32;
  const tall = 1.0 + r() * 0.24;
  const wide = 0.76 + r() * 0.12;

  const skull = new THREE.IcosahedronGeometry(1, detail);
  const p = skull.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i) * wide;
    let y = p.getY(i);
    let z = p.getZ(i) * 0.9;
    if (y < 0) {
      const k = Math.min(1, -y);
      x *= 1 - (1 - jawW) * k * k;
      if (z > 0) z *= 1 - 0.1 * k;
    }
    if (z > 0.55) z = 0.55 + (z - 0.55) * 0.55; // flatten the face
    for (const sx of [-1, 1]) {
      const d = Math.hypot(x - sx * 0.3, y - 0.12);
      if (z > 0 && d < 0.26) z -= (0.26 - d) * 0.6; // eye sockets
      const dc = Math.hypot(x - sx * 0.46, y + 0.18);
      if (z > 0.2 && dc < 0.22) z += (0.22 - dc) * 0.35; // cheekbones
    }
    p.setXYZ(i, x, y * tall, z);
  }
  add(skull, skin, 0.17);

  // eyes: blank, luminous
  const er = 0.14 + r() * 0.035;
  for (const sx of [-1, 1]) {
    eyes.push(place(new THREE.IcosahedronGeometry(er, 1), sx * 0.3, 0.12 * tall, 0.62, 0, 0, 0, new THREE.Vector3(1, 1 - r() * 0.2, 0.6)));
    // bruised lower lid
    add(place(new THREE.BoxGeometry(0.27, 0.05, 0.06), sx * 0.3, 0.12 * tall - er - 0.02, 0.66, 0, 0, sx * -0.12), '#33456f', 0.1);
  }
  // brows — the angle sets the mood
  const mood = (r() - 0.45) * 0.75;
  for (const sx of [-1, 1]) add(place(new THREE.BoxGeometry(0.4, 0.1, 0.2), sx * 0.26, 0.31 * tall, 0.69, 0.2, 0, sx * -mood), dark, 0.1);
  // nose: a four-sided wedge
  add(place(new THREE.ConeGeometry(0.15 + r() * 0.05, 0.5 + r() * 0.12, 4).rotateY(Math.PI / 4), 0, -0.1 * tall, 0.76, -0.5, 0, 0), skin, 0.2);
  // ears
  for (const sx of [-1, 1]) add(place(new THREE.BoxGeometry(0.1, 0.3, 0.2), sx * wide * 0.99, 0.05, -0.02, 0, 0, sx * -0.15), skin, 0.12);

  // mouth
  const mt = r();
  const my = -0.52 * tall;
  if (mt < 0.4) add(place(new THREE.BoxGeometry(0.4, 0.05, 0.06), 0, my, 0.65, 0, 0, (r() - 0.5) * 0.3), '#2a0f0c', 0.05);
  else if (mt < 0.8) {
    add(place(new THREE.BoxGeometry(0.46, 0.21, 0.06), 0, my, 0.64), '#1c0806', 0.05);
    add(place(new THREE.BoxGeometry(0.4, 0.085, 0.08), 0, my + 0.055, 0.655), '#d9c79a', 0.12);
    if (r() < 0.6) add(place(new THREE.BoxGeometry(0.36, 0.07, 0.08), 0, my - 0.065, 0.655), '#c9b486', 0.12);
  } else add(place(new THREE.BoxGeometry(0.3, 0.34, 0.06), 0, my - 0.04, 0.64), '#160605', 0.05);

  // hair
  const ht = r();
  if (ht > 0.22) {
    if (ht < 0.8) add(place(new THREE.IcosahedronGeometry(1, 1), 0, 0.5 * tall, -0.22, 0, 0, 0, new THREE.Vector3(wide * 1.07, 0.66 * tall, 0.95)), hair, 0.22);
    else for (const sx of [-1, 1]) add(place(new THREE.BoxGeometry(0.16, 0.42, 0.75), sx * wide * 0.98, 0.22, -0.2), hair, 0.2);
    if (ht > 0.62 && ht < 0.8) add(place(new THREE.BoxGeometry(wide * 2.1, 0.9, 0.5), 0, -0.1, -0.72), hair, 0.2);
  }
  if (r() < 0.3) add(place(new THREE.IcosahedronGeometry(1, 1), 0, -0.74 * tall, 0.3, 0, 0, 0, new THREE.Vector3(jawW * 0.72, 0.36, 0.42)), hair, 0.22);
  if (r() < 0.3) add(place(new THREE.BoxGeometry(0.42, 0.08, 0.1), 0, my + 0.13, 0.7), hair, 0.15);
  if (r() < 0.16) {
    for (const sx of [-1, 1]) add(place(new THREE.TorusGeometry(0.19, 0.028, 4, 10), sx * 0.3, 0.12 * tall, 0.76), '#0d0c0c', 0.05);
    add(place(new THREE.BoxGeometry(0.2, 0.03, 0.03), 0, 0.14 * tall, 0.76), '#0d0c0c', 0.05);
  }

  // neck + shoulders
  add(place(new THREE.CylinderGeometry(0.34, 0.42, 0.75, 6), 0, -1.2, -0.4), dark, 0.12);
  add(place(new THREE.CylinderGeometry(0.6, 1.0, 1.2, 6), 0, -2.0, -1.0, 0, 0, 0, new THREE.Vector3(1.25, 1, 0.6)), cloth, 0.2);
  if (r() < 0.35) {
    add(place(new THREE.ConeGeometry(0.4, 0.7, 3), 0, -1.75, -0.42, Math.PI, 0, 0, new THREE.Vector3(1, 1, 0.3)), '#b9b3a0', 0.1);
    add(place(new THREE.BoxGeometry(0.15, 0.8, 0.05), 0, -2.05, -0.36), r() < 0.6 ? '#b0181c' : '#3a4a80', 0.12);
  }
  // remember one eye (front of the right eyeball) so the camera can dive into it
  return { body: mergeGeometries(parts), eyes: mergeGeometries(eyes), eye: new THREE.Vector3(0.3, 0.12 * tall, 0.62 + er * 0.3), eyeR: er * 0.9 };
}

function buildHand(r) {
  const skin = SKIN[Math.floor(r() * SKIN.length)];
  const parts = [paint(new THREE.BoxGeometry(0.5, 0.55, 0.14), skin, r)];
  [-0.19, -0.065, 0.065, 0.19].forEach((x, i) => {
    const len = 0.4 + (i === 1 || i === 2 ? 0.1 : 0) + r() * 0.05;
    parts.push(paint(place(new THREE.BoxGeometry(0.105, len, 0.11), x * 1.15, 0.27 + len / 2, 0, 0, 0, -x * 0.9), skin, r));
  });
  parts.push(paint(place(new THREE.BoxGeometry(0.12, 0.32, 0.12), 0.34, 0.02, 0, 0, 0, -0.95), skin, r));
  return mergeGeometries(parts);
}

// ------------------------------------------------------------------ scene
export function createTrainScene() {
  const rand = rng(1984);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0a0606');
  scene.fog = new THREE.FogExp2('#0a0606', 0.018);
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.02, 200); // near plane small enough to touch an eyeball

  scene.add(new THREE.HemisphereLight('#ffd2a0', '#1c2c1c', 1.1));
  const key = new THREE.DirectionalLight('#ffc890', 2.7);
  key.position.set(1.5, 4, 5);
  const rim = new THREE.DirectionalLight('#6fb08a', 1.5);
  rim.position.set(-5, 0.5, 2);
  const top = new THREE.DirectionalLight('#ffb060', 1.3);
  top.position.set(0, 6, -1);
  scene.add(key, rim, top);

  /** push: 0 → 1 dives the camera into one commuter's eye (scene 3 → 4). */
  const state = { x: 0, cam: 0, light: 0, arrived: 0, push: 0 };
  const START = 2 * PITCH + HALF + 9; // lead car's nose begins just off the right edge
  state.x = START;

  // ---------------------------------------------------------------- station
  const wallTex = canvasTex(4096, 1280, (g, W, H) => {
    const r = rng(8);
    const S = W / 20; // px per world unit
    const Y = (y) => ((7 - y) / 9) * H;
    g.fillStyle = '#131a18';
    g.fillRect(0, 0, W, H);
    const tile = S * 0.26;
    const tones = ['#1b2523', '#1e2a27', '#17201e', '#222e2a', '#1a2420', '#263029'];
    for (let y = 0; y < H; y += tile) {
      for (let x = 0; x < W; x += tile) {
        g.fillStyle = tones[Math.floor(r() * tones.length)];
        g.fillRect(x + 2, y + 2, tile - 4, tile - 4);
      }
    }
    // name band
    g.fillStyle = '#8a7a58';
    g.fillRect(0, Y(3.35), W, Y(2.65) - Y(3.35));
    g.fillStyle = '#5f1414';
    g.fillRect(0, Y(3.35), W, 10);
    g.fillRect(0, Y(2.65) - 10, W, 10);
    g.fillStyle = '#1b1210';
    g.font = `${Math.round(S * 0.5)}px Anton, Impact, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('E S T A C I Ó N   F U T U R O', W / 2, (Y(3.35) + Y(2.65)) / 2 + 4);
    // a peeling propaganda poster
    const px = W / 2 - S * 3.6;
    const py = Y(2.35);
    const pw = S * 1.5;
    const ph = S * 2.1;
    g.fillStyle = '#b9ad8f';
    g.fillRect(px, py, pw, ph);
    g.fillStyle = '#8f1a1e';
    g.fillRect(px + 14, py + 14, pw - 28, ph * 0.58);
    g.fillStyle = '#e9dfc4';
    g.beginPath();
    const hx = px + pw / 2;
    const hy = py + ph * 0.3;
    const hs = pw * 0.21;
    g.moveTo(hx, hy + hs * 1.25);
    g.bezierCurveTo(hx - hs * 2.3, hy - hs * 0.3, hx - hs * 1.0, hy - hs * 1.7, hx, hy - hs * 0.55);
    g.bezierCurveTo(hx + hs * 1.0, hy - hs * 1.7, hx + hs * 2.3, hy - hs * 0.3, hx, hy + hs * 1.25);
    g.fill();
    g.fillStyle = '#1b1210';
    g.font = `${Math.round(S * 0.36)}px Anton, Impact, sans-serif`;
    g.fillText('AI LOVES US', hx, py + ph * 0.72);
    g.font = `${Math.round(S * 0.13)}px Anton, Impact, sans-serif`;
    g.fillText('STAND CLEAR OF THE FUTURE', hx, py + ph * 0.88);
    // grime
    for (let i = 0; i < 520; i++) {
      g.globalAlpha = 0.04 + r() * 0.1;
      g.fillStyle = r() < 0.7 ? '#000' : '#3a2a1a';
      g.fillRect(r() * W, r() * H, 4 + r() * 16, 60 + r() * 420);
    }
    g.globalAlpha = 1;
    const gr = g.createLinearGradient(0, Y(1.4), 0, H);
    gr.addColorStop(0, 'rgba(0,0,0,0)');
    gr.addColorStop(1, 'rgba(0,0,0,0.85)');
    g.fillStyle = gr;
    g.fillRect(0, Y(1.4), W, H - Y(1.4));
  });
  wallTex.wrapS = THREE.RepeatWrapping;
  wallTex.repeat.set(4, 1);
  wallTex.offset.x = 0.5;
  const wallMat = new THREE.MeshBasicMaterial({ map: wallTex });
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(80, 9), wallMat);
  wall.position.set(0, 2.5, -3.5);
  scene.add(wall);

  const platTex = canvasTex(1024, 1024, (g, W, H) => {
    const r = rng(4);
    g.fillStyle = '#171314';
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < 2600; i++) {
      g.globalAlpha = 0.05 + r() * 0.1;
      g.fillStyle = r() < 0.5 ? '#000' : '#3a3030';
      g.fillRect(r() * W, r() * H, 2 + r() * 10, 2 + r() * 6);
    }
    g.globalAlpha = 1;
    g.fillStyle = '#2a2424';
    g.fillRect(0, 0, W, 14);
    g.fillStyle = '#b58a17';
    g.fillRect(0, 34, W, 20);
    g.fillStyle = '#6e5510';
    for (let x = 0; x < W; x += 26) for (let y = 70; y < 130; y += 20) g.fillRect(x + 4, y, 12, 8);
    g.strokeStyle = '#0c0a0a';
    g.lineWidth = 3;
    for (let y = 180; y < H; y += 170) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(W, y);
      g.stroke();
    }
    for (let x = 0; x < W; x += 256) {
      g.beginPath();
      g.moveTo(x, 150);
      g.lineTo(x, H);
      g.stroke();
    }
  });
  platTex.wrapS = THREE.RepeatWrapping;
  platTex.repeat.set(8, 1);
  const platMat = new THREE.MeshBasicMaterial({ map: platTex });
  const plat = new THREE.Mesh(new THREE.PlaneGeometry(80, 12), platMat);
  plat.rotation.x = -Math.PI / 2;
  plat.position.set(0, 0, 6.45);
  scene.add(plat);
  const platEdge = new THREE.Mesh(new THREE.BoxGeometry(80, 1.6, 0.1), new THREE.MeshBasicMaterial({ color: '#0d0a0a' }));
  platEdge.position.set(0, -0.82, 0.45);
  scene.add(platEdge);
  const trackBed = new THREE.Mesh(new THREE.PlaneGeometry(80, 6), new THREE.MeshBasicMaterial({ color: '#070505' }));
  trackBed.rotation.x = -Math.PI / 2;
  trackBed.position.set(0, -1.5, -1.5);
  scene.add(trackBed);

  // hanging fluorescent fixtures
  const tubeMat = new THREE.MeshBasicMaterial({ color: '#e9fff0' });
  const fixtureMat = new THREE.MeshBasicMaterial({ color: '#0b0909' });
  for (const x of [-5.2, 0, 5.2]) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.16, 0.34), fixtureMat);
    f.position.set(x, 3.86, 2.0);
    const tb = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.06, 0.12), tubeMat);
    tb.position.set(x, 3.76, 2.0);
    for (const sx of [-1, 1]) {
      const rod = new THREE.Mesh(new THREE.BoxGeometry(0.03, 2, 0.03), fixtureMat);
      rod.position.set(x + sx * 0.9, 4.9, 2.0);
      scene.add(rod);
    }
    scene.add(f, tb);
  }

  // ---------------------------------------------------------------- train textures
  const bodyTex = canvasTex(4096, 840, (g, W, H) => {
    const r = rng(21);
    const S = W / CAR_LEN;
    const X = (x) => (x + HALF) * S;
    const Y = (y) => ((Y1 - y) / (Y1 - Y0)) * H;
    g.fillStyle = '#9b1619';
    g.fillRect(0, 0, W, H);
    const reds = ['#b8262a', '#7f1014', '#c53a30', '#8a1518', '#a81c20', '#6d0c10', '#b02a1c'];
    for (let i = 0; i < 1500; i++) {
      g.globalAlpha = 0.05 + r() * 0.13;
      g.fillStyle = reds[Math.floor(r() * reds.length)];
      g.fillRect(r() * W - 100, r() * H, 60 + r() * 460, 5 + r() * 26);
    }
    for (let i = 0; i < 260; i++) {
      g.globalAlpha = 0.04 + r() * 0.08;
      g.fillStyle = '#240405';
      g.fillRect(r() * W, r() * H, 3 + r() * 9, 80 + r() * 320);
    }
    g.globalAlpha = 1;
    let gr = g.createLinearGradient(0, Y(0.9), 0, H);
    gr.addColorStop(0, 'rgba(25,0,0,0)');
    gr.addColorStop(1, 'rgba(25,0,0,0.62)');
    g.fillStyle = gr;
    g.fillRect(0, Y(0.9), W, H - Y(0.9));
    gr = g.createLinearGradient(0, 0, 0, Y(2.95));
    gr.addColorStop(0, 'rgba(25,0,0,0.5)');
    gr.addColorStop(1, 'rgba(25,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, W, Y(2.95));
    // door leaves
    for (const dx of [-6, 0, 6]) {
      g.globalAlpha = 0.09;
      g.fillStyle = '#ff6a4a';
      g.fillRect(X(dx - 1.2), Y(3.22), 2.4 * S, Y(Y0) - Y(3.22));
      g.globalAlpha = 1;
      g.strokeStyle = '#2a0507';
      g.lineWidth = 8;
      g.strokeRect(X(dx - 1.22), Y(3.24), 2.44 * S, Y(Y0) - Y(3.24) + 20);
    }
    // rubber gaskets around every window
    for (const w of WINDOWS) {
      g.strokeStyle = '#0b0505';
      g.lineWidth = 0.11 * S;
      roundRect(g, X(w.x - w.w / 2), Y(w.y + w.h / 2), w.w * S, w.h * S, w.r * S);
      g.stroke();
      g.strokeStyle = 'rgba(255,120,100,0.16)';
      g.lineWidth = 3;
      roundRect(g, X(w.x - w.w / 2) - 0.075 * S, Y(w.y + w.h / 2) - 0.075 * S, (w.w + 0.15) * S, (w.h + 0.15) * S, (w.r + 0.07) * S);
      g.stroke();
    }
    // trim line and splatter
    g.fillStyle = 'rgba(30,2,4,0.65)';
    g.fillRect(0, Y(0.92), W, 6);
    const splat = (x, y, size) => {
      g.fillStyle = 'rgba(45,3,7,0.9)';
      for (let i = 0; i < 14; i++) {
        const a = r() * Math.PI * 2;
        const d = r() * r() * size * 2.2;
        g.beginPath();
        g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, size * (0.1 + r() * 0.42), 0, Math.PI * 2);
        g.fill();
      }
      for (let i = 0; i < 3; i++) g.fillRect(x + (r() - 0.5) * size, y, 3 + r() * 4, size * (1 + r() * 3));
    };
    splat(X(1.55), Y(1.0), 26);
    splat(X(-1.0), Y(0.55), 16);
    for (let i = 0; i < 9; i++) splat(r() * W, Y(0.3 + r() * 2.8), 8 + r() * 16);
  });
  const signTex = canvasTex(768, 150, (g, W, H) => {
    g.fillStyle = '#8c4a38';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = '#2a0f0c';
    g.lineWidth = 8;
    g.strokeRect(4, 4, W - 8, H - 8);
    g.fillStyle = '#1d0b09';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '54px Anton, Impact, sans-serif';
    g.fillText('ANTES DE ENTRAR', W / 2, 46);
    g.fillText('PERMITA SALIR', W / 2, 106);
  });
  const glassTex = canvasTex(256, 256, (g, W, H) => {
    const r = rng(6);
    const gr = g.createRadialGradient(W / 2, H / 2, W * 0.22, W / 2, H / 2, W * 0.74);
    gr.addColorStop(0, 'rgba(0,0,0,0)');
    gr.addColorStop(1, 'rgba(8,3,2,0.72)');
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(255,240,220,0.07)';
    for (let i = 0; i < 5; i++) {
      g.lineWidth = 6 + r() * 22;
      const x = r() * W * 1.2;
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x - 90, H);
      g.stroke();
    }
    g.fillStyle = 'rgba(255,235,210,0.05)';
    for (let i = 0; i < 12; i++) {
      g.beginPath();
      g.ellipse(r() * W, r() * H, 8 + r() * 26, 5 + r() * 14, r() * 3, 0, Math.PI * 2);
      g.fill();
    }
  });

  // ---------------------------------------------------------------- materials
  const bodyMat = new THREE.MeshStandardMaterial({ map: bodyTex, roughness: 0.62, metalness: 0.12 });
  const trimMat = new THREE.MeshStandardMaterial({ color: '#150607', roughness: 0.8 });
  const roofMat = new THREE.MeshStandardMaterial({ color: '#4a0d0f', roughness: 0.7 });
  const rubberMat = new THREE.MeshStandardMaterial({ color: '#56565c', roughness: 0.9 });
  const blackMat = new THREE.MeshBasicMaterial({ color: '#030202' });
  const innerMat = new THREE.MeshBasicMaterial({ color: '#120d08' });
  const crowdMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.86 });
  const eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.45, 1.45, 1.38) });
  const glassMat = new THREE.MeshBasicMaterial({ map: glassTex, transparent: true, depthWrite: false });
  const signMat = new THREE.MeshBasicMaterial({ map: signTex });

  // ---------------------------------------------------------------- shared geometry
  const shape = new THREE.Shape();
  shape.moveTo(-HALF, Y0);
  shape.lineTo(HALF, Y0);
  shape.lineTo(HALF, Y1);
  shape.lineTo(-HALF, Y1);
  shape.closePath();
  for (const w of WINDOWS) {
    const h = new THREE.Path();
    const x = w.x - w.w / 2;
    const y = w.y - w.h / 2;
    const rr = w.r;
    h.moveTo(x + rr, y);
    h.lineTo(x + w.w - rr, y);
    h.quadraticCurveTo(x + w.w, y, x + w.w, y + rr);
    h.lineTo(x + w.w, y + w.h - rr);
    h.quadraticCurveTo(x + w.w, y + w.h, x + w.w - rr, y + w.h);
    h.lineTo(x + rr, y + w.h);
    h.quadraticCurveTo(x, y + w.h, x, y + w.h - rr);
    h.lineTo(x, y + rr);
    h.quadraticCurveTo(x, y, x + rr, y);
    shape.holes.push(h);
  }
  const sideGeo = new THREE.ShapeGeometry(shape, 6);
  {
    const pos = sideGeo.attributes.position;
    const uv = sideGeo.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + HALF) / CAR_LEN, (pos.getY(i) - Y0) / (Y1 - Y0));
  }
  const glassGeo = mergeGeometries(WINDOWS.map((w) => new THREE.PlaneGeometry(w.w + 0.04, w.h + 0.04).translate(w.x, w.y, -0.03)));

  // commuter pools: a detailed set for the hero doors, a cheap set for everything else
  const poolHi = Array.from({ length: 16 }, () => buildHead(rand, 2));
  const poolLo = Array.from({ length: 12 }, () => buildHead(rand, 1));
  const hands = Array.from({ length: 4 }, () => buildHand(rand));
  const deepEye = new THREE.IcosahedronGeometry(0.036, 0);

  /** Lay a crush of commuters behind one window. Returns placements; the caller decides what gets merged. */
  function crowd(win, r) {
    const out = [];
    const s0 = 0.215;
    const cols = Math.max(2, Math.round(win.w / 0.41));
    const rows = Math.max(2, Math.round(win.h / 0.47));
    const cw = win.w / cols;
    const rh = win.h / rows;
    const left = win.x - win.w / 2;
    const bottom = win.y - win.h / 2;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        out.push({
          front: true,
          pos: new THREE.Vector3(
            left + (col + 0.5 + (row % 2 ? 0.2 : -0.2)) * cw + (r() - 0.5) * 0.1,
            bottom + (row + 0.5) * rh + (r() - 0.5) * 0.14,
            -0.31 - r() * 0.1
          ),
          rot: new THREE.Euler((r() - 0.5) * 0.5, (r() - 0.5) * 0.95, (r() - 0.5) * 0.75),
          s: s0 * (0.92 + r() * 0.3),
        });
      }
    }
    for (let row = 0; row <= rows; row++) {
      for (let col = 0; col <= cols; col++) {
        out.push({
          front: false,
          pos: new THREE.Vector3(left + col * cw + (r() - 0.5) * 0.14, bottom + row * rh + (r() - 0.5) * 0.14, -0.7 - r() * 0.25),
          rot: new THREE.Euler((r() - 0.5) * 0.5, (r() - 0.5) * 1.1, (r() - 0.5) * 0.8),
          s: s0 * (0.85 + r() * 0.25),
        });
      }
    }
    return out;
  }

  const mat4For = (c) => new THREE.Matrix4().compose(c.pos, new THREE.Quaternion().setFromEuler(c.rot), new THREE.Vector3(c.s, c.s, c.s));

  /** Static, merged crowd for a set of windows (2 draw calls regardless of head count). */
  function staticCrowd(windows, r, frontToo) {
    const bodies = [];
    const eyes = [];
    for (const w of windows) {
      for (const c of crowd(w, r)) {
        if (c.front && !frontToo(w)) continue;
        const h = poolLo[Math.floor(r() * poolLo.length)];
        const m = mat4For(c);
        bodies.push(h.body.clone().applyMatrix4(m));
        eyes.push(h.eyes.clone().applyMatrix4(m));
      }
      // hands flattened against the glass
      const nHands = w.w > 2 ? 3 : r() < 0.7 ? 1 : 0;
      for (let i = 0; i < nHands; i++) {
        const m = new THREE.Matrix4().compose(
          new THREE.Vector3(w.x + (r() - 0.5) * w.w * 0.7, w.y + (r() - 0.6) * w.h * 0.6, -0.085),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, (r() - 0.5) * 1.4)),
          new THREE.Vector3(0.24, 0.24, 0.24)
        );
        bodies.push(hands[Math.floor(r() * hands.length)].clone().applyMatrix4(m));
      }
      // pairs of eyes far back in the dark
      for (let i = 0; i < Math.round(w.w * 5); i++) {
        const x = w.x + (r() - 0.5) * w.w;
        const y = w.y + (r() - 0.5) * w.h;
        for (const sx of [-1, 1]) {
          const e = deepEye.clone().translate(x + sx * 0.055, y, -1.1);
          eyes.push(e);
        }
      }
    }
    const g = new THREE.Group();
    g.add(new THREE.Mesh(mergeGeometries(bodies), crowdMat), new THREE.Mesh(mergeGeometries(eyes), eyeMat));
    return g;
  }

  const box = (w, h, d, mat, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    return m;
  };

  function buildShell() {
    const car = new THREE.Group();
    car.add(new THREE.Mesh(sideGeo, bodyMat));
    car.add(box(CAR_LEN, 0.4, 2.9, roofMat, 0, Y1 + 0.2, -1.45));
    car.add(box(CAR_LEN - 0.6, 0.9, 2.7, trimMat, 0, Y0 - 0.45, -1.4));
    for (const sx of [-1, 1]) car.add(box(0.12, Y1 - Y0, 2.8, roofMat, sx * (HALF - 0.06), (Y0 + Y1) / 2, -1.4));
    car.add(box(0.7, 3.2, 2.3, blackMat, HALF + 0.35, 1.6, -1.4)); // gangway bellows
    const inner = new THREE.Mesh(new THREE.PlaneGeometry(CAR_LEN, Y1 - Y0), innerMat);
    inner.position.set(0, (Y0 + Y1) / 2, -1.25);
    car.add(inner);
    for (const dx of [-6, 0, 6]) {
      car.add(box(0.08, 3.42, 0.05, blackMat, dx, 1.5, 0.0));
      for (const sx of [-1, 1]) {
        car.add(box(0.055, 3.42, 0.07, rubberMat, dx + sx * 0.075, 1.5, 0.0));
        car.add(box(0.05, 3.42, 0.05, trimMat, dx + sx * 1.24, 1.5, 0.0));
      }
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.293), signMat);
      sign.position.set(dx, 3.12, 0.06);
      car.add(sign);
    }
    const glass = new THREE.Mesh(glassGeo, glassMat);
    glass.renderOrder = 5;
    car.add(glass);
    return car;
  }

  // ---------------------------------------------------------------- assemble the train
  const train = new THREE.Group();
  scene.add(train);
  const passerBy = staticCrowd(WINDOWS, rng(77), () => true); // shared by the two cars that rush past
  for (let i = 0; i < 2; i++) {
    const car = buildShell();
    car.position.x = (i - 2) * PITCH;
    car.add(i === 0 ? passerBy : passerBy.clone());
    train.add(car);
  }
  // cab on the lead car
  const lead = train.children[0];
  lead.add(box(1.4, Y1 - Y0 + 0.3, 2.85, roofMat, -HALF - 0.7, (Y0 + Y1) / 2 + 0.1, -1.42));
  lead.add(box(0.9, 1.1, 0.04, blackMat, -HALF - 0.7, 2.3, 0.01));
  const glowTex = canvasTex(128, 128, (g) => {
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,240,200,1)');
    gr.addColorStop(0.25, 'rgba(255,200,120,0.45)');
    gr.addColorStop(1, 'rgba(255,120,40,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
  });
  const headlight = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  headlight.position.set(-HALF - 1.5, 0.9, 0.3);
  headlight.scale.setScalar(9);
  lead.add(headlight);

  // hero car: the one that stops in front of us
  const hero = buildShell();
  train.add(hero);
  const heroRand = rng(2026);
  hero.add(staticCrowd(WINDOWS, heroRand, (w) => !isHeroWindow(w)));
  const actors = [];
  for (const w of WINDOWS.filter(isHeroWindow)) {
    for (const c of crowd(w, heroRand)) {
      if (!c.front) continue;
      const h = poolHi[Math.floor(heroRand() * poolHi.length)];
      const g = new THREE.Group();
      const eyes = new THREE.Mesh(h.eyes, eyeMat);
      g.add(new THREE.Mesh(h.body, crowdMat), eyes);
      g.position.copy(c.pos);
      g.rotation.copy(c.rot);
      g.scale.setScalar(c.s * 1.06);
      hero.add(g);
      actors.push({ g, eyes, eye: h.eye, eyeR: h.eyeR, pos: c.pos.clone(), rot: c.rot.clone(), phase: heroRand() * 10, lag: 0.5 + heroRand(), blink: 1 + heroRand() * 5, look: 0.5 + heroRand() * 0.6 });
    }
  }

  // dust hanging in the air
  const dustGeo = new THREE.BufferGeometry();
  const dust = new Float32Array(340 * 3);
  for (let i = 0; i < 340; i++) dust.set([(rand() - 0.5) * 24, rand() * 4.5 - 0.3, 0.5 + rand() * 2.6], i * 3);
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dust, 3));
  const dustPts = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: '#c9a27a', size: 0.026, transparent: true, opacity: 0.3, depthWrite: false }));
  scene.add(dustPts);

  // ---------------------------------------------------------------- motion-blur pass
  const blurMat = new THREE.ShaderMaterial({
    uniforms: { tMap: { value: null }, uAmount: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D tMap; uniform float uAmount; varying vec2 vUv;
      void main(){
        // keep the platform and the lamps sharp; only the band the train occupies smears
        float mask = smoothstep(.16, .3, vUv.y) * (1. - smoothstep(.86, .97, vUv.y));
        vec3 c = vec3(0.);
        for (int i = 0; i < 14; i++) {
          float f = (float(i) / 13. - .5) * uAmount * mask;
          c += texture2D(tMap, vUv + vec2(f, 0.)).rgb;
        }
        gl_FragColor = vec4(c / 14., 1.);
      }`,
    depthTest: false,
    depthWrite: false,
  });
  const fsq = new FullScreenQuad(blurMat);

  // ---------------------------------------------------------------- choreography
  let tl = null;
  let zWide = 7.4;
  let zClose = 5.2;
  let prevX = START;
  let speed = 0;
  let lean = 0;
  let leanV = 0;
  let aspect = 1;
  const api = { onArrive: null };

  // ---------------------------------------------------------------- eye dive (scene 3 → 4)
  let dive = null;
  let eyeRW = 0.04;
  const eyeW = new THREE.Vector3();
  const camFrom = new THREE.Vector3();
  const lookFrom = new THREE.Vector3();
  const ep = new THREE.Vector3();
  /** Pick the commuter whose eye is closest to the middle of the frame and most face-on. */
  function aimDive() {
    camera.updateMatrixWorld();
    let best = Infinity;
    for (const a of actors) {
      a.g.updateMatrixWorld(true);
      ep.copy(a.eye);
      a.g.localToWorld(ep).project(camera);
      if (Math.abs(ep.x) > 0.9 || Math.abs(ep.y) > 0.9) continue;
      const score = Math.hypot(ep.x * 1.2, ep.y - 0.25) + Math.abs(a.rot.y) * 0.35;
      if (score < best) {
        best = score;
        dive = a;
      }
    }
  }
  const sOut = { x: 0.5, y: 0.5, r: 0, squash: 1 };
  /** The dive target's eye on screen (uv) and its radius in screen heights — the wipe hangs on this. */
  function eyeScreen() {
    const d = eyeW.distanceTo(camera.position);
    ep.copy(eyeW).project(camera);
    sOut.x = ep.x * 0.5 + 0.5;
    sOut.y = ep.y * 0.5 + 0.5;
    sOut.r = eyeRW / d / (2 * TAN);
    return sOut;
  }

  function reset() {
    if (tl) tl.kill();
    tl = null;
    Object.assign(state, { x: START, cam: 0, light: 0, arrived: 0, push: 0 });
    dive = null;
    prevX = START;
    speed = 0;
  }
  /** Empty platform → rumble → the train slides in right-to-left and brakes to a stop. */
  function play() {
    reset();
    tl = gsap
      .timeline()
      .to(state, { light: 1, duration: 1.7, ease: 'power2.in' }, 0.25)
      .to(state, { x: 0, duration: 7.4, ease: 'power2.out' }, 1.25)
      .to(state, { cam: 1, duration: 4.8, ease: 'power2.inOut' }, 4.3)
      .call(() => api.onArrive && api.onArrive(), null, 8.2)
      .to(state, { arrived: 1, duration: 1.8, ease: 'power1.inOut' }, 8.5);
  }

  function update(dt, t, pointer) {
    train.position.x = state.x;
    const v = (state.x - prevX) / Math.max(dt, 1e-4);
    const accel = (v - speed) / Math.max(dt, 1e-4);
    speed = v;
    prevX = state.x;
    const moving = Math.min(1, Math.abs(speed) / 14);

    // everyone lurches forward under braking, then swings back when it stops
    const want = THREE.MathUtils.clamp(accel * 0.045, -0.2, 0.2) * (state.x < START - 1 ? 1 : 0);
    leanV += ((want - lean) * 60 - leanV * 6) * dt;
    lean += leanV * dt;
    train.rotation.z = -lean * 0.012;

    // camera: wide while it passes, then drift in on the doors
    const k = state.cam;
    const shake = moving * 0.035;
    camera.position.set(Math.sin(t * 47) * shake, 1.7 - k * 0.12 + Math.sin(t * 61) * shake * 0.7 + Math.sin(t * 0.6) * 0.01, zWide + (zClose - zWide) * k);
    camera.lookAt(pointer.x * 0.12 * state.arrived, 1.72 - k * 0.14, 0);

    // station lighting: flickers awake as the train approaches
    const flick = 0.86 + 0.14 * Math.sin(t * 31) * Math.sin(t * 7.3) + (Math.sin(t * 2.1) > 0.97 ? -0.35 : 0);
    const lum = (0.42 + 0.58 * state.light) * flick;
    wallMat.color.setRGB(lum, lum * 0.97, lum * 0.92);
    platMat.color.setRGB(lum, lum * 0.95, lum * 0.9);
    tubeMat.color.setRGB(1.5 * flick, 1.6 * flick, 1.5 * flick);
    headlight.material.opacity = state.light;
    headlight.scale.setScalar(7 + 3 * Math.sin(t * 20) * 0.1 + state.light * 3);

    // commuters
    const px = pointer.x * state.arrived;
    const py = pointer.y * state.arrived;
    for (const a of actors) {
      const calm = a === dive ? 1 - state.push : 1; // the one we dive into holds still
      const w = Math.sin(t * 0.9 * a.lag + a.phase) * calm;
      a.g.rotation.set(
        a.rot.x + w * 0.035 - py * 0.22 * a.look * calm,
        a.rot.y * (1 - 0.55 * state.arrived) * (a === dive ? 1 - 0.7 * state.push : 1) + Math.cos(t * 0.7 * a.lag + a.phase) * 0.05 * calm + px * 0.42 * a.look * calm,
        a.rot.z + lean * (0.8 + a.lag) + w * 0.02
      );
      a.g.position.set(a.pos.x - lean * 0.22 * a.lag, a.pos.y + Math.sin(t * 1.3 * a.lag + a.phase) * 0.008, a.pos.z);
      a.blink -= dt;
      if (a.blink < 0) a.blink = 2 + Math.random() * 6;
      a.eyes.scale.y = a.blink < 0.13 && !(a === dive && state.push > 0) ? 0.08 : 1;
    }

    // dive: from the resting framing, close in on one eye (log-space, so the zoom rate feels constant)
    if (dive && state.push > 0) {
      dive.g.updateMatrixWorld(true);
      eyeW.copy(dive.eye);
      dive.g.localToWorld(eyeW);
      eyeRW = dive.eyeR * dive.g.scale.x * hero.scale.x;
      camFrom.copy(camera.position);
      lookFrom.set(pointer.x * 0.12 * state.arrived, 1.72 - state.cam * 0.14, 0);
      const p = state.push;
      const d0 = camFrom.distanceTo(eyeW);
      const dEnd = eyeRW * 2.4;
      const ratio = Math.pow(dEnd / d0, p);
      camera.position.copy(eyeW).addScaledVector(camFrom.sub(eyeW), ratio);
      camera.lookAt(lookFrom.lerp(eyeW, Math.min(1, p * 2.4)));
    }

    dustPts.position.x = ((dustPts.position.x + speed * dt * 0.12 + 12) % 24) - 12;
    dustPts.position.y = Math.sin(t * 0.3) * 0.1;

    const viewW = 2 * TAN * camera.position.z * aspect;
    blurMat.uniforms.uAmount.value = (Math.abs(speed) / viewW) * (1 / 60) * 1.6;
  }

  /** Compile the blur program ahead of time (called once at boot). */
  function warm(renderer, rt, tmp) {
    blurMat.uniforms.tMap.value = rt.texture;
    renderer.setRenderTarget(tmp);
    fsq.render(renderer);
  }

  /** Optional post step: horizontal motion blur while the train is moving. */
  function post(renderer, rt, tmp) {
    if (blurMat.uniforms.uAmount.value < 0.0006) return rt;
    blurMat.uniforms.tMap.value = rt.texture;
    renderer.setRenderTarget(tmp);
    fsq.render(renderer);
    return tmp;
  }

  function resize(a) {
    aspect = a;
    camera.aspect = a;
    camera.updateProjectionMatrix();
    zClose = Math.max(5.2, 1.62 / (TAN * a)); // always keep both door windows in frame
    zWide = zClose + 2.2;
  }

  return Object.assign(api, {
    scene,
    camera,
    state,
    update,
    resize,
    post,
    warm,
    aimDive,
    eyeScreen,
    play,
    reset,
    bloom: { strength: 0.5, radius: 0.5, threshold: 0.92 },
  });
}
