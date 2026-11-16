// Scene 1 — "AI LOVES US"
// A colossal bloodshot eyeball on a boom arm, watching a devoted crowd.
// The eye tracks the cursor, but only inside a fixed cone: past that radius it
// parks on the rim of its range instead of rolling over backwards.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rng, damp, toonRamp, canvasTex, GLSL_NOISE } from '../utils.js';
import { createEyeBlast } from './eyeBlast.js';

/** The pupil shares its colour with scene 2's background so the iris-wipe is seamless. */
export const PUPIL_COLOR = '#0f0d28';

const R = 3; // eyeball radius
const MAX_GAZE = THREE.MathUtils.degToRad(38); // how far the eye may rotate off-centre
const GAZE_PLANE = 6.5; // distance (toward camera) of the plane the cursor "lives" on
const FIRE_GAZE = THREE.MathUtils.degToRad(75); // while shooting, the eye may stare much further off-axis

export function createEyeScene() {
  const rand = rng(11);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#d4e8f7');
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 300);
  const ramp = toonRamp();

  /** Driven by the transition timeline in main.js. */
  const state = { focus: 0, dilate: 0, push: 0 };

  const eyePos = new THREE.Vector3(0, 5.2, 0);
  const camBase = new THREE.Vector3();
  const camPush = new THREE.Vector3();
  const lookBase = new THREE.Vector3();

  // ---------------------------------------------------------------- lights
  const sun = new THREE.DirectionalLight('#ffffff', 2.5);
  sun.position.set(-10, 17, -7);
  sun.target.position.set(1, 0, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 24, bottom: -24, near: 1, far: 70 });
  sun.shadow.bias = -0.0004;
  scene.add(sun, sun.target, new THREE.AmbientLight('#aab8ff', 1.15));
  const lightDir = sun.position.clone().sub(sun.target.position).normalize();

  // ---------------------------------------------------------------- ground
  const floorTex = canvasTex(2048, 2048, (g, w, h) => {
    const r = rng(3);
    g.fillStyle = '#d4e8f7';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#e6f3fc';
    for (let i = 0; i < 12; i++) g.fillRect(r() * w, r() * h, 80 + r() * 380, 40 + r() * 220);
    g.fillStyle = '#c3dcf0';
    for (let i = 0; i < 8; i++) g.fillRect(r() * w, r() * h, 60 + r() * 260, 30 + r() * 160);
    g.strokeStyle = '#18225a';
    for (let i = 0; i < 54; i++) {
      g.lineWidth = 1.5 + r() * 2.5;
      const x = r() * w;
      const y = r() * h;
      const k = r();
      if (k < 0.45) g.strokeRect(x, y, 40 + r() * 340, 30 + r() * 220);
      else if (k < 0.8) {
        g.beginPath();
        g.moveTo(x, y);
        if (r() < 0.5) g.lineTo(x + (r() - 0.5) * 1100, y);
        else g.lineTo(x, y + (r() - 0.5) * 1100);
        g.stroke();
      } else {
        g.beginPath();
        g.arc(x, y, 30 + r() * 120, 0, Math.PI * (0.5 + r() * 1.5));
        g.stroke();
      }
    }
    g.fillStyle = '#2b44e0';
    for (let i = 0; i < 10; i++) g.fillRect(r() * w, r() * h, 120 + r() * 380, 12 + r() * 12);
    // tiny hatch marks, like technical-drawing annotations
    g.fillStyle = '#18225a';
    for (let i = 0; i < 26; i++) {
      const x = r() * w;
      const y = r() * h;
      for (let j = 0; j < 6; j++) g.fillRect(x + j * 9, y, 4, 16 + r() * 10);
    }
  });
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(2, 1.4);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(160, 110), new THREE.MeshBasicMaterial({ map: floorTex }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, -12);
  scene.add(floor);

  // the blue gridded plaza the crowd stands on
  const PLAZA = { x0: -34, x1: 28, z0: 2.6, z1: 21 };
  const plazaTex = canvasTex(2048, 512, (g, w, h) => {
    g.fillStyle = '#2b45e6';
    g.fillRect(0, 0, w, h);
    // pale rays fanning away from the eye
    g.fillStyle = 'rgba(223,233,255,0.92)';
    const r = rng(5);
    for (let i = 0; i < 26; i++) {
      const x = r() * w;
      const wd = 10 + r() * 46;
      const lean = (x / w - 0.56) * 260;
      g.beginPath();
      g.moveTo(x, r() * 60);
      g.lineTo(x + lean - wd, h * (0.55 + r() * 0.45));
      g.lineTo(x + lean + wd, h * (0.55 + r() * 0.45));
      g.closePath();
      g.fill();
    }
    g.strokeStyle = '#0d1340';
    g.lineWidth = 5;
    const cell = 64;
    for (let x = 0; x <= w; x += cell) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, h);
      g.stroke();
    }
    for (let y = 0; y <= h; y += cell) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(w, y);
      g.stroke();
    }
    g.lineWidth = 16;
    g.strokeRect(0, 0, w, h);
  });
  const plaza = new THREE.Mesh(
    new THREE.PlaneGeometry(PLAZA.x1 - PLAZA.x0, PLAZA.z1 - PLAZA.z0),
    new THREE.MeshBasicMaterial({ map: plazaTex })
  );
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.set((PLAZA.x0 + PLAZA.x1) / 2, 0.02, (PLAZA.z0 + PLAZA.z1) / 2);
  scene.add(plaza);

  // one transparent sheet that only shows shadows — keeps them graphic and flat
  const shadowCatcher = new THREE.Mesh(
    new THREE.PlaneGeometry(160, 110),
    new THREE.ShadowMaterial({ color: '#0a0f3a', opacity: 1 })
  );
  shadowCatcher.rotation.x = -Math.PI / 2;
  shadowCatcher.position.set(0, 0.04, -12);
  shadowCatcher.receiveShadow = true;
  scene.add(shadowCatcher);

  // ---------------------------------------------------------------- the eye
  const floatG = new THREE.Group(); // eyeball + rig, bobs gently
  scene.add(floatG);

  const eyeMat = new THREE.ShaderMaterial({
    uniforms: {
      uLightDir: { value: lightDir },
      uDilate: { value: 0 },
      uTime: { value: 0 },
      uPupil: { value: new THREE.Color(PUPIL_COLOR) },
      uCharge: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vObj; varying vec3 vWorldN; varying vec3 vViewN;
      void main(){
        vec3 n = normalize(position);
        float ang = acos(clamp(n.z,-1.,1.));
        vec3 p = position + n * 0.17 * smoothstep(0.66, 0.0, ang);   // corneal bulge
        vObj = position;
        vWorldN = normalize(mat3(modelMatrix) * n);
        vViewN = normalize(normalMatrix * n);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uLightDir; uniform float uDilate; uniform float uTime; uniform vec3 uPupil; uniform float uCharge;
      varying vec3 vObj; varying vec3 vWorldN; varying vec3 vViewN;
      ${GLSL_NOISE}
      // scattered blood-shot dashes, elongated along the meridians
      float dashes(float az, float ang, float N, float M, float seed){
        vec2 uv = vec2(az / 6.2831853 * N, ang * M);
        vec2 id = floor(uv); id.x = mod(id.x, N);
        vec2 f = fract(uv) - .5;
        float r = hash21(id + seed);
        vec2 off = (vec2(hash21(id + seed + 1.3), hash21(id + seed + 7.1)) - .5) * .5;
        vec2 q = f - off;
        q.x += q.y * (hash21(id + seed + 2.2) - .5) * .8;
        q.x *= 3.4 + 5.5 * hash21(id + seed + 3.7);
        q.y *= 1.0 + 1.6 * hash21(id + seed + 5.2);
        return step(length(q), .32) * step(.5, r);
      }
      vec3 toLin(vec3 c){ return pow(c, vec3(2.2)); }
      void main(){
        vec3 n = normalize(vObj);
        float ang = acos(clamp(n.z, -1., 1.));
        float az = atan(n.y, n.x);

        // two-band cel shading on the sclera
        float ndl = dot(normalize(vWorldN), uLightDir);
        float lit = smoothstep(-.012, .012, ndl + .22);
        vec3 col = mix(vec3(.70,.72,.92), vec3(.965,.935,.96), lit);
        col = mix(col, vec3(.84,.86,.98), (1.-lit) * step(.0, ndl + .55) * .55);

        float veinMask = smoothstep(.66, .86, ang);
        float v = max(dashes(az, ang, 15., 3.3, 0.), dashes(az + .7, ang, 9., 2.2, 9.));
        v = max(v, dashes(az + 2.1, ang, 23., 5.0, 21.) * .8);
        col = mix(col, vec3(.88,.24,.36), v * veinMask * .92);

        // iris
        float irisR = .54;
        float pupilR = mix(.2, .36, uDilate);
        float jag = (vnoise(vec2(az * 9., 3.)) - .5) * .05;
        if (ang < irisR + .03) {
          vec3 iris = vec3(.17,.28,.94);
          float fib = step(.56, vnoise(vec2(az * 22., ang * 7. + 2.)));
          iris = mix(iris, vec3(.26,.40,1.), fib * .8);
          // lighter crescent, like a wet reflection
          float cres = step(.3, dot(normalize(vViewN), normalize(vec3(.55,-.5,.67)))) ;
          iris = mix(iris, vec3(.45,.58,1.), cres * .0 );
          float inner = smoothstep(pupilR + .15 + jag, pupilR + .13 + jag, ang);
          iris = mix(iris, vec3(.07,.10,.52), inner);
          float striation = step(.62, vnoise(vec2(az * 30., ang * 30.)));
          iris = mix(iris, vec3(.11,.17,.70), inner * striation * .7);
          vec3 c = mix(iris, vec3(.04,.05,.2), smoothstep(irisR - .035, irisR - .015, ang)); // limbus line
          c = mix(c, col, smoothstep(irisR + .012, irisR + .03, ang));
          col = c;
        }
        vec3 lin = toLin(col);
        // pupil is passed in linear space so it matches scene 2's clear colour exactly
        // the pupil charges white-hot pink before the laser fires
        lin += vec3(2.2, .12, .6) * uCharge * smoothstep(irisR, pupilR, ang) * .4 * step(ang, irisR);
        lin = mix(lin, mix(uPupil, vec3(5.5, .4, 1.3), uCharge), smoothstep(pupilR + .012, pupilR, ang));

        // specular glints, locked to the view so they don't roll with the eye
        vec3 vn = normalize(vViewN);
        float h1 = step(.9735, dot(vn, normalize(vec3(-.40,.50,.77))));
        float h2 = step(.9965, dot(vn, normalize(vec3(-.18,.30,.94))));
        lin = mix(lin, vec3(1.), max(h1, h2));
        gl_FragColor = vec4(lin, 1.0);
      }`,
  });
  const eyeball = new THREE.Mesh(new THREE.SphereGeometry(R, 96, 64), eyeMat);
  eyeball.castShadow = true;
  floatG.add(eyeball);
  const hull = new THREE.Mesh(
    new THREE.SphereGeometry(R * 1.02, 64, 48),
    new THREE.MeshBasicMaterial({ color: '#0b0f33', side: THREE.BackSide })
  );
  floatG.add(hull);

  // ---- mechanical housing (local +Z is "forward")
  const rig = new THREE.Group();
  floatG.add(rig);
  const mDark = new THREE.MeshToonMaterial({ color: '#0c1036', gradientMap: ramp });
  const mNavy = new THREE.MeshToonMaterial({ color: '#1a2370', gradientMap: ramp, side: THREE.DoubleSide });
  const mBlue = new THREE.MeshToonMaterial({ color: '#2f49e8', gradientMap: ramp });
  const mIce = new THREE.MeshToonMaterial({ color: '#cfe0ff', gradientMap: ramp });
  const lineMat = new THREE.LineBasicMaterial({ color: '#3d57ff' });
  const addPart = (geo, mat, x = 0, y = 0, z = 0, edges = false) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    rig.add(m);
    if (edges) {
      const l = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), lineMat);
      l.position.copy(m.position);
      rig.add(l);
    }
    return m;
  };
  addPart(new THREE.SphereGeometry(R * 1.065, 64, 24, 0, Math.PI * 2, 0, 1.18).rotateX(-Math.PI / 2), mDark);
  addPart(new THREE.CylinderGeometry(R * 1.08, R * 1.08, 1.35, 72, 1, true).rotateX(Math.PI / 2), mNavy, 0, 0, -0.8);
  addPart(new THREE.TorusGeometry(R * 1.075, 0.17, 10, 96), mBlue, 0, 0, -0.14);
  addPart(new THREE.TorusGeometry(R * 1.09, 0.07, 8, 96), mIce, 0, 0, -0.62);
  addPart(new THREE.TorusGeometry(R * 1.085, 0.12, 8, 96), mDark, 0, 0, -1.42);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const b = addPart(new THREE.BoxGeometry(0.34, 0.22, 0.6), i % 2 ? mBlue : mDark, Math.cos(a) * R * 1.1, Math.sin(a) * R * 1.1, -1.0);
    b.rotation.z = a + Math.PI / 2;
  }
  // a hood over the top of the ball, so it reads as held rather than floating
  const hood = addPart(new THREE.SphereGeometry(R * 1.072, 48, 16, 0, Math.PI * 2, 0, 0.78), mDark);
  hood.rotation.x = -0.62;
  const hoodRim = addPart(new THREE.TorusGeometry(R * 1.072 * Math.sin(0.78), 0.09, 8, 64).rotateX(Math.PI / 2), mBlue, 0, 0, 0);
  hoodRim.rotation.x = -0.62;
  hoodRim.position.set(0, R * 1.072 * Math.cos(0.78) * Math.cos(0.62), -R * 1.072 * Math.cos(0.78) * Math.sin(0.62));
  // status lamp
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 12), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
  lamp.position.set(Math.cos(0.75) * R * 1.1, Math.sin(0.75) * R * 1.1, -0.2);
  rig.add(lamp);
  addPart(new THREE.CylinderGeometry(1.75, 1.75, 1.3, 28).rotateX(Math.PI / 2), mNavy, 0, 0, -R - 0.45, true);
  addPart(new THREE.CylinderGeometry(1.2, 1.2, 0.5, 28).rotateX(Math.PI / 2), mBlue, 0, 0, -R - 1.3);
  const arm = addPart(new THREE.BoxGeometry(2, 2.3, 1), mDark, 0, 0, 0);
  const armRail = addPart(new THREE.BoxGeometry(2.3, 0.35, 1), mBlue, 0, 1.0, 0);
  for (const sx of [-1, 1]) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(sx * 0.9, 1.25, -R - 3.6),
      new THREE.Vector3(sx * 1.7, 2.7, -R - 1.2),
      new THREE.Vector3(sx * 1.5, 3.3, -1.9),
      new THREE.Vector3(sx * 1.05, 3.08, -0.9),
    ]);
    addPart(new THREE.TubeGeometry(curve, 28, 0.13, 7), sx > 0 ? mBlue : mDark);
  }
  const base = new THREE.Mesh(new THREE.BoxGeometry(5.5, 2.6, 5.5), mDark);
  base.castShadow = true;
  const baseLines = new THREE.LineSegments(new THREE.EdgesGeometry(base.geometry), lineMat);
  base.add(baseLines);
  scene.add(base);

  // ---------------------------------------------------------------- crowd
  const figMat = new THREE.MeshToonMaterial({ color: '#46557f', gradientMap: ramp });
  const figureGeo = (armL, armR) => {
    const arm = (sx, ang) =>
      new THREE.CylinderGeometry(0.06, 0.05, 0.62, 6).translate(0, 0.31, 0).rotateZ(ang).translate(sx * 0.25, 1.34, 0);
    return mergeGeometries([
      new THREE.CapsuleGeometry(0.2, 0.42, 3, 8).translate(0, 1.1, 0),
      new THREE.SphereGeometry(0.16, 10, 8).translate(0, 1.66, 0),
      new THREE.CylinderGeometry(0.085, 0.065, 0.86, 6).translate(-0.1, 0.43, 0),
      new THREE.CylinderGeometry(0.085, 0.065, 0.86, 6).translate(0.1, 0.43, 0),
      arm(-1, armL),
      arm(1, armR),
    ]);
  };
  const variants = [figureGeo(0.42, -0.42), figureGeo(0.2, -0.7), figureGeo(0.5, Math.PI - 0.2), figureGeo(1.2, -1.2)];
  const spots = [];
  for (let z = PLAZA.z0 + 0.8; z < PLAZA.z1 - 0.4; z += 1.45) {
    for (let x = PLAZA.x0 + 0.8; x < PLAZA.x1 - 0.4; x += 1.5) {
      if (rand() < 0.1) continue;
      spots.push({
        x: x + (rand() - 0.5) * 0.7,
        z: z + (rand() - 0.5) * 0.7,
        v: Math.floor(rand() * variants.length),
        phase: rand() * Math.PI * 2,
        s: 0.92 + rand() * 0.2,
      });
    }
  }
  const batches = variants.map((geo, v) => {
    const mesh = new THREE.InstancedMesh(geo, figMat, spots.filter((s) => s.v === v).length);
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    scene.add(mesh);
    return mesh;
  });
  const counters = variants.map(() => 0);
  for (const s of spots) {
    s.mesh = batches[s.v];
    s.i = counters[s.v]++;
    s.rot = Math.atan2(eyePos.x - s.x, eyePos.z - s.z);
  }
  // a lone officer on the pale ground, facing the crowd
  const officer = new THREE.Mesh(figureGeo(Math.PI - 0.25, -Math.PI + 0.6), new THREE.MeshToonMaterial({ color: '#10142e', gradientMap: ramp }));
  officer.position.set(-4.6, 0, 0.3);
  officer.scale.setScalar(1.35);
  officer.rotation.y = 0.5;
  officer.castShadow = true;
  scene.add(officer);

  // tap to fire: laser, blast, flying bodies (see eyeBlast.js)
  const blastSys = createEyeBlast({ scene, spots, officer, figMat, ramp });

  // attention reticle that slides over the ground where the eye is "looking"
  const reticle = new THREE.Group();
  const retMat = new THREE.MeshBasicMaterial({ color: '#0b0f33', transparent: true, opacity: 0.9, depthWrite: false });
  reticle.add(new THREE.Mesh(new THREE.RingGeometry(1.9, 2.02, 64), retMat));
  reticle.add(new THREE.Mesh(new THREE.RingGeometry(0.12, 0.2, 24), retMat));
  for (let i = 0; i < 4; i++) {
    const tick = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.7), retMat);
    tick.position.set(Math.sin((i * Math.PI) / 2) * 2.2, Math.cos((i * Math.PI) / 2) * 2.2, 0);
    tick.rotation.z = (-i * Math.PI) / 2;
    reticle.add(tick);
  }
  reticle.rotation.x = -Math.PI / 2;
  reticle.position.y = 0.07;
  scene.add(reticle);

  // ---------------------------------------------------------------- update
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const plane = new THREE.Plane();
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const eyeW = new THREE.Vector3();
  const toCam = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const look = new THREE.Vector3();
  const ptrPt = new THREE.Vector3();
  const idlePt = new THREE.Vector3();
  const target = new THREE.Vector3();
  const attention = new THREE.Vector3(-3, 0, 11);
  const attnTarget = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const axisV = new THREE.Vector3();
  const sacc = new THREE.Vector3();
  const dummy = new THREE.Object3D();
  let follow = 0;
  let saccT = 0;
  let dil = 0.3;

  function update(dt, t, pointer) {
    const p = state.push;
    floatG.position.set(eyePos.x, eyePos.y + Math.sin(t * 0.9) * 0.14 * (1 - p), eyePos.z);
    eyeW.copy(floatG.position);

    camera.position.lerpVectors(camBase, camPush, p);
    look.lerpVectors(lookBase, eyeW, Math.min(1, p * 1.8));
    camera.lookAt(look);
    camera.updateMatrixWorld();
    toCam.copy(camera.position).sub(eyeW).normalize();

    // --- where should the eye look?
    follow = damp(follow, pointer.idle < 3.5 ? 1 : 0, 3, dt);
    ndc.set(pointer.x, pointer.y);
    raycaster.setFromCamera(ndc, camera);
    plane.setFromNormalAndCoplanarPoint(toCam, tmp.copy(eyeW).addScaledVector(toCam, GAZE_PLANE));
    if (!raycaster.ray.intersectPlane(plane, ptrPt)) ptrPt.copy(camera.position);
    idlePt.set(-4 + Math.sin(t * 0.43) * 12, 0, 11.5 + Math.cos(t * 0.29) * 4);
    target.lerpVectors(idlePt, ptrPt, follow).lerp(camera.position, state.focus);

    // micro-saccades keep it feeling alive
    saccT -= dt;
    if (saccT < 0) {
      saccT = 0.5 + Math.random() * 1.8;
      sacc.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.5 * (1 - state.focus));
    }
    target.add(sacc);

    // while shooting, stare straight at the target
    const aiming = blastSys.aiming && state.focus < 0.01;
    if (aiming) target.copy(blastSys.target);

    // clamp to the response cone: outside it, the eye rests on the rim
    const cone = aiming ? FIRE_GAZE : MAX_GAZE;
    dir.copy(target).sub(eyeW).normalize();
    if (dir.angleTo(toCam) > cone) {
      axisV.crossVectors(toCam, dir).normalize();
      dir.copy(toCam).applyAxisAngle(axisV, cone);
    }
    dummy.position.copy(eyeW);
    dummy.lookAt(tmp.copy(eyeW).add(dir));
    eyeball.quaternion.slerp(dummy.quaternion, 1 - Math.exp(-dt * (aiming ? 24 : 11)));

    // pupil tightens when the cursor comes close, blows wide open on transition
    const near = pointer.idle < 3.5 && ptrPt.distanceTo(tmp.copy(eyeW).addScaledVector(toCam, GAZE_PLANE)) < 2.2;
    dil = damp(dil, near ? 0.0 : 0.32 + Math.sin(t * 0.7) * 0.08, 5, dt);
    eyeMat.uniforms.uDilate.value = dil + (1 - dil) * state.dilate;
    eyeMat.uniforms.uTime.value = t;
    eyeMat.uniforms.uCharge.value = blastSys.charge;
    lamp.material.color.setScalar(0.75 + 0.25 * Math.sin(t * 5));

    // --- targeting reticle follows the cursor over the plaza
    if (follow > 0.5 && raycaster.ray.intersectPlane(ground, attnTarget)) {
      attnTarget.x = THREE.MathUtils.clamp(attnTarget.x, -40, 40);
      attnTarget.z = THREE.MathUtils.clamp(attnTarget.z, -30, 22);
    } else attnTarget.copy(idlePt);
    attention.x = damp(attention.x, attnTarget.x, 7, dt);
    attention.z = damp(attention.z, attnTarget.z, 7, dt);
    reticle.position.x = attention.x;
    reticle.position.z = attention.z;
    reticle.rotation.z = t * 0.6;
    const pulse = 1 + Math.sin(t * 4) * 0.05;
    reticle.scale.setScalar(pulse);
    retMat.opacity = 0.9 * (1 - p);

    retMat.color.setRGB(0.04 + blastSys.charge * 0.9, 0.06, 0.2 + blastSys.charge * 0.2);

    // the crowd now just cheers in place; the laser system owns their bodies (and their physics)
    blastSys.update(dt, t, camera, (out) => out.set(0, 0, R + 0.17).applyQuaternion(eyeball.quaternion).add(floatG.position));

    // recoil + camera shake from the shot
    floatG.position.addScaledVector(dir, -blastSys.kick * 0.35);
    if (blastSys.shake > 0.01) {
      const k = blastSys.shake * 0.28;
      camera.position.x += (Math.random() - 0.5) * k;
      camera.position.y += (Math.random() - 0.5) * k;
      camera.lookAt(look);
      camera.updateMatrixWorld();
    }
  }

  function resize(aspect) {
    // blend continuously from a tall, centred framing (phones) to a wide one with the eye right of the title
    const k = THREE.MathUtils.smoothstep(aspect, 0.7, 1.45);
    camera.aspect = aspect;
    camera.fov = THREE.MathUtils.lerp(48, 32, k);
    camera.updateProjectionMatrix();
    const side = -3.9 * k;
    camBase.set(side, THREE.MathUtils.lerp(20, 16, k), THREE.MathUtils.lerp(27, 23.5, k));
    lookBase.set(side, THREE.MathUtils.lerp(3.9, 3.3, k), 2.2);

    const toCam0 = camBase.clone().sub(eyePos).normalize();
    camPush.copy(eyePos).addScaledVector(toCam0, R + 1.75); // close enough that the pupil fills the frame

    // housing points a little left of the camera; the boom runs off behind it into the ground
    const axis = toCam0.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -0.26).normalize();
    rig.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(axis, new THREE.Vector3(), new THREE.Vector3(0, 1, 0)));
    const reach = eyePos.y / axis.y; // distance along the boom until it meets the floor
    const len = reach - R - 1.4;
    arm.scale.z = len;
    arm.position.z = -(R + 1.4 + len / 2);
    armRail.scale.z = len;
    armRail.position.z = arm.position.z;
    // refresh the edge overlay of the boom
    rig.children.filter((c) => c.isLineSegments && c.userData.arm).forEach((c) => rig.remove(c));
    const l = new THREE.LineSegments(new THREE.EdgesGeometry(arm.geometry), lineMat);
    l.userData.arm = true;
    l.position.copy(arm.position);
    l.scale.copy(arm.scale);
    rig.add(l);
    base.position.copy(eyePos).addScaledVector(axis, -reach);
    base.position.y = 1.1;
    base.rotation.y = Math.atan2(axis.x, axis.z);
  }

  /**
   * Where the pupil sits on screen (uv 0..1) and how big it is (in screen heights).
   * The iris wipe is pinned to this, so scene 2 literally appears inside the pupil.
   */
  const pv = new THREE.Vector3();
  const pOut = { x: 0.5, y: 0.5, r: 0 };
  function pupilScreen() {
    pv.set(0, 0, R + 0.17).applyQuaternion(eyeball.quaternion).add(eyeW);
    const d = pv.distanceTo(camera.position);
    const ang = 0.2 + (0.36 - 0.2) * eyeMat.uniforms.uDilate.value;
    pv.project(camera);
    pOut.x = pv.x * 0.5 + 0.5;
    pOut.y = pv.y * 0.5 + 0.5;
    pOut.r = ((R + 0.17) * Math.sin(ang)) / d / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    return pOut;
  }

  const fireNDC = new THREE.Vector2();
  const firePt = new THREE.Vector3();
  /** Tap → laser. Takes the pointer in NDC; fires at the matching spot on the ground. */
  function fire(x, y) {
    if (state.focus > 0.01 || state.push > 0.01) return;
    raycaster.setFromCamera(fireNDC.set(x, y), camera);
    if (!raycaster.ray.intersectPlane(ground, firePt)) return;
    firePt.x = THREE.MathUtils.clamp(firePt.x, -34, 30);
    firePt.z = THREE.MathUtils.clamp(firePt.z, -12, 22);
    blastSys.fire(firePt);
  }

  return {
    scene,
    camera,
    state,
    update,
    resize,
    pupilScreen,
    fire,
    get bloom() {
      return blastSys.bloom;
    },
  };
}
