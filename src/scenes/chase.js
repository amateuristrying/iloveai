// Scene 4 — "WE CAN'T ESCAPE AI"
// Ink-comic chase on a white page: a colossal robotic hand (camera lenses for
// fingertips, cables trailing off-panel) hunts a running figure, forever.
// Tap and it slams the ground — the runner leaps clear, every time, and keeps running.

import * as THREE from 'three';
import gsap from 'gsap';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rng, damp, lerp, toonRamp, canvasTex } from '../utils.js';

export const PAPER = '#fbfaf6';
const INK = '#0d1315';
const SPEED = 8; // how fast the ground slides by (world units / s)

const TEAL = '#3aa898';
const TEAL_D = '#23786d';
const TEAL_L = '#74d3c2';
const CAP = '#efebdf';
const JOINT = '#1b2829';
const METAL = '#4a5d5f';

export function createChaseScene() {
  const rand = rng(404);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PAPER);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
  const ramp = toonRamp([95, 175, 255]);
  const state = { intro: 1 };
  const events = {}; // sound hooks: windup, whoosh, impact, land

  scene.add(new THREE.HemisphereLight('#ffffff', '#a9c6bf', 1.55));
  const key = new THREE.DirectionalLight('#ffffff', 2.3);
  key.position.set(-3, 7, 8);
  scene.add(key);

  // ---------------------------------------------------------------- ink outlines
  // Inverted-hull outlines, extruded along *smoothed* normals so hard-edged
  // shapes (boxes, cylinder caps) get one unbroken contour.
  const hullCache = new Map();
  const inkMats = new Map();
  function inkMat(w) {
    if (!inkMats.has(w)) {
      inkMats.set(
        w,
        new THREE.ShaderMaterial({
          uniforms: { uW: { value: w } },
          vertexShader: /* glsl */ `uniform float uW;
            void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position + normal * uW, 1.0); }`,
          fragmentShader: /* glsl */ `void main(){ gl_FragColor = vec4(0.004, 0.008, 0.009, 1.0); }`,
          side: THREE.BackSide,
        })
      );
    }
    return inkMats.get(w);
  }
  function hullGeo(geo) {
    let g = hullCache.get(geo);
    if (!g) {
      g = new THREE.BufferGeometry();
      g.setAttribute('position', geo.attributes.position.clone());
      if (geo.index) g.setIndex(geo.index.clone());
      g = mergeVertices(g, 1e-3);
      g.computeVertexNormals();
      hullCache.set(geo, g);
    }
    return g;
  }
  function ink(mesh, w = 0.035) {
    mesh.add(new THREE.Mesh(hullGeo(mesh.geometry), inkMat(w)));
    return mesh;
  }
  const toonCache = {};
  const toon = (hex) => toonCache[hex] || (toonCache[hex] = new THREE.MeshToonMaterial({ color: hex, gradientMap: ramp }));
  function part(parent, geo, mat, x = 0, y = 0, z = 0, w = 0.035) {
    const m = new THREE.Mesh(geo, typeof mat === 'string' ? toon(mat) : mat);
    m.position.set(x, y, z);
    parent.add(m);
    if (w) ink(m, w);
    return m;
  }

  // ---------------------------------------------------------------- the hand
  // local frame: +x = where the fingers point, +y = back of the hand, z = across the palm
  const redMat = new THREE.MeshBasicMaterial({ color: '#ff2236' });
  const glintMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  function lens(parent, x, y, z, r) {
    part(parent, new THREE.CylinderGeometry(r, r * 1.08, 0.12, 20).rotateZ(Math.PI / 2), METAL, x, y, z, 0.02);
    part(parent, new THREE.CylinderGeometry(r * 0.72, r * 0.72, 0.06, 20).rotateZ(Math.PI / 2), JOINT, x + 0.05, y, z, 0);
    const iris = new THREE.Mesh(new THREE.CircleGeometry(r * 0.46, 20).rotateY(Math.PI / 2), redMat);
    iris.position.set(x + 0.085, y, z);
    parent.add(iris);
    const glint = new THREE.Mesh(new THREE.CircleGeometry(r * 0.13, 10).rotateY(Math.PI / 2), glintMat);
    glint.position.set(x + 0.09, y + r * 0.2, z - r * 0.2);
    parent.add(glint);
  }

  const rig = new THREE.Group(); // position + aim
  const tilt = new THREE.Group(); // roll about the arm axis (back-of-hand to us ↔ palm down)
  const handG = new THREE.Group();
  handG.scale.setScalar(1.15);
  rig.add(tilt);
  tilt.add(handG);
  scene.add(rig);

  part(handG, new RoundedBoxGeometry(2.0, 0.66, 1.95, 4, 0.24), TEAL, 0, 0, 0, 0.045);
  part(handG, new RoundedBoxGeometry(1.1, 0.16, 1.15, 2, 0.06), TEAL_L, -0.2, 0.36, 0.1, 0.025);
  part(handG, new RoundedBoxGeometry(0.5, 0.74, 1.98, 3, 0.18), TEAL_D, 0.86, 0.02, 0, 0.04);
  part(handG, new RoundedBoxGeometry(0.55, 0.3, 0.7, 2, 0.1), CAP, -0.55, -0.12, 0.92, 0.03); // heel plate
  const boltGeo = new THREE.SphereGeometry(0.055, 8, 6);
  for (const [x, z] of [[-0.78, -0.78], [-0.78, 0.78], [0.45, -0.82], [0.45, 0.82], [-0.2, -0.86], [0.1, 0.0]]) {
    part(handG, boltGeo, JOINT, x, 0.345, z, 0);
  }
  // the "eye" on the back of the hand
  part(handG, new THREE.CylinderGeometry(0.3, 0.36, 0.5, 18).rotateZ(Math.PI / 2), JOINT, 0.45, 0.5, -0.48, 0.03);
  lens(handG, 0.72, 0.5, -0.48, 0.22);

  function makeFinger(lens3, w = 0.4) {
    const root = new THREE.Group();
    const joints = [];
    let parent = root;
    lens3.forEach((L, i) => {
      const j = new THREE.Group();
      if (i > 0) j.position.x = lens3[i - 1];
      parent.add(j);
      joints.push(j);
      part(j, new THREE.CylinderGeometry(w * 0.4, w * 0.4, w * 1.02, 14).rotateX(Math.PI / 2), JOINT, 0, 0, 0, 0.025);
      const last = i === lens3.length - 1;
      if (!last) part(j, new RoundedBoxGeometry(L - 0.14, w * 0.92, w, 3, w * 0.24), TEAL, L / 2, 0, 0, 0.035);
      else {
        part(j, new RoundedBoxGeometry(L * 0.5, w * 0.9, w * 0.98, 3, w * 0.24), TEAL, L * 0.3, 0, 0, 0.035);
        part(j, new RoundedBoxGeometry(0.4, w * 1.0, w * 1.06, 3, w * 0.3), CAP, L * 0.72, 0, 0, 0.035);
        lens(j, L * 0.72 + 0.2, 0, 0, w * 0.37);
      }
      parent = j;
    });
    return { root, joints };
  }
  const fingers = [
    { z: -0.68, l: [0.6, 0.52, 0.52] },
    { z: -0.23, l: [0.66, 0.58, 0.54] },
    { z: 0.23, l: [0.64, 0.55, 0.52] },
    { z: 0.68, l: [0.52, 0.46, 0.46] },
  ].map((d) => {
    const f = makeFinger(d.l);
    f.root.position.set(1.1, 0, d.z);
    f.root.rotation.y = -d.z * 0.22;
    handG.add(f.root);
    return f;
  });
  const thumb = makeFinger([0.55, 0.52], 0.44);
  thumb.root.position.set(0.05, -0.12, 1.0);
  thumb.root.rotation.set(0.35, -0.8, 0);
  handG.add(thumb.root);

  // wrist, forearm rails and cables trailing off-panel (not rolled with the hand)
  const arm = new THREE.Group();
  arm.position.set(-1.25 * 1.15, 0, 0);
  arm.rotation.z = -0.3;
  rig.add(arm);
  const cuff = part(arm, new THREE.CylinderGeometry(0.66, 0.6, 0.6, 22).rotateZ(Math.PI / 2), JOINT, -0.1, 0, 0, 0.035);
  for (const x of [-0.3, 0, 0.3]) part(cuff, new THREE.TorusGeometry(0.66, 0.05, 6, 28).rotateY(Math.PI / 2), METAL, x * 0.6, 0, 0, 0);
  part(arm, new THREE.CylinderGeometry(0.5, 0.56, 16, 20).rotateZ(Math.PI / 2), TEAL, -8.4, 0, 0, 0.045);
  part(arm, new THREE.CylinderGeometry(0.13, 0.13, 16, 10).rotateZ(Math.PI / 2), TEAL_D, -8.5, 0.55, 0.25, 0.025);
  part(arm, new THREE.CylinderGeometry(0.11, 0.11, 16, 10).rotateZ(Math.PI / 2), TEAL_D, -8.5, -0.5, 0.3, 0.025);
  for (const x of [-1.6, -3.4, -5.6]) part(arm, new THREE.TorusGeometry(0.55, 0.07, 8, 28).rotateY(Math.PI / 2), METAL, x, 0, 0, 0.02);
  const cableDefs = [
    [[-0.2, 0.55, 0.35], [-0.9, 1.5, 0.7], [-2.1, 0.8, 0.6], [-2.6, -0.5, 0.4], [-4.2, 0.3, 0.2], [-9, 1.0, 0.1]],
    [[-0.2, -0.5, 0.4], [-1.0, -1.3, 0.6], [-2.3, -0.9, 0.5], [-3.6, 0.2, 0.4], [-9, -0.4, 0.2]],
    [[-0.1, 0.3, -0.5], [-1.4, 1.2, -0.4], [-3.0, 1.4, -0.2], [-5.0, 0.8, -0.2], [-9, 0.6, -0.1]],
    [[-0.4, 0.62, 0.0], [-0.7, 1.2, 0.3], [-1.2, 1.1, 0.5], [-1.4, 0.55, 0.45], [-2.4, 0.5, 0.3], [-9, 0.7, 0.2]],
  ];
  cableDefs.forEach((pts, i) => {
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
    part(arm, new THREE.TubeGeometry(curve, 64, i === 3 ? 0.05 : 0.07, 8), i % 2 ? TEAL_D : TEAL, 0, 0, 0, 0.022);
  });

  // ---------------------------------------------------------------- the runner
  const lightV = new THREE.Vector3();
  const lightW = new THREE.Vector3(0.5, 0.75, 0.6).normalize();
  const runMat = new THREE.ShaderMaterial({
    uniforms: {
      uL: { value: lightV },
      uDark: { value: new THREE.Color('#121a1c') },
      uRim: { value: new THREE.Color('#31b8a4') },
    },
    vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vV;
      void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `uniform vec3 uL, uDark, uRim; varying vec3 vN; varying vec3 vV;
      void main(){
        vec3 n = normalize(vN);
        float f = 1.0 - max(dot(n, normalize(vV)), 0.0);
        float lit = dot(n, uL);
        float rim = step(0.6, f) * step(0.1, lit);          // a hard teal edge-light, comic style
        vec3 c = mix(uDark, uDark * 1.9, step(0.55, lit) * 0.6);
        gl_FragColor = vec4(mix(c, uRim, rim), 1.0);
      }`,
  });
  const runner = new THREE.Group();
  const body = new THREE.Group();
  body.rotation.y = Math.PI / 2; // built facing +z, runs toward +x
  runner.add(body);
  scene.add(runner);

  function limb(parent, r, len, x, y, z) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    g.add(ink(new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 10).translate(0, -len / 2, 0), runMat), 0.02));
    return g;
  }
  const hips = new THREE.Group();
  body.add(hips);
  const spine = new THREE.Group();
  spine.position.y = 0.05;
  hips.add(spine);
  const torso = ink(new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.42, 4, 12).translate(0, 0.33, 0), runMat), 0.02);
  torso.scale.set(1.08, 1, 0.74);
  spine.add(torso);
  const headG = new THREE.Group();
  headG.position.set(0, 0.84, 0.03);
  spine.add(headG);
  const head = ink(new THREE.Mesh(new THREE.SphereGeometry(0.155, 18, 14), runMat), 0.02);
  head.scale.set(0.9, 1.06, 1);
  headG.add(head);
  for (let i = 0; i < 7; i++) {
    const spike = ink(new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.2 + rand() * 0.1, 5), runMat), 0.014);
    spike.position.set((rand() - 0.5) * 0.18, 0.1 + rand() * 0.05, -0.03 - rand() * 0.08);
    spike.rotation.set(-0.7 - rand() * 0.8, 0, (rand() - 0.5) * 0.6);
    headG.add(spike);
  }
  const arms = [-1, 1].map((s) => {
    const upper = limb(spine, 0.058, 0.24, s * 0.25, 0.62, 0);
    const fore = limb(upper, 0.052, 0.22, 0, -0.31, 0);
    fore.add(ink(new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), runMat), 0.016).translateY(-0.3));
    return { upper, fore };
  });
  const shoeMat = toon(TEAL);
  const legs = [-1, 1].map((s) => {
    const thigh = limb(hips, 0.085, 0.34, s * 0.11, 0, 0);
    const shin = limb(thigh, 0.07, 0.36, 0, -0.43, 0);
    const foot = new THREE.Group();
    foot.position.y = -0.45;
    shin.add(foot);
    part(foot, new RoundedBoxGeometry(0.15, 0.13, 0.34, 2, 0.05), shoeMat, 0, -0.02, 0.08, 0.02);
    part(foot, new THREE.BoxGeometry(0.155, 0.04, 0.35), '#eef2ee', 0, -0.085, 0.08, 0.012);
    return { thigh, shin, foot };
  });

  // ---------------------------------------------------------------- shadows, speed lines
  const inkFlat = (opacity = 1) =>
    new THREE.MeshBasicMaterial({ color: INK, transparent: true, opacity, depthWrite: false });
  const runShadow = new THREE.Mesh(new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2), inkFlat(0.85));
  runShadow.position.y = 0.005;
  scene.add(runShadow);
  const handShadow = new THREE.Mesh(new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2), inkFlat(0.3));
  handShadow.position.y = 0.004;
  scene.add(handShadow);

  const strokeTex = canvasTex(512, 32, (g, w, h) => {
    g.fillStyle = '#000';
    g.beginPath();
    g.moveTo(0, h / 2);
    g.quadraticCurveTo(w * 0.55, h * 0.1, w, h * 0.3);
    g.lineTo(w, h * 0.7);
    g.quadraticCurveTo(w * 0.55, h * 0.9, 0, h / 2);
    g.fill();
  });
  const strokeMat = new THREE.MeshBasicMaterial({ map: strokeTex, color: '#ffffff', transparent: true, depthWrite: false });
  const LINES = 52;
  const lineMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), strokeMat, LINES);
  lineMesh.frustumCulled = false;
  scene.add(lineMesh);
  const lines = Array.from({ length: LINES }, (_, i) => {
    const kind = i < 20 ? 'ground' : i < 38 ? 'runner' : 'hand';
    return { kind, u: rand(), rate: 0, y: 0, z: 0, len: 0, th: 0, init: true };
  });
  function spawnLine(l) {
    l.u = l.init ? rand() : 0;
    l.init = false;
    if (l.kind === 'ground') {
      l.y = 0.01 + rand() * 0.05;
      l.z = -1.5 + rand() * 3.5;
      l.len = 1.4 + rand() * 3;
      l.th = 0.05 + rand() * 0.05;
      l.rate = 0.35 + rand() * 0.3;
    } else if (l.kind === 'runner') {
      l.y = 0.25 + rand() * 1.75;
      l.z = -0.4 + rand() * 0.8;
      l.len = 0.6 + rand() * 1.6;
      l.th = 0.025 + rand() * 0.035;
      l.rate = 1.1 + rand() * 1.2;
    } else {
      l.y = (rand() - 0.5) * 2.4;
      l.z = 0.4 + rand() * 0.6;
      l.len = 1.2 + rand() * 2.4;
      l.th = 0.04 + rand() * 0.05;
      l.rate = 0.7 + rand() * 0.8;
    }
  }
  lines.forEach(spawnLine);

  // ---------------------------------------------------------------- impact FX
  const fx = new THREE.Group();
  scene.add(fx);
  const ringMat = inkFlat(1);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 64).rotateX(-Math.PI / 2), ringMat);
  fx.add(ring);
  const burst = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), strokeMat, 14);
  burst.frustumCulled = false;
  fx.add(burst);
  const burstA = Array.from({ length: 14 }, (_, i) => 0.15 + (i / 13) * (Math.PI - 0.3) + (rand() - 0.5) * 0.15);
  const debrisMat = toon(JOINT);
  const debris = Array.from({ length: 14 }, () => {
    const m = ink(new THREE.Mesh(new THREE.TetrahedronGeometry(0.09 + rand() * 0.1), debrisMat), 0.02);
    fx.add(m);
    return { m, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Vector3() };
  });
  const puffMat = toon('#ffffff');
  const puffs = Array.from({ length: 12 }, () => {
    const m = ink(new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), puffMat), 0.06);
    fx.add(m);
    return { m, x: 0, z: 0, dir: 0, size: 0, t: 99, life: 0.8 };
  });
  const crackTex = canvasTex(1024, 256, (g, w, h) => {
    const r = rng(9);
    g.strokeStyle = '#000';
    g.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      let x = w / 2;
      let y = h / 2;
      const a = (i / 9) * Math.PI * 2 + r() * 0.4;
      g.lineWidth = 10 - i * 0.5;
      g.beginPath();
      g.moveTo(x, y);
      for (let s = 0; s < 6; s++) {
        x += Math.cos(a + (r() - 0.5) * 0.9) * (40 + r() * 50);
        y += Math.sin(a + (r() - 0.5) * 0.9) * (12 + r() * 14);
        g.lineTo(x, y);
        g.lineWidth *= 0.8;
      }
      g.stroke();
    }
  });
  const crackMat = new THREE.MeshBasicMaterial({ map: crackTex, color: '#ffffff', transparent: true, depthWrite: false });
  const crack = new THREE.Mesh(new THREE.PlaneGeometry(5, 1.25).rotateX(-Math.PI / 2), crackMat);
  crack.position.y = 0.006;
  fx.add(crack);
  const words = ['THOOM!', 'MISSED!', 'KRAK!', 'NOPE.'].map((wd, i) =>
    canvasTex(512, 256, (g, w, h) => {
      g.translate(w / 2, h / 2);
      g.rotate(i % 2 ? 0.08 : -0.1);
      g.font = '150px Anton, Impact, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineJoin = 'round';
      g.lineWidth = 26;
      g.strokeStyle = '#0d1315';
      g.strokeText(wd, 0, 6);
      g.fillStyle = i === 1 || i === 3 ? '#ff2236' : TEAL;
      g.fillText(wd, 0, 6);
    })
  );
  const wordMat = new THREE.SpriteMaterial({ map: words[0], transparent: true, depthTest: false, depthWrite: false });
  const word = new THREE.Sprite(wordMat);
  word.renderOrder = 10;
  fx.add(word);
  let wordIdx = 0;

  const HIDE = 1e-4;
  ring.scale.setScalar(HIDE);
  crack.scale.setScalar(HIDE);
  word.scale.setScalar(HIDE);

  // ---------------------------------------------------------------- choreography
  const P = { lift: 0, slam: 0, splay: 0, reach: 0 }; // hand
  const J = { h: 0, fx: 0, tuck: 0 }; // runner jump
  const layout = { runnerX: 3.9, handX: -1.6, handY: 2.75, scale: 1, leap: 1 };
  const camBase = new THREE.Vector3();
  const lookBase = new THREE.Vector3();
  let impactX = 0;
  let impactT = 99;
  let landT = 99;
  let stomping = false;
  let queued = false;
  let lungeT = 2.5;
  let phase = 0;
  let look = 0;
  let now = 0;
  let shake = 0;

  function impact() {
    events.impact?.();
    impactT = 0;
    shake = 1;
    ring.position.set(impactX, 0.012, 0.3);
    crack.position.x = impactX;
    crack.scale.setScalar(1);
    crackMat.opacity = 1;
    word.position.set(impactX + 0.4, 2.6, 1.2);
    wordMat.map = words[wordIdx++ % words.length];
    burst.position.set(impactX, 0.25, 1.0);
    for (const d of debris) {
      d.p.set(impactX + (rand() - 0.5) * 2.2, 0.15, 0.3 + (rand() - 0.2) * 1.2);
      d.v.set((rand() - 0.6) * 6, 5 + rand() * 7, (rand() - 0.3) * 3);
      d.r.set(rand() * 10, rand() * 10, rand() * 10);
    }
    puffs.slice(0, 8).forEach((p, i) => {
      p.t = 0;
      p.life = 0.75 + rand() * 0.3;
      p.dir = i % 2 ? 1 : -1;
      p.x = impactX + p.dir * (0.6 + rand() * 1.2);
      p.z = 0.2 + (rand() - 0.5) * 1.2;
      p.size = 0.35 + rand() * 0.35;
    });
  }
  function landPuff() {
    events.land?.();
    landT = 0;
    puffs.slice(8).forEach((p, i) => {
      p.t = 0;
      p.life = 0.5;
      p.dir = i % 2 ? 1 : -1;
      p.x = runner.position.x + p.dir * 0.25;
      p.z = (rand() - 0.5) * 0.4;
      p.size = 0.16 + rand() * 0.1;
    });
  }

  function stomp() {
    stomping = true;
    gsap
      .timeline({
        defaults: { overwrite: 'auto' },
        onComplete: () => {
          stomping = false;
          if (queued) {
            queued = false;
            stomp();
          }
        },
      })
      .call(() => events.windup?.(), null, 0)
      .to(P, { lift: 1, splay: 1, reach: 0, duration: 0.26, ease: 'power2.out' }, 0)
      .to(J, { h: 1, duration: 0.34, ease: 'power2.out' }, 0.14)
      .to(J, { tuck: 1, duration: 0.18, ease: 'power2.out' }, 0.14)
      .to(J, { fx: 1.3, duration: 0.6, ease: 'power2.out' }, 0.14)
      .call(() => (impactX = layout.runnerX - 0.35), null, 0.26)
      .call(() => events.whoosh?.(), null, 0.26)
      .to(P, { slam: 1, duration: 0.15, ease: 'power4.in' }, 0.26)
      .call(impact, null, 0.41)
      .set(P, { lift: 0 }, 0.42)
      .to(J, { h: 0, duration: 0.36, ease: 'power2.in' }, 0.48)
      .to(J, { tuck: 0, duration: 0.3, ease: 'power1.inOut' }, 0.56)
      .call(landPuff, null, 0.84)
      .to(P, { slam: 0, splay: 0, duration: 0.75, ease: 'power2.inOut' }, 0.78)
      .to(J, { fx: 0, duration: 2.4, ease: 'sine.inOut' }, 0.95);
  }
  /** Tap anywhere: the hand slams. Taps during a slam queue one more. */
  function tap() {
    if (stomping) queued = true;
    else stomp();
  }
  function lunge() {
    gsap.to(P, { reach: 1, duration: 0.45, ease: 'power2.out', yoyo: true, repeat: 1, repeatDelay: 0.12 });
  }

  // ---------------------------------------------------------------- update
  const v = new THREE.Vector3();
  const chaseP = new THREE.Vector3();
  const liftP = new THREE.Vector3();
  const slamP = new THREE.Vector3();
  const dummy = new THREE.Object3D();
  const camShake = new THREE.Vector3();

  function update(dt, t, pointer) {
    now = t;
    // ---- idle lunges keep the chase tense even when nobody taps
    lungeT -= dt;
    if (lungeT < 0 && !stomping) {
      lunge();
      lungeT = 3 + rand() * 2.5;
    }

    // ---- hand pose: chase → wind-up → slam
    const bob = Math.sin(t * 2.1) * 0.16 + Math.sin(t * 3.7) * 0.05;
    chaseP.set(layout.handX + P.reach * 1.25 * layout.scale + Math.sin(t * 0.8) * 0.2, layout.handY + bob - P.reach * 0.25, 0);
    liftP.set(chaseP.x - 0.35, chaseP.y + 0.7, -0.2); // a short wind-up that stays in frame
    const drift = impactT < 2 ? Math.min(impactT, 0.6) * SPEED * 0.3 : 0; // ground drags the planted hand back
    slamP.set(impactX - 2.65 * layout.scale - drift, 0.5 * layout.scale, 0.45);
    v.lerpVectors(chaseP, liftP, P.lift).lerp(slamP, P.slam);
    rig.position.copy(v);
    rig.scale.setScalar(layout.scale);
    rig.rotation.z = lerp(lerp(-0.1 + pointer.y * 0.06 - P.reach * 0.08, 0.2, P.lift), -0.03, P.slam);
    tilt.rotation.x = lerp(lerp(1.12 + Math.sin(t * 1.7) * 0.05, 0.9, P.lift), 0.16, P.slam);
    const idleCurl = 0.42 + Math.sin(t * 2.6) * 0.12 - P.reach * 0.25;
    fingers.forEach((f, i) => {
      const c = lerp(lerp(idleCurl + Math.sin(t * 3.1 + i * 1.3) * 0.08, -0.12, P.splay), 0.22, P.slam);
      f.joints[0].rotation.z = -c * 0.55;
      f.joints[1].rotation.z = -c * 0.75;
      f.joints[2].rotation.z = -c * 0.6;
    });
    const tc = lerp(0.35 + Math.sin(t * 2.2) * 0.1, -0.1, P.splay);
    thumb.joints[0].rotation.z = -tc * 0.5;
    thumb.joints[1].rotation.z = -tc * 0.7;
    redMat.color.setRGB(1, 0.13 + 0.08 * Math.sin(t * 6), 0.2);

    // ---- runner: run cycle, blended toward a tucked leap
    phase += dt * 10.5;
    const air = J.tuck;
    for (let s = 0; s < 2; s++) {
      const ph = phase + s * Math.PI;
      const L = legs[s];
      L.thigh.rotation.x = lerp(-Math.sin(ph) * 0.95, s ? -1.5 : -0.9, air);
      L.shin.rotation.x = lerp(0.18 + 1.55 * Math.max(0, Math.cos(ph)), s ? 2.1 : 1.6, air);
      L.foot.rotation.x = lerp(-0.15 + 0.45 * Math.max(0, -Math.sin(ph)), 0.5, air);
      const A = arms[s];
      A.upper.rotation.x = lerp(Math.sin(ph) * 0.95, s ? -2.6 : -2.2, air);
      A.fore.rotation.x = lerp(-1.45 - 0.2 * Math.sin(ph), -0.5, air);
    }
    hips.position.y = 0.98 + Math.cos(phase * 2) * 0.05;
    spine.rotation.x = lerp(0.3, 0.05, air);
    look = damp(look, P.reach > 0.3 || P.lift > 0.2 ? 1 : 0, 6, dt);
    headG.rotation.set(-0.15 + air * 0.2, -1.15 * look, 0);
    runner.position.set(layout.runnerX + (J.fx + P.reach * 0.3) * layout.leap, J.h * 1.85, 0);
    runner.rotation.z = -air * 0.15;

    runShadow.position.x = runner.position.x - 0.05;
    const rs = 0.62 * (1 - J.h * 0.45);
    runShadow.scale.set(rs, 1, rs * 0.25);
    handShadow.position.x = rig.position.x - 0.2;
    const hs = 2.6 - Math.min(rig.position.y, 4) * 0.25;
    handShadow.scale.set(hs, 1, hs * 0.22);
    handShadow.material.opacity = 0.12 + 0.55 * (1 - Math.min(rig.position.y / 4, 1));

    // ---- speed lines
    for (let i = 0; i < LINES; i++) {
      const l = lines[i];
      l.u += dt * l.rate;
      if (l.u >= 1) spawnLine(l);
      const fade = Math.sqrt(Math.sin(Math.PI * l.u));
      let x;
      let y = l.y;
      if (l.kind === 'ground') x = 12 - l.u * 26;
      else if (l.kind === 'runner') {
        x = runner.position.x - 0.5 - l.u * 4.2;
        y += runner.position.y * 0.85;
      } else {
        x = rig.position.x - 1.2 - l.u * 6;
        y += rig.position.y;
      }
      dummy.position.set(x - (l.len * fade) / 2, y, l.z);
      dummy.scale.set(l.len * fade + 1e-4, l.th, 1);
      dummy.updateMatrix();
      lineMesh.setMatrixAt(i, dummy.matrix);
    }
    lineMesh.instanceMatrix.needsUpdate = true;

    // ---- impact FX
    impactT += dt;
    landT += dt;
    const it = impactT;
    if (it < 0.5) {
      ring.scale.setScalar(0.5 + it * 10);
      ringMat.opacity = 1 - it / 0.5;
    } else ring.scale.setScalar(HIDE);
    for (let i = 0; i < 14; i++) {
      const on = it < 0.32;
      const k = it / 0.32;
      const a = burstA[i];
      const dist = 1.1 + k * 3.2;
      const len = on ? (1.3 + (i % 3) * 0.4) * (1 - k) : HIDE;
      dummy.position.set(Math.cos(a) * dist, Math.sin(a) * dist * 0.75, 0);
      dummy.rotation.set(0, 0, a + Math.PI);
      dummy.scale.set(len, on ? 0.12 : HIDE, 1);
      dummy.updateMatrix();
      burst.setMatrixAt(i, dummy.matrix);
    }
    burst.instanceMatrix.needsUpdate = true;
    dummy.rotation.set(0, 0, 0);
    for (const d of debris) {
      if (it > 1.4) {
        d.m.scale.setScalar(HIDE);
        continue;
      }
      d.v.y -= 24 * dt;
      d.p.addScaledVector(d.v, dt);
      d.p.x -= SPEED * dt * 0.6;
      if (d.p.y < 0.08) {
        d.p.y = 0.08;
        d.v.y *= -0.35;
        d.v.x *= 0.6;
      }
      d.m.position.copy(d.p);
      d.m.rotation.set(d.r.x * it, d.r.y * it, d.r.z * it);
      d.m.scale.setScalar(1 - Math.max(0, it - 1) / 0.4);
    }
    for (const p of puffs) {
      p.t += dt;
      if (p.t > p.life) {
        p.m.scale.setScalar(HIDE);
        continue;
      }
      const k = p.t / p.life;
      p.x += (p.dir * 2.2 * (1 - k) - SPEED * 0.55) * dt;
      p.m.position.set(p.x, p.size * 0.8 + k * 0.6, p.z);
      p.m.scale.setScalar(p.size * Math.sin(Math.min(1, k * 1.6) * Math.PI * 0.5) * (1 - k * k));
    }
    if (it < 2.5) {
      crack.position.x -= SPEED * dt;
      crackMat.opacity = Math.min(1, (2.5 - it) / 1.2);
    } else crack.scale.setScalar(HIDE);
    if (it < 0.95) {
      const pop = it < 0.16 ? 1.3 * (it / 0.16) : 1.3 - Math.min(0.3, (it - 0.16) * 2);
      word.scale.set(3.2 * pop, 1.6 * pop, 1);
      wordMat.opacity = it < 0.7 ? 1 : 1 - (it - 0.7) / 0.25;
      word.position.y += dt * 0.5;
    } else word.scale.setScalar(HIDE);

    // ---- camera (with impact shake)
    shake = damp(shake, 0, 7, dt);
    camShake.set((Math.random() - 0.5) * shake * 0.35, (Math.random() - 0.5) * shake * 0.35, 0);
    camera.position.copy(camBase).add(camShake);
    camera.position.x += pointer.x * 0.25;
    camera.position.y += pointer.y * 0.12;
    camera.lookAt(lookBase);
    camera.updateMatrixWorld();
    lightV.copy(lightW).transformDirection(camera.matrixWorldInverse);
  }

  function resize(aspect) {
    camera.aspect = aspect;
    const portrait = aspect < 0.85;
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    if (portrait) {
      // portrait: a smaller hand up in the top-left, the runner well clear of it on the right
      Object.assign(layout, { runnerX: 1.45, handX: -3.4, handY: 3.3, scale: 0.78, leap: 0.4 });
      const d = Math.max(15, 3.7 / (tan * aspect));
      camBase.set(-0.45, 2.6, d);
      lookBase.set(-0.45, 0.9, 0);
    } else {
      Object.assign(layout, { runnerX: 3.9, handX: -1.6, handY: 2.75, scale: 1, leap: 1 });
      const d = Math.max(15, 6.7 / (tan * aspect));
      camBase.set(0.5, 2.2, d);
      lookBase.set(0.5, 1.05, 0);
    }
    camera.updateProjectionMatrix();
  }

  return { scene, camera, state, events, update, resize, tap, bloom: null };
}
