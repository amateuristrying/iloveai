// Scene 1 add-on: the eye's laser.
// Tap the plaza → the eye snaps onto the spot, its pupil charges, a beam fires,
// and the blast vaporises whoever stood there. Everyone nearby is thrown with
// simple rigid-body physics (tumble, bounce, slide), lies dazed, then gets up and
// walks back to their place in the crowd. The vaporised respawn a little later.

import * as THREE from 'three';
import { canvasTex, GLSL_NOISE, rng, damp } from '../utils.js';

const COM = 0.95; // centre-of-mass height of a standing figure (unscaled units)
const LIE = 0.22; // centre-of-mass height when lying flat
const KILL_R = 1.35;
const BLAST_R = 4.6;
const PANIC_R = 9;
const G = 18;

const CHARGE = 0.26; // pupil charge time before the beam fires
const EXTEND = 0.07; // beam travel time
const IDLE = 0;
const FLY = 1;
const DOWN = 2;
const GETUP = 3;
const DEAD = 4;
const RESPAWN = 5;

const smooth = (x) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};
const backOut = (x) => {
  const c = 1.9;
  const t = Math.min(1, x) - 1;
  return 1 + (c + 1) * t * t * t + c * t * t;
};

export function createEyeBlast({ scene, spots, officer, figMat, events = {} }) {
  const rand = rng(77);
  const Y = new THREE.Vector3(0, 1, 0);
  const OFF = new THREE.Matrix4().makeTranslation(0, -COM, 0);
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

  // ------------------------------------------------------------------ bodies
  const bodies = spots.map((s) => ({
    home: new THREE.Vector3(s.x, 0, s.z),
    rot: s.rot,
    phase: s.phase,
    s: s.s,
    mesh: s.mesh,
    i: s.i,
  }));
  officer.matrixAutoUpdate = false;
  bodies.push({ home: officer.position.clone(), rot: officer.rotation.y, phase: 0, s: officer.scale.x, mesh: officer, i: -1, calm: true });
  for (const b of bodies) {
    Object.assign(b, {
      mode: IDLE,
      t: 0,
      p: new THREE.Vector3(b.home.x, COM * b.s, b.home.z),
      v: new THREE.Vector3(),
      q: new THREE.Quaternion().setFromAxisAngle(Y, b.rot),
      w: new THREE.Vector3(),
      qFrom: new THREE.Quaternion(),
      qTo: new THREE.Quaternion(),
      qRest: new THREE.Quaternion().setFromAxisAngle(Y, b.rot),
      pFrom: new THREE.Vector3(),
      fo: new THREE.Vector3(), // flinch offset (springs back)
      fv: new THREE.Vector3(),
      hy: 0, // flinch hop
      hv: 0,
      bounces: 0,
      wait: 0,
      dur: 0,
    });
  }
  const batches = [...new Set(spots.map((s) => s.mesh))];

  // ------------------------------------------------------------------ shared bits
  const glowTex = canvasTex(128, 128, (g) => {
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.22, 'rgba(255,255,255,0.55)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
  });
  const additive = (color) =>
    new THREE.SpriteMaterial({ map: glowTex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  const uTime = { value: 0 };

  // ------------------------------------------------------------------ beam
  const beamMat = new THREE.ShaderMaterial({
    uniforms: { uI: { value: 0 }, uLen: { value: 10 }, uTime },
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uI, uLen, uTime; varying vec2 vUv;
      ${GLSL_NOISE}
      void main(){
        float y = abs(vUv.y - .5) * 2.;
        float n = vnoise(vec2(vUv.x * uLen * 2.5 - uTime * 55., vUv.y * 3.));
        float core = exp(-y * y * 70.);
        float glow = exp(-y * y * 7.) * (.55 + .45 * n);
        float ends = smoothstep(0., .02, vUv.x) * smoothstep(1., .985, vUv.x);
        vec3 c = vec3(8., 7., 7.5) * core + vec3(3.4, .22, .85) * glow;
        gl_FragColor = vec4(c * uI * ends, 1.);
      }`,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
  });
  const beam = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).translate(0.5, 0, 0), beamMat);
  beam.matrixAutoUpdate = false;
  beam.frustumCulled = false;
  beam.renderOrder = 20;
  scene.add(beam);
  const muzzle = new THREE.Sprite(additive(new THREE.Color(5, 0.6, 1.6)));
  const muzzleCore = new THREE.Sprite(additive(new THREE.Color(6, 5, 5.5)));
  const hitGlow = new THREE.Sprite(additive(new THREE.Color(3.5, 0.5, 1.4)));
  for (const s of [muzzle, muzzleCore, hitGlow]) {
    s.renderOrder = 21;
    s.scale.setScalar(1e-4);
    scene.add(s);
  }
  // energy streaming into the pupil while it charges
  const CH_N = 28;
  const chargeGeo = new THREE.BufferGeometry();
  chargeGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(CH_N * 3), 3));
  const chargePts = new THREE.Points(
    chargeGeo,
    new THREE.PointsMaterial({ map: glowTex, color: new THREE.Color(4, 0.5, 1.4), size: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })
  );
  chargePts.frustumCulled = false;
  scene.add(chargePts);
  const chargeDirs = Array.from({ length: CH_N }, () =>
    new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize().multiplyScalar(1.6 + rand() * 1.8)
  );
  const chargeOff = chargeDirs.map(() => rand());

  // ------------------------------------------------------------------ explosion pieces
  const flash = new THREE.Sprite(additive(new THREE.Color(3.2, 1.6, 2.2)));
  flash.renderOrder = 22;
  flash.scale.setScalar(1e-4);
  scene.add(flash);

  const ringHot = new THREE.Mesh(
    new THREE.RingGeometry(0.86, 1, 72).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.4, 1.3), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false })
  );
  const ringInk = new THREE.Mesh(
    new THREE.RingGeometry(0.93, 1, 72).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: '#0b0f33', transparent: true, depthWrite: false })
  );
  for (const r of [ringHot, ringInk]) {
    r.position.y = 0.09;
    r.scale.setScalar(1e-4);
    scene.add(r);
  }

  // scorch marks (navy blotch with painted rays) + glowing embers, a small pool
  const scorchTex = canvasTex(512, 512, (g, w, h) => {
    const r = rng(12);
    g.translate(w / 2, h / 2);
    g.fillStyle = 'rgba(11,15,51,1)';
    for (let i = 0; i < 26; i++) {
      const a = r() * Math.PI * 2;
      const len = 110 + r() * 140;
      const wd = 0.05 + r() * 0.08;
      g.beginPath();
      g.moveTo(Math.cos(a - wd) * 60, Math.sin(a - wd) * 60);
      g.lineTo(Math.cos(a) * len, Math.sin(a) * len);
      g.lineTo(Math.cos(a + wd) * 60, Math.sin(a + wd) * 60);
      g.fill();
    }
    g.beginPath();
    for (let i = 0; i <= 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      const rr = 95 + (r() - 0.5) * 30;
      g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    g.fill();
  });
  const emberTex = canvasTex(256, 256, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.35, 'rgba(255,255,255,0.7)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  });
  const scorches = Array.from({ length: 6 }, () => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(4.6, 4.6).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: scorchTex, color: '#ffffff', transparent: true, opacity: 0, depthWrite: false })
    );
    const e = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 2.6).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: emberTex, color: new THREE.Color(3.5, 0.35, 1), blending: THREE.AdditiveBlending, transparent: true, opacity: 0, depthWrite: false })
    );
    m.position.y = 0.05;
    e.position.y = 0.055;
    scene.add(m, e);
    return { m, e, t: 99 };
  });
  let scorchIdx = 0;

  // fireball + dust puffs: cel-shaded, colour by age (white-hot → pink → navy smoke),
  // and they crumble away through noise at the end of life
  const PUFFS = 72;
  const puffAge = new THREE.InstancedBufferAttribute(new Float32Array(PUFFS), 1);
  const puffSeed = new THREE.InstancedBufferAttribute(new Float32Array(PUFFS).map(() => rand()), 1);
  puffAge.setUsage(THREE.DynamicDrawUsage);
  const puffGeo = new THREE.IcosahedronGeometry(1, 2);
  puffGeo.setAttribute('aAge', puffAge);
  puffGeo.setAttribute('aSeed', puffSeed);
  const puffMat = new THREE.ShaderMaterial({
    uniforms: { uL: { value: new THREE.Vector3(-0.5, 0.8, 0.35).normalize() } },
    vertexShader: /* glsl */ `
      attribute float aAge; attribute float aSeed;
      varying vec3 vN; varying vec3 vP; varying float vAge; varying float vSeed;
      void main(){
        vN = normalize(mat3(modelMatrix * instanceMatrix) * normal);
        vP = position; vAge = aAge; vSeed = aSeed;
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uL; varying vec3 vN; varying vec3 vP; varying float vAge; varying float vSeed;
      ${GLSL_NOISE}
      void main(){
        float n = vnoise(vP.xy * 2.6 + vSeed * 17.) * .55 + vnoise(vP.yz * 3.3 - vSeed * 9.) * .45;
        float cut = smoothstep(.5, 1., vAge) * 1.05;
        if (n < cut) discard;
        float lit = step(.12, dot(normalize(vN), uL));
        vec3 hot = vec3(7., 6., 6.5);
        vec3 pink = vec3(3.4, .3, .9);
        vec3 smoke = mix(vec3(.035, .045, .19), vec3(.3, .36, .78), lit);
        vec3 c = vAge < .1 ? hot : vAge < .28 ? mix(pink, hot, lit * .35) : smoke;
        c = mix(c, vec3(3., .25, .8), step(n, cut + .06) * step(.28, vAge) * (1. - smoothstep(.6, .9, vAge)));  // ember rim
        gl_FragColor = vec4(c, 1.);
      }`,
  });
  const puffMesh = new THREE.InstancedMesh(puffGeo, puffMat, PUFFS);
  puffMesh.frustumCulled = false;
  scene.add(puffMesh);
  const puffs = Array.from({ length: PUFFS }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), size: 1, t: 99, life: 1, a0: 0, delay: 0 }));
  let puffIdx = 0;
  const spawnPuff = (x, y, z, vx, vy, vz, size, life, a0 = 0, delay = 0) => {
    const p = puffs[puffIdx++ % PUFFS];
    p.p.set(x, y, z);
    p.v.set(vx, vy, vz);
    Object.assign(p, { size, life, a0, delay, t: 0 });
  };

  // sparks: hot streaks stretched along their velocity
  const SPARKS = 90;
  const sparkMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0, -0.5), new THREE.MeshBasicMaterial({ color: '#ffffff' }), SPARKS);
  sparkMesh.frustumCulled = false;
  const sparkHot = new THREE.Color(6, 3.2, 4.2);
  const sparkPink = new THREE.Color(4.2, 0.35, 1.2);
  for (let i = 0; i < SPARKS; i++) sparkMesh.setColorAt(i, i % 3 ? sparkPink : sparkHot);
  scene.add(sparkMesh);
  const sparks = Array.from({ length: SPARKS }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), t: 99, life: 1 }));
  let sparkIdx = 0;

  // chunks: what's left of the vaporised (crowd-coloured, tumbling, casting shadows)
  const CHUNKS = 90;
  const chunkMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), figMat, CHUNKS);
  chunkMesh.castShadow = true;
  chunkMesh.frustumCulled = false;
  scene.add(chunkMesh);
  const chunks = Array.from({ length: CHUNKS }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), size: 0.2, t: 99, life: 2.5 }));
  let chunkIdx = 0;

  // ------------------------------------------------------------------ physics helpers
  const tmp = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const axis = new THREE.Vector3();
  const dq = new THREE.Quaternion();
  const m4 = new THREE.Matrix4();
  const sv = new THREE.Vector3();
  const eul = new THREE.Euler();

  function toDown(b) {
    b.mode = DOWN;
    b.t = 0;
    b.qFrom.copy(b.q);
    tmp.copy(Y).applyQuaternion(b.q);
    tmp.y = 0;
    if (tmp.lengthSq() < 1e-4) tmp.set(rand() - 0.5, 0, rand() - 0.5);
    tmp.normalize();
    b.qTo.setFromUnitVectors(Y, tmp); // lie down along whichever way the body was falling
    b.wait = 1.4 + rand() * 2;
  }
  function toGetUp(b) {
    b.mode = GETUP;
    b.t = 0;
    b.qFrom.copy(b.q);
    b.pFrom.copy(b.p);
    const dx = b.home.x - b.p.x;
    const dz = b.home.z - b.p.z;
    b.qTo.setFromAxisAngle(Y, Math.atan2(dx, dz)); // face home and walk back
    b.dur = 0.8 + Math.hypot(dx, dz) / 2.3;
  }
  function kill(b, c) {
    b.mode = DEAD;
    b.t = 0;
    b.wait = 6 + rand() * 5;
    for (let k = 0; k < 6; k++) {
      const ch = chunks[chunkIdx++ % CHUNKS];
      dir.set(b.p.x - c.x + (rand() - 0.5) * 1.5, 0, b.p.z - c.z + (rand() - 0.5) * 1.5).normalize();
      ch.p.set(b.p.x + (rand() - 0.5) * 0.3, 0.4 + rand() * 1.2, b.p.z + (rand() - 0.5) * 0.3);
      ch.v.set(dir.x * (4 + rand() * 7), 6 + rand() * 9, dir.z * (4 + rand() * 7));
      ch.w.set(rand() * 14, rand() * 14, rand() * 14);
      ch.size = (0.12 + rand() * 0.16) * b.s;
      ch.t = 0;
      ch.life = 1.8 + rand() * 1.2;
    }
  }

  /** Apply the blast at ground point c to every body. */
  function blast(c) {
    for (const b of bodies) {
      if (b.mode === DEAD || b.mode === RESPAWN) continue;
      const dx = b.p.x - c.x;
      const dz = b.p.z - c.z;
      const d = Math.hypot(dx, dz);
      if (d < KILL_R) {
        kill(b, c);
        continue;
      }
      if (d < BLAST_R) {
        const f = 1 - (d - KILL_R) / (BLAST_R - KILL_R); // 1 at the edge of the kill zone
        dir.set(dx / d, 0, dz / d);
        if (b.mode === IDLE) b.p.set(b.home.x + b.fo.x, b.p.y, b.home.z + b.fo.z);
        b.v.set(
          dir.x * (2.5 + 10 * f) + (rand() - 0.5) * 1.5,
          4 + 10 * f * f + rand() * 2,
          dir.z * (2.5 + 10 * f) + (rand() - 0.5) * 1.5
        );
        axis.crossVectors(Y, dir).normalize(); // tumble head-over-heels away from the blast
        b.w.copy(axis).multiplyScalar(4 + 10 * f).add(tmp.set(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(4));
        b.mode = FLY;
        b.bounces = 0;
        b.t = 0;
        continue;
      }
      if (d < PANIC_R && (b.mode === IDLE || b.mode === GETUP)) {
        const f = 1 - (d - BLAST_R) / (PANIC_R - BLAST_R);
        b.fv.x += (dx / d) * 4.5 * f;
        b.fv.z += (dz / d) * 4.5 * f;
        if (b.mode === IDLE) b.hv = Math.max(b.hv, 1.5 + 3.5 * f);
      }
    }
  }

  function explode(c) {
    flashT = 0;
    flash.position.set(c.x, 0.8, c.z);
    hitGlow.position.set(c.x, 0.3, c.z);
    ringHot.position.x = ringInk.position.x = c.x;
    ringHot.position.z = ringInk.position.z = c.z;
    ringT = 0;
    shake = 1;
    const sc = scorches[scorchIdx++ % scorches.length];
    sc.m.position.x = sc.e.position.x = c.x;
    sc.m.position.z = sc.e.position.z = c.z;
    sc.m.rotation.y = rand() * Math.PI * 2;
    sc.t = 0;
    // fireball
    for (let i = 0; i < 8; i++) {
      const a = rand() * Math.PI * 2;
      const r = rand() * 0.7;
      spawnPuff(c.x + Math.cos(a) * r, 0.4 + rand() * 0.6, c.z + Math.sin(a) * r, Math.cos(a) * 1.8, 2.2 + rand() * 2.5, Math.sin(a) * 1.8, 0.5 + rand() * 0.45, 0.6 + rand() * 0.35);
    }
    // a rising smoke column, a beat later
    for (let i = 0; i < 4; i++) {
      spawnPuff(c.x + (rand() - 0.5) * 0.5, 0.9 + i * 0.35, c.z + (rand() - 0.5) * 0.5, (rand() - 0.5) * 0.5, 1.4 + rand() * 0.6, (rand() - 0.5) * 0.5, 0.45 + rand() * 0.3, 1.1 + rand() * 0.4, 0.3, 0.1 + i * 0.07);
    }
    // a ring of dust rolling outward along the ground
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + rand() * 0.3;
      const sp = 6 + rand() * 3;
      spawnPuff(c.x + Math.cos(a) * 0.8, 0.25, c.z + Math.sin(a) * 0.8, Math.cos(a) * sp, 0.3, Math.sin(a) * sp, 0.28 + rand() * 0.2, 0.6 + rand() * 0.3, 0.3);
    }
    for (let i = 0; i < 40; i++) {
      const sp = sparks[sparkIdx++ % SPARKS];
      const a = rand() * Math.PI * 2;
      const up = 0.25 + rand() * 0.75;
      const s = 7 + rand() * 13;
      sp.p.set(c.x, 0.3, c.z);
      sp.v.set(Math.cos(a) * s * (1 - up * 0.6), s * up, Math.sin(a) * s * (1 - up * 0.6));
      sp.t = 0;
      sp.life = 0.45 + rand() * 0.5;
    }
    blast(c);
  }

  // ------------------------------------------------------------------ the shot
  const shot = { t: 99, target: new THREE.Vector3(), queued: null, impacted: true };
  const origin = new THREE.Vector3();
  const end = new THREE.Vector3();
  const side = new THREE.Vector3();
  const nrm = new THREE.Vector3();
  const ax = new THREE.Vector3();
  let flashT = 99;
  let ringT = 99;
  let shake = 0;
  let kick = 0;
  let lastFire = -99;
  let now = 0;

  /** Fire at a ground point. A tap while the pupil is still charging queues the next shot. */
  function fire(point) {
    if (shot.t < CHARGE + EXTEND) {
      shot.queued = point.clone();
      return;
    }
    shot.t = 0;
    shot.impacted = false;
    shot.beamed = false;
    shot.target.copy(point);
    lastFire = now;
    events.charge?.();
  }

  /**
   * getOrigin(out): world position of the pupil. Called every frame while the beam is live,
   * so the beam stays glued to the eye as it bobs and recoils.
   */
  function update(dt, t, camera, getOrigin) {
    now = t;
    uTime.value = t;
    shot.t += dt;
    const st = shot.t;
    getOrigin(origin);

    // pupil charge, beam, impact
    const charge = st < CHARGE ? smooth(st / CHARGE) : Math.max(0, 1 - (st - CHARGE - 0.12) / 0.4);
    const beamOn = st >= CHARGE ? Math.min(1, (st - CHARGE) / EXTEND) : 0;
    const beamI = st < CHARGE ? 0 : st < CHARGE + 0.3 ? 1 : Math.max(0, 1 - (st - CHARGE - 0.3) / 0.3);
    if (!shot.beamed && st >= CHARGE) {
      shot.beamed = true;
      events.beam?.();
    }
    if (!shot.impacted && st >= CHARGE + EXTEND) {
      shot.impacted = true;
      events.boom?.();
      kick = 1;
      explode(shot.target);
      if (shot.queued) {
        const q = shot.queued;
        shot.queued = null;
        setTimeout(() => fire(q), 90);
      }
    }
    kick = damp(kick, 0, 6, dt);

    if (beamI > 0.001) {
      end.lerpVectors(origin, shot.target, beamOn);
      ax.subVectors(end, origin);
      const L = Math.max(ax.length(), 1e-3);
      ax.divideScalar(L);
      side.crossVectors(ax, tmp.subVectors(camera.position, origin)).normalize();
      nrm.crossVectors(side, ax);
      const width = (0.55 + 0.12 * Math.sin(t * 90)) * (0.4 + 0.6 * beamI);
      beam.matrix.makeBasis(ax.clone().multiplyScalar(L), side.clone().multiplyScalar(width), nrm).setPosition(origin);
      beam.matrixWorldNeedsUpdate = true;
      beamMat.uniforms.uI.value = beamI;
      beamMat.uniforms.uLen.value = L;
      hitGlow.position.copy(end).y += 0.2;
      hitGlow.scale.setScalar(beamOn >= 1 ? 1.7 * beamI + Math.sin(t * 70) * 0.2 : 1e-4);
    } else {
      beamMat.uniforms.uI.value = 0;
      hitGlow.scale.setScalar(1e-4);
    }
    muzzle.position.copy(origin);
    muzzleCore.position.copy(origin);
    muzzle.scale.setScalar(1e-4 + charge * 2.4 + beamI * 1.6 + Math.sin(t * 60) * 0.12 * charge);
    muzzleCore.scale.setScalar(1e-4 + charge * 0.9 + beamI * 0.9);

    // charge particles stream in toward the pupil
    const cp = chargeGeo.attributes.position;
    for (let i = 0; i < CH_N; i++) {
      const k = (chargeOff[i] + st * 3.2) % 1;
      const r = st < CHARGE ? 1 - k : 0;
      tmp.copy(chargeDirs[i]).multiplyScalar(r).add(origin);
      cp.setXYZ(i, tmp.x, tmp.y, tmp.z);
    }
    cp.needsUpdate = true;
    chargePts.material.opacity = st < CHARGE ? 1 : 0;

    // flash + rings
    flashT += dt;
    flash.scale.setScalar(flashT < 0.05 ? 1e-4 + 4.2 * (flashT / 0.05) : Math.max(1e-4, 4.2 * (1 - (flashT - 0.05) / 0.18)));
    ringT += dt;
    if (ringT < 0.45) {
      ringHot.scale.setScalar(0.6 + ringT * 20);
      ringHot.material.opacity = 1 - ringT / 0.45;
    } else ringHot.scale.setScalar(1e-4);
    if (ringT < 0.9) {
      ringInk.scale.setScalar(0.6 + Math.sqrt(ringT) * 7.5);
      ringInk.material.opacity = 0.85 * (1 - ringT / 0.9);
    } else ringInk.scale.setScalar(1e-4);
    for (const sc of scorches) {
      sc.t += dt;
      sc.m.material.opacity = sc.t < 0.05 ? sc.t / 0.05 : Math.max(0, 1 - (sc.t - 7) / 3);
      sc.e.material.opacity = sc.t < 1.6 ? 1 - sc.t / 1.6 : 0;
    }

    // puffs
    for (let i = 0; i < PUFFS; i++) {
      const p = puffs[i];
      p.t += dt;
      const age = p.t - p.delay;
      if (age < 0 || age > p.life) {
        m4.copy(ZERO);
        puffAge.setX(i, 1);
      } else {
        const k = age / p.life;
        p.v.multiplyScalar(Math.exp(-dt * 2.2));
        p.v.y += dt * 1.2; // hot air rises
        p.p.addScaledVector(p.v, dt);
        const s = p.size * (0.35 + 0.65 * (1 - Math.exp(-age * 9))) * (1 + k * 0.5);
        m4.compose(p.p, dq.identity(), sv.setScalar(s));
        puffAge.setX(i, p.a0 + k * (1 - p.a0));
      }
      puffMesh.setMatrixAt(i, m4);
    }
    puffMesh.instanceMatrix.needsUpdate = true;
    puffAge.needsUpdate = true;

    // sparks
    for (let i = 0; i < SPARKS; i++) {
      const sp = sparks[i];
      sp.t += dt;
      if (sp.t > sp.life) {
        sparkMesh.setMatrixAt(i, ZERO);
        continue;
      }
      sp.v.y -= G * 0.7 * dt;
      sp.v.multiplyScalar(Math.exp(-dt * 1.5));
      sp.p.addScaledVector(sp.v, dt);
      if (sp.p.y < 0.05) {
        sp.p.y = 0.05;
        sp.v.y *= -0.4;
      }
      const speed = sp.v.length();
      dq.setFromUnitVectors(nrm.set(0, 0, 1), tmp.copy(sp.v).divideScalar(Math.max(speed, 1e-3)));
      const fade = 1 - sp.t / sp.life;
      m4.compose(sp.p, dq, sv.set(0.05 * fade + 1e-4, 0.05 * fade + 1e-4, 0.08 + speed * 0.035));
      sparkMesh.setMatrixAt(i, m4);
    }
    sparkMesh.instanceMatrix.needsUpdate = true;

    // chunks
    for (let i = 0; i < CHUNKS; i++) {
      const ch = chunks[i];
      ch.t += dt;
      if (ch.t > ch.life) {
        chunkMesh.setMatrixAt(i, ZERO);
        continue;
      }
      ch.v.y -= G * dt;
      ch.p.addScaledVector(ch.v, dt);
      if (ch.p.y < ch.size * 0.5) {
        ch.p.y = ch.size * 0.5;
        ch.v.y *= -0.35;
        ch.v.x *= 0.6;
        ch.v.z *= 0.6;
        ch.w.multiplyScalar(0.6);
      }
      ch.r.set(ch.r.x + ch.w.x * dt, ch.r.y + ch.w.y * dt, ch.r.z + ch.w.z * dt);
      const fade = Math.min(1, (ch.life - ch.t) / 0.4);
      m4.compose(ch.p, dq.setFromEuler(ch.r), sv.setScalar(ch.size * fade + 1e-4));
      chunkMesh.setMatrixAt(i, m4);
    }
    chunkMesh.instanceMatrix.needsUpdate = true;

    // ---- the crowd: idle cheering, flinching, flying, lying, getting back up
    for (const b of bodies) {
      b.t += dt;
      const S = b.s;
      if (b.mode === IDLE) {
        // spring back from a flinch; hop when startled
        b.fv.addScaledVector(b.fo, -16 * dt).multiplyScalar(Math.exp(-6 * dt));
        b.fo.addScaledVector(b.fv, dt);
        b.hv -= G * dt;
        b.hy = Math.max(0, b.hy + b.hv * dt);
        if (b.hy === 0) b.hv = 0;
        const cheer = b.calm ? 0 : Math.abs(Math.sin(t * 4.2 + b.phase)) * 0.045;
        b.p.set(b.home.x + b.fo.x, COM * S + cheer + b.hy, b.home.z + b.fo.z);
        eul.set(b.fo.z * 0.35, b.rot + Math.sin(t * 1.3 + b.phase) * (b.calm ? 0.04 : 0.12), Math.sin(t * 2.3 + b.phase) * 0.05 - b.fo.x * 0.35);
        b.q.setFromEuler(eul);
      } else if (b.mode === FLY) {
        b.v.y -= G * dt;
        b.p.addScaledVector(b.v, dt);
        const wl = b.w.length();
        if (wl > 1e-4) b.q.premultiply(dq.setFromAxisAngle(tmp.copy(b.w).divideScalar(wl), wl * dt));
        const floor = LIE * S;
        if (b.p.y < floor) {
          b.p.y = floor;
          if (b.v.y < 0) {
            b.v.y *= -0.3;
            b.v.x *= 0.5;
            b.v.z *= 0.5;
            b.w.multiplyScalar(0.4);
            if (++b.bounces >= 2 || Math.abs(b.v.y) < 1.2) toDown(b);
          }
        }
      } else if (b.mode === DOWN) {
        b.q.slerpQuaternions(b.qFrom, b.qTo, smooth(b.t / 0.28));
        b.v.x *= Math.exp(-5 * dt);
        b.v.z *= Math.exp(-5 * dt);
        b.p.x += b.v.x * dt;
        b.p.z += b.v.z * dt;
        b.p.y = damp(b.p.y, LIE * S, 12, dt);
        if (b.t > b.wait) toGetUp(b);
      } else if (b.mode === GETUP) {
        const u1 = smooth(b.t / 0.75); // stand up
        const u2 = smooth((b.t - 0.55) / (b.dur - 0.55)); // walk home
        b.q.slerpQuaternions(b.qFrom, b.qTo, u1);
        if (u2 > 0.75) b.q.slerp(b.qRest, smooth((u2 - 0.75) / 0.25));
        const walking = u2 > 0 && u2 < 1;
        b.p.set(
          b.pFrom.x + (b.home.x - b.pFrom.x) * u2,
          b.pFrom.y + (COM * S - b.pFrom.y) * u1 + (walking ? Math.abs(Math.sin(b.t * 11)) * 0.07 : 0),
          b.pFrom.z + (b.home.z - b.pFrom.z) * u2
        );
        if (b.t >= b.dur) {
          b.mode = IDLE;
          b.fo.set(0, 0, 0);
          b.fv.set(0, 0, 0);
        }
      } else if (b.mode === DEAD) {
        if (b.t > b.wait) {
          b.mode = RESPAWN;
          b.t = 0;
          b.p.set(b.home.x, COM * S, b.home.z);
          b.q.copy(b.qRest);
        }
      } else if (b.mode === RESPAWN && b.t > 0.5) {
        b.mode = IDLE;
      }

      if (b.mode === DEAD) m4.copy(ZERO);
      else {
        const grow = b.mode === RESPAWN ? Math.max(1e-4, backOut(b.t / 0.5)) : 1;
        m4.compose(b.p, b.q, sv.set(S * grow, S * grow, S * grow)).multiply(OFF);
      }
      if (b.i < 0) {
        b.mesh.matrix.copy(m4);
        b.mesh.matrixWorldNeedsUpdate = true;
      } else b.mesh.setMatrixAt(b.i, m4);
    }
    for (const m of batches) m.instanceMatrix.needsUpdate = true;
    shake = damp(shake, 0, 6, dt);
  }

  const BLOOM = { strength: 0.55, radius: 0.35, threshold: 1.1 };
  return {
    fire,
    update,
    /** true from the tap until the beam has faded: the eye should stare at the target */
    get aiming() {
      return shot.t < CHARGE + 0.75;
    },
    get target() {
      return shot.target;
    },
    get charge() {
      const st = shot.t;
      return st < CHARGE ? smooth(st / CHARGE) : Math.max(0, 1 - (st - CHARGE - 0.12) / 0.4);
    },
    get shake() {
      return shake;
    },
    get kick() {
      return kick;
    },
    /** only pay for bloom while something is glowing */
    get bloom() {
      return now - lastFire < 3 ? BLOOM : null;
    },
  };
}
