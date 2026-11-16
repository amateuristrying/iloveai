// Scene 2 — "WE LOVE AI AS WELL"
// A head assembled from CRT televisions, grinning with very human teeth.
// Tap the screens: the jaw drops open and a glitch ripples across every tube,
// shoving the whole face into a new colour family.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { rng, damp, toonRamp, canvasTex, GLSL_NOISE } from '../utils.js';
import { PUPIL_COLOR } from './eye.js';

const RAD = new THREE.Vector3(2.15, 2.95, 2.3); // ellipsoid the TVs are packed onto
const MOUTH_Y = -1.62;
const HUES = [0.56, 0.1, 0.34, 0.8]; // cyan/green → magenta → violet → acid yellow

export function createTVScene() {
  const rand = rng(42);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PUPIL_COLOR);
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  const ramp = toonRamp([70, 150, 255]);

  /** intro: 0 → 1 as the scene arrives. chaos: global glitch amount while leaving. */
  /** mouth: forces the jaw wide open. push: dollies the camera into the mouth (scene 2 → 3). */
  const state = { intro: 1, chaos: 0, mouth: 0, push: 0 };
  const events = {}; // sound hooks: clack(strength)
  const camBase = new THREE.Vector3();
  const lookBase = new THREE.Vector3();

  scene.add(new THREE.AmbientLight('#4a3aa8', 1.25));
  const l1 = new THREE.DirectionalLight('#c860ff', 3.4);
  l1.position.set(-6, 3, 5);
  const l2 = new THREE.DirectionalLight('#3f7bff', 3.2);
  l2.position.set(6, 2, 4);
  const l3 = new THREE.DirectionalLight('#ff4fb8', 1.3);
  l3.position.set(0, -6, 3);
  scene.add(l1, l2, l3);

  const pivot = new THREE.Group();
  const head = new THREE.Group();
  pivot.add(head);
  scene.add(pivot);

  // soft halo behind the head
  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: canvasTex(256, 256, (g) => {
        const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
        gr.addColorStop(0, 'rgba(110,70,255,0.55)');
        gr.addColorStop(0.5, 'rgba(70,50,220,0.16)');
        gr.addColorStop(1, 'rgba(40,30,160,0)');
        g.fillStyle = gr;
        g.fillRect(0, 0, 256, 256);
      }),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    })
  );
  halo.scale.setScalar(15);
  halo.position.set(0, 0.4, -4);
  scene.add(halo);

  // ---------------------------------------------------------------- TV layout
  const surf = (yawDeg, pitchDeg) => {
    const yaw = THREE.MathUtils.degToRad(yawDeg);
    const pitch = THREE.MathUtils.degToRad(pitchDeg);
    const p = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiply(RAD);
    const n = new THREE.Vector3(p.x / RAD.x ** 2, p.y / RAD.y ** 2, p.z / RAD.z ** 2).normalize();
    return { p, n };
  };
  const tvs = [];
  const inMouth = (p, w, h) => p.z > 0 && Math.abs(p.x) - w / 2 < 1.62 && p.y - h / 2 < -0.95 && p.y + h / 2 > -2.32;
  const place = (yaw, pitch, w, h, force = false) => {
    const { p, n } = surf(yaw, pitch);
    const rad = Math.hypot(w, h) * 0.5 * 0.8;
    if (!force) {
      if (inMouth(p, w, h)) return false;
      for (const t of tvs) if (t.p.distanceTo(p) < t.rad + rad) return false;
    }
    tvs.push({ p, n, w, h, rad, roll: (rand() - 0.5) * 0.26, lift: rand() * 0.24, seed: rand() });
    return true;
  };
  // the big hero tubes that read as eyes and brow
  place(-30, 5, 1.6, 1.15, true);
  place(31, 2, 1.5, 1.32, true);
  place(-23, 39, 1.3, 0.98, true);
  place(25, 36, 0.98, 1.4, true);
  place(-3, 20, 0.62, 0.56, true);
  for (const size of [1.1, 0.85, 0.66, 0.5, 0.38, 0.28, 0.21]) {
    for (let i = 0; i < 420; i++) {
      const yaw = rand() * 360 - 180;
      const pitch = THREE.MathUtils.radToDeg(Math.asin(rand() * 2 - 1));
      place(yaw, pitch, size * (0.9 + rand() * 0.35), size * (0.72 + rand() * 0.3));
    }
  }

  // free-floating strays orbiting the head
  const strays = [];
  for (let i = 0; i < 18; i++) {
    const a = rand() * Math.PI * 2;
    const r = 3.6 + rand() * 2.3;
    const p = new THREE.Vector3(Math.cos(a) * r * 1.05, Math.sin(a) * r * 0.95, (rand() - 0.5) * 3.5);
    const n = new THREE.Vector3(rand() - 0.5, rand() - 0.5, 1.2).normalize();
    const w = 0.22 + rand() * 0.34;
    strays.push({ p, n, w, h: w * (0.7 + rand() * 0.4), roll: (rand() - 0.5) * 1.6, lift: 0, seed: rand() });
  }

  // ---------------------------------------------------------------- materials
  const bodyMat = new THREE.MeshToonMaterial({ color: '#ffffff', gradientMap: ramp });
  const outlineMat = new THREE.MeshBasicMaterial({ color: '#08061c', side: THREE.BackSide });
  const bezelMat = new THREE.MeshBasicMaterial({ color: '#0b0826' });
  const bodyColors = ['#3d2cc0', '#4c30cf', '#2f2ca6', '#6038d6', '#3142cc', '#27247f'].map((c) => new THREE.Color(c));

  const screenUniforms = {
    uTime: { value: 0 },
    uPower: { value: 1 },
    uShift: { value: HUES[0] },
    uChaos: { value: 0 },
    uTapPos: { value: new THREE.Vector3(0, 0, 9) },
    uTapAge: { value: 99 },
  };
  const screenMat = new THREE.ShaderMaterial({
    uniforms: screenUniforms,
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform vec3 uTapPos; uniform float uTapAge;
      varying vec2 vUv; varying float vSeed; varying float vRipple;
      void main(){
        vUv = uv; vSeed = aSeed;
        float d = distance(instanceMatrix[3].xyz, uTapPos);
        float tt = uTapAge - d * 0.11;                       // the glitch travels outward from the tap
        vRipple = tt > 0. ? exp(-tt * 2.1) * (1.0 - smoothstep(5., 9., d) * .5) : 0.;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uPower, uShift, uChaos;
      varying vec2 vUv; varying float vSeed; varying float vRipple;
      ${GLSL_NOISE}
      vec3 pal(float h){ return .5 + .5 * cos(6.2831853 * (h + vec3(0., .33, .67))); }
      vec3 channel(vec2 uv, float seed, float t, float hue){
        float type = floor(hash11(seed * 7.31) * 6.);
        vec3 a = mix(pal(hue), vec3(1.), .18);
        vec3 c;
        if (type < 1.) {                               // colour bars
          float b = floor(uv.x * 7.);
          c = mix(pal(hue + b / 7. * .45), vec3(1.), .12);
          if (uv.y < .24) c = vec3(hash21(vec2(b, floor(t * 6.))));
        } else if (type < 2.) {                        // snow
          float n = hash21(floor(uv * vec2(70., 54.)) + floor(t * 24.) * 1.7);
          c = mix(vec3(n), a, .42);
        } else if (type < 3.) {                        // drifting "broadcast"
          float n = fbm(uv * vec2(2.4, 4.2) + vec2(t * .16, seed * 9.));
          c = mix(a * .75, vec3(1.), smoothstep(.42, .7, n));
          c = mix(c, a * .35, step(uv.y, .22 + .08 * sin(uv.x * 9. + seed * 20.)));
        } else if (type < 4.) {                        // rolling bands
          float s = step(.5, fract(uv.y * 5. - t * .5 + sin(uv.x * 4. + t) * .08));
          c = mix(a * .45, mix(a, vec3(1.), .25), s);
        } else if (type < 5.) {                        // blown-out glow
          c = mix(a, vec3(1.), .62 - .5 * length(uv - .5));
        } else {                                       // a heart, obviously
          vec2 p = (uv - .5) * 2.7; p.y += .18;
          p /= 1. + .09 * sin(t * 6.);
          float k = p.x * p.x + p.y * p.y - .36;
          float hrt = k * k * k - p.x * p.x * p.y * p.y * p.y;
          c = mix(a * .3, mix(a, vec3(1.), .55), step(hrt, 0.));
        }
        return c;
      }
      void main(){
        float tq = floor(uTime * 16.);
        // every so often a tube misbehaves on its own
        float idle = step(.965, hash21(vec2(vSeed * 91., floor(uTime * 2.5)))) * .8;
        float g = clamp(vRipple + uChaos + idle, 0., 1.);

        vec2 uv = vUv;
        float row = floor(uv.y * mix(8., 22., hash11(tq + vSeed)));
        uv.x += (hash21(vec2(row, tq + vSeed * 10.)) - .5) * g * .7;
        uv.y = fract(uv.y + g * step(.55, hash11(tq * 1.3 + vSeed)) * hash11(tq + vSeed * 3.));
        float hue = uShift + (hash11(vSeed * 3.17) - .5) * .3 + g * (hash11(tq * .7 + vSeed) - .3) * .9;
        float ca = .012 + g * .14;
        vec3 c = vec3(
          channel(uv + vec2(ca, 0.), vSeed, uTime, hue).r,
          channel(uv, vSeed, uTime, hue).g,
          channel(uv - vec2(ca, 0.), vSeed, uTime, hue).b);
        c = mix(c, 1. - c, step(.8, g * hash11(tq * 2.1 + vSeed)));           // negative flashes
        c *= .84 + .16 * sin(vUv.y * 90.);                                   // scanlines
        vec2 q = vUv - .5;
        c *= 1. - dot(q, q) * 1.25;                                          // tube falloff
        c += .13 * smoothstep(.16, 0., abs(vUv.x + vUv.y * .7 - 1.25));      // glass glare

        // CRT power-on: a white line that unrolls into the picture
        float pw = smoothstep(vSeed * .72, vSeed * .72 + .22, uPower);
        float line = step(abs(vUv.y - .5), pw * .5 + .012) * step(.002, pw);
        c = c * line + (1. - pw) * line * 1.6;
        c *= 1.22;
        gl_FragColor = vec4(pow(max(c, 0.), vec3(2.2)), 1.0);
      }`,
  });

  // ---------------------------------------------------------------- batching
  const boxGeo = new RoundedBoxGeometry(1, 1, 1, 3, 0.11);
  const planeGeo = new THREE.PlaneGeometry(1, 1);
  const m4 = new THREE.Matrix4();
  const basis = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const qRoll = new THREE.Quaternion();
  const zAxis = new THREE.Vector3(0, 0, 1);

  function makeBatch(list, parent) {
    const n = list.length;
    const body = new THREE.InstancedMesh(boxGeo, bodyMat, n);
    const outline = new THREE.InstancedMesh(boxGeo, outlineMat, n);
    const bezel = new THREE.InstancedMesh(planeGeo, bezelMat, n);
    const sGeo = planeGeo.clone();
    sGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(new Float32Array(list.map((t) => t.seed)), 1));
    const screen = new THREE.InstancedMesh(sGeo, screenMat, n);
    list.forEach((t, i) => {
      const x = new THREE.Vector3(0, 1, 0).cross(t.n);
      if (x.lengthSq() < 1e-4) x.set(1, 0, 0);
      x.normalize();
      const y = t.n.clone().cross(x);
      q.setFromRotationMatrix(basis.makeBasis(x, y, t.n)).multiply(qRoll.setFromAxisAngle(zAxis, t.roll));
      const d = Math.min(t.w, t.h) * 0.55 + 0.22;
      const front = t.p.clone().addScaledVector(t.n, t.lift + 0.1);
      const centre = front.clone().addScaledVector(t.n, -d / 2);
      body.setMatrixAt(i, m4.compose(centre, q, new THREE.Vector3(t.w, t.h, d)));
      body.setColorAt(i, bodyColors[Math.floor(rand() * bodyColors.length)]);
      outline.setMatrixAt(i, m4.compose(centre, q, new THREE.Vector3(t.w + 0.07, t.h + 0.07, d + 0.07)));
      bezel.setMatrixAt(i, m4.compose(front.clone().addScaledVector(t.n, 0.006), q, new THREE.Vector3(t.w * 0.88, t.h * 0.85, 1)));
      screen.setMatrixAt(i, m4.compose(front.clone().addScaledVector(t.n, 0.014), q, new THREE.Vector3(t.w * 0.8, t.h * 0.75, 1)));
    });
    for (const m of [body, outline, bezel, screen]) {
      m.frustumCulled = false;
      parent.add(m);
    }
  }

  // jaw hinges near the ears; children are authored in head space
  const JAW_PIVOT = new THREE.Vector3(0, -0.9, -0.6);
  const jaw = new THREE.Group();
  jaw.position.copy(JAW_PIVOT);
  const jawInner = new THREE.Group();
  jawInner.position.copy(JAW_PIVOT).negate();
  jaw.add(jawInner);
  head.add(jaw);

  const isJaw = (t) => t.p.y < -1.72 && t.p.z > -0.3;
  makeBatch(tvs.filter((t) => !isJaw(t)), head);
  makeBatch(tvs.filter(isJaw), jawInner);
  const orbit = new THREE.Group();
  pivot.add(orbit);
  makeBatch(strays, orbit);

  // dark core that fills the gaps between sets
  const core = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 28), new THREE.MeshToonMaterial({ color: '#17114a', gradientMap: ramp }));
  core.scale.copy(RAD).multiplyScalar(0.9);
  head.add(core);

  // cables dangling from the neck
  const cableMat = new THREE.MeshToonMaterial({ color: '#2a1f8c', gradientMap: ramp });
  for (let i = 0; i < 9; i++) {
    const a = rand() * Math.PI * 2;
    const r = 0.3 + rand() * 0.75;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r - 0.3;
    const len = 1.6 + rand() * 2.4;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(x, -2.5, z),
      new THREE.Vector3(x * 1.4 + (rand() - 0.5) * 0.5, -2.9 - len * 0.4, z * 1.3),
      new THREE.Vector3(x * 1.2 + (rand() - 0.5) * 0.9, -2.9 - len, z + (rand() - 0.5) * 0.7),
    ]);
    head.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 18, 0.035 + rand() * 0.04, 6), cableMat));
  }

  // ---------------------------------------------------------------- mouth
  const toothAt = (phi, y, out = 1.035) => {
    const s = Math.sqrt(1 - (y / RAD.y) ** 2) * out;
    const a = RAD.x * s;
    const c = RAD.z * s;
    return {
      p: new THREE.Vector3(a * Math.sin(phi), y, c * Math.cos(phi)),
      n: new THREE.Vector3(Math.sin(phi) / a, 0, Math.cos(phi) / c).normalize(),
    };
  };
  const toothGeo = new RoundedBoxGeometry(1, 1, 1, 4, 0.2);
  const toothMat = new THREE.MeshToonMaterial({ color: '#7a6644', emissive: '#f0b060', emissiveIntensity: 0.95, gradientMap: ramp });
  const toothOutline = new THREE.MeshBasicMaterial({ color: '#3a1208', side: THREE.BackSide });
  function teethRow(count, spread, upper, parent) {
    const mesh = new THREE.InstancedMesh(toothGeo, toothMat, count);
    const line = new THREE.InstancedMesh(toothGeo, toothOutline, count);
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < count; i++) {
      const k = (i - (count - 1) / 2) / ((count - 1) / 2); // -1..1
      const central = Math.abs(k) < 0.25;
      const h = (upper ? 0.5 : 0.42) * (central ? 1.14 : 1 - Math.abs(k) * 0.2) * (0.94 + rand() * 0.12);
      const w = (upper ? 0.3 : 0.27) * (central && upper ? 1.12 : 1);
      const y = MOUTH_Y + (upper ? h / 2 - 0.015 : -h / 2 + 0.015);
      const { p, n } = toothAt(k * spread, y);
      const x = up.clone().cross(n).normalize();
      q.setFromRotationMatrix(basis.makeBasis(x, up, n)).multiply(qRoll.setFromAxisAngle(zAxis, (rand() - 0.5) * 0.09));
      mesh.setMatrixAt(i, m4.compose(p, q, new THREE.Vector3(w, h, 0.22)));
      line.setMatrixAt(i, m4.compose(p, q, new THREE.Vector3(w + 0.045, h + 0.045, 0.25)));
    }
    mesh.frustumCulled = line.frustumCulled = false;
    parent.add(mesh, line);
  }
  const upperMark = new THREE.Object3D();
  upperMark.position.set(0, MOUTH_Y - 0.02, 2.05);
  head.add(upperMark);
  const lowerMark = new THREE.Object3D();
  lowerMark.position.set(0, MOUTH_Y + 0.02, 2.0);
  jawInner.add(lowerMark);
  teethRow(10, 0.82, true, head);
  teethRow(10, 0.76, false, jawInner);

  const gumMat = new THREE.MeshToonMaterial({ color: '#5c0f20', emissive: '#7a1226', emissiveIntensity: 0.7, gradientMap: ramp });
  const gum = (y, spread, parent) => {
    const pts = [];
    for (let i = 0; i <= 16; i++) pts.push(toothAt((i / 16 - 0.5) * 2 * spread, y, 1.0).p);
    const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.17, 10), gumMat);
    parent.add(m);
  };
  gum(MOUTH_Y + 0.56, 0.98, head);
  gum(MOUTH_Y - 0.5, 0.9, jawInner);

  const throat = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshBasicMaterial({ color: '#1c0512' }));
  throat.position.set(0, MOUTH_Y - 0.1, 0.72);
  throat.scale.set(1.62, 0.95, 1.1);
  head.add(throat);

  // what it keeps in its mouth
  const heartMat = new THREE.ShaderMaterial({
    uniforms: { uTime: screenUniforms.uTime, uOpen: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uOpen; varying vec2 vUv;
      void main(){
        vec2 p = (vUv - .5) * vec2(3.2, 2.5); p.y += .2;
        p /= 1. + .12 * sin(uTime * 7.);
        float k = p.x*p.x + p.y*p.y - .36;
        float h = step(k*k*k - p.x*p.x*p.y*p.y*p.y, 0.);
        vec3 c = mix(vec3(.10,.0,.05), vec3(1.,.28,.55), h);
        c *= (.82 + .18 * sin(vUv.y * 70.)) * (.15 + 1.25 * uOpen);
        gl_FragColor = vec4(pow(c, vec3(2.2)), 1.);
      }`,
  });
  const heart = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.8), heartMat);
  heart.position.set(0, MOUTH_Y - 0.42, 1.84);
  heart.rotation.x = -0.2;
  head.add(heart);

  // invisible proxy for tap raycasts
  const proxy = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial());
  proxy.scale.copy(RAD).multiplyScalar(1.06);
  proxy.visible = false;
  head.add(proxy);

  // drifting debris
  const dustGeo = new THREE.BufferGeometry();
  const dust = new Float32Array(260 * 3);
  for (let i = 0; i < 260; i++) {
    const a = rand() * Math.PI * 2;
    const r = 3.4 + rand() * 6;
    dust.set([Math.cos(a) * r, (rand() - 0.5) * 11, Math.sin(a) * r * 0.6 - 1], i * 3);
  }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dust, 3));
  const dustPts = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: '#7d6dff', size: 0.07, transparent: true, opacity: 0.7, depthWrite: false }));
  scene.add(dustPts);

  // ---------------------------------------------------------------- interaction
  const raycaster = new THREE.Raycaster();
  const local = new THREE.Vector3();
  let open = 0;
  let vel = 0;
  let held = false;
  let holdUntil = 0;
  let tapTime = -99;
  let now = 0;
  let hueIdx = 0;
  let shiftTarget = HUES[0];
  let shift = HUES[0];
  let rotX = 0;
  let rotY = 0;

  /** ndc: THREE.Vector2 of the tap. Opens the jaw and launches a glitch ripple from that spot. */
  function tap(ndc) {
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObject(proxy)[0];
    if (hit) local.copy(hit.point);
    else raycaster.ray.closestPointToPoint(pivot.position, local);
    head.worldToLocal(local);
    screenUniforms.uTapPos.value.copy(local);
    tapTime = now;
    held = true;
    holdUntil = now + 0.6;
    hueIdx = (hueIdx + 1) % HUES.length;
    shiftTarget += (((HUES[hueIdx] - shiftTarget) % 1) + 1) % 1 || 1;
  }
  function release() {
    held = false;
  }

  const uw = new THREE.Vector3();
  const lw = new THREE.Vector3();
  const mouthC = new THREE.Vector3();
  const camEnd = new THREE.Vector3();
  const camOff = new THREE.Vector3(0, 0.05, 1.05);
  const look = new THREE.Vector3();
  const mp = new THREE.Vector3();
  const mOut = { x: 0.5, y: 0.5, r: 0, squash: 1.8 };

  /**
   * Where the open mouth sits on screen (uv 0..1), and its half-height in screen heights.
   * The wipe into scene 3 is pinned to this, like the eye's pupil for scene 2.
   */
  function mouthScreen() {
    const halfH = uw.distanceTo(lw) * 0.5 * 0.8;
    const d = mouthC.distanceTo(camera.position);
    mp.copy(mouthC).project(camera);
    mOut.x = mp.x * 0.5 + 0.5;
    mOut.y = mp.y * 0.5 + 0.5;
    mOut.r = halfH / d / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    return mOut;
  }

  function update(dt, t, pointer) {
    now = t;
    const k = state.intro;
    const ease = 1 - Math.pow(1 - k, 3);

    // jaw on an under-damped spring so it clacks
    const want = Math.max(held || t < holdUntil ? 1 : 0, state.mouth * 1.5);
    vel += ((want - open) * 190 - vel * 12) * dt;
    open += vel * dt;
    if (open < -0.04) {
      if (vel < -1.2) events.clack?.(Math.min(1, -vel / 9)); // teeth meet (each bounce clacks again)
      open = -0.04;
      vel *= -0.4; // teeth clack shut
    }
    jaw.rotation.x = open * 0.44 + Math.max(0, Math.sin(t * 1.7)) * 0.012;
    heartMat.uniforms.uOpen.value = THREE.MathUtils.clamp(open, 0, 1);

    shift = damp(shift, shiftTarget, 3.2, dt);
    screenUniforms.uTime.value = t;
    screenUniforms.uPower.value = k * 1.25;
    screenUniforms.uShift.value = shift;
    screenUniforms.uChaos.value = state.chaos;
    screenUniforms.uTapAge.value = t - tapTime;

    rotY = damp(rotY, pointer.x * 0.3, 3, dt);
    rotX = damp(rotX, -pointer.y * 0.16, 3, dt);
    // while diving in, ease the head square-on to the camera so we go straight down the throat
    const free = 1 - state.push;
    pivot.rotation.y = (rotY + (1 - ease) * -1.1 + Math.sin(t * 0.4) * 0.05) * free;
    pivot.rotation.x = (rotX - Math.max(open, 0) * 0.09) * free;
    pivot.rotation.z = Math.sin(t * 0.55) * 0.025 * free;
    pivot.position.y = 0.6 + Math.sin(t * 0.8) * 0.12 * free;
    pivot.scale.setScalar(0.5 + 0.5 * ease);
    const kick = Math.exp(-(t - tapTime) * 7) * 0.05;
    head.scale.setScalar(1 + kick);

    orbit.rotation.z = t * 0.05;
    orbit.rotation.y = Math.sin(t * 0.23) * 0.25;
    dustPts.rotation.y = t * 0.02;
    dustPts.position.y = Math.sin(t * 0.2) * 0.3;
    halo.material.opacity = 0.75 + 0.25 * Math.sin(t * 2.3) + Math.exp(-(t - tapTime) * 4) * 0.6;

    // camera: from its resting framing, dolly in toward the mouth opening
    pivot.updateMatrixWorld(true);
    upperMark.getWorldPosition(uw);
    lowerMark.getWorldPosition(lw);
    mouthC.addVectors(uw, lw).multiplyScalar(0.5);
    const p = state.push;
    camEnd.copy(mouthC).add(camOff);
    camera.position.lerpVectors(camBase, camEnd, p);
    look.lerpVectors(lookBase, mouthC, Math.min(1, p * 1.6));
    camera.lookAt(look);
    camera.updateMatrixWorld();
  }

  function resize(aspect) {
    camera.aspect = aspect;
    const tall = aspect < 0.85; // on phones the title sits underneath, so lift the head
    const y = tall ? -2.2 : -0.35;
    camBase.set(0, y, 13.5 * Math.max(1, 0.78 / aspect));
    lookBase.set(0, y, 0);
    camera.position.copy(camBase);
    camera.lookAt(lookBase);
    camera.updateProjectionMatrix();
  }

  return { scene, camera, state, events, update, resize, tap, release, mouthScreen, bloom: { strength: 0.62, radius: 0.55, threshold: 0.62 } };
}
