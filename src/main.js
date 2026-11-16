// AI LOVES US — a satire in three scenes.
// One WebGL canvas, three independent Three.js scenes, and a compositor that
// blends between them: an iris-wipe through the eye's pupil (1 ⇄ 2) and a
// signal-loss glitch (2 ⇄ 3). GSAP drives every transition and the type.

import '@fontsource/anton';
import '@fontsource/space-mono/400.css';
import '@fontsource/space-mono/700.css';
import './style.css';

import * as THREE from 'three';
import gsap from 'gsap';
import { Observer } from 'gsap/Observer';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

import { createEyeScene } from './scenes/eye.js';
import { createTVScene } from './scenes/tvhead.js';
import { createTrainScene } from './scenes/train.js';
import { createChaseScene } from './scenes/chase.js';

gsap.registerPlugin(Observer);

const GRADE = [
  { grain: 0.022, vig: 0.12 },
  { grain: 0.045, vig: 0.55 },
  { grain: 0.07, vig: 0.8 },
  { grain: 0.035, vig: 0.07 },
];
const HINTS = ['Move the cursor · Scroll', 'Tap the screens · Scroll', 'Look closer · Scroll', 'Tap to make it grab · Scroll up'];

async function boot() {
  // canvas-drawn signage uses the display face, so wait for it (briefly)
  await Promise.race([
    Promise.all([document.fonts.load('60px Anton'), document.fonts.load('12px "Space Mono"')]),
    new Promise((r) => setTimeout(r, 1800)),
  ]);

  const canvas = document.getElementById('gl');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const eye = createEyeScene();
  const tv = createTVScene();
  const train = createTrainScene();
  const chase = createChaseScene();
  const scenes = [eye, tv, train, chase];

  // ------------------------------------------------------------ render targets + compositor
  const rtOpts = { type: THREE.HalfFloatType, samples: 4 };
  const rtA = new THREE.WebGLRenderTarget(4, 4, rtOpts);
  const rtB = new THREE.WebGLRenderTarget(4, 4, rtOpts);
  const rtTmp = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: false });
  const bloom = new UnrealBloomPass(new THREE.Vector2(4, 4), 1, 0.5, 0.8);

  const compMat = new THREE.ShaderMaterial({
    uniforms: {
      tA: { value: null },
      tB: { value: null },
      uMode: { value: 0 },
      uProg: { value: 0 },
      uRadius: { value: 0 },
      uCenter: { value: new THREE.Vector2(0.5, 0.5) },
      uSquash: { value: 1 },
      uAspect: { value: 1 },
      uTime: { value: 0 },
      uGrain: { value: GRADE[0].grain },
      uVig: { value: GRADE[0].vig },
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D tA; uniform sampler2D tB;
      uniform int uMode;
      uniform float uProg, uRadius, uAspect, uTime, uGrain, uVig, uSquash;
      uniform vec2 uCenter;
      varying vec2 vUv;
      float h1(float p){ return fract(sin(p * 127.1) * 43758.5453); }
      float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      vec3 split(sampler2D t, vec2 uv, float ca){
        return vec3(texture2D(t, uv + vec2(ca, 0.)).r, texture2D(t, uv).g, texture2D(t, uv - vec2(ca, 0.)).b);
      }
      void main(){
        vec2 uv = vUv;
        vec3 col;
        if (uMode == 0) {
          col = texture2D(tA, uv).rgb;
        } else if (uMode == 1) {
          // iris wipe: scene B lives inside the pupil, and the pupil swallows the frame
          vec2 d = uv - uCenter; d.x *= uAspect / uSquash; // squash > 1 = wide ellipse (the mouth)
          float r = length(d);
          float m = (1. - smoothstep(uRadius * .86, uRadius, r)) * step(.0005, uRadius);
          col = mix(texture2D(tA, uv).rgb, texture2D(tB, uv).rgb, m);
        } else {
          // signal loss: tearing rows, RGB split, a burst of snow, then the next channel
          float k = sin(uProg * 3.14159);
          float tq = floor(uTime * 22.);
          float row = floor(uv.y * mix(6., 34., h1(tq)));
          float tear = (h2(vec2(row, tq)) - .5) * k * k * .42 * step(.45, h2(vec2(row * 3.1, tq + 4.)));
          float roll = k * k * .25 * (h1(tq * .31) - .5);
          vec2 g = vec2(uv.x + tear, fract(uv.y + roll));
          float sel = step(.5 + (h2(vec2(row, tq + 9.)) - .5) * .7 * k, uProg);
          float ca = .004 + .02 * k + abs(tear) * .25;
          vec2 ua = (g - .5) * (1. - .16 * uProg) + .5;
          vec2 ub = (g - .5) * (.84 + .16 * uProg) + .5;
          col = mix(split(tA, ua, ca), split(tB, ub, ca), sel);
          float snow = h2(floor(vUv * vec2(320., 180.)) + tq);
          col = mix(col, vec3(snow * snow), smoothstep(.72, 1., k) * .7);
          col *= 1. - .25 * k * step(.5, fract(vUv.y * 140.));
          col += k * .06 * vec3(.3, .1, .6);
        }
        vec2 q = vUv - .5;
        col *= 1. - uVig * dot(q, q) * 1.5;
        float lum = dot(col, vec3(.299, .587, .114));
        col += (h2(vUv * vec2(1731., 977.) + fract(uTime) * 61.3) - .5) * uGrain * (.2 + sqrt(max(lum, 0.)));
        gl_FragColor = vec4(max(col, 0.), 1.);
        #include <colorspace_fragment>
      }`,
    depthTest: false,
    depthWrite: false,
  });
  const quad = new FullScreenQuad(compMat);

  // ------------------------------------------------------------ state
  const comp = { a: 0, b: 1, mode: 0, prog: 0, grow: 0, boost: 0, grade: 0 };
  const pointer = { x: 0.2, y: 0.1, idle: 99 };
  const tapNDC = new THREE.Vector2();
  let current = 0;
  let busy = false;
  let aspect = 1;
  let time = 0;
  let last = performance.now();

  // ------------------------------------------------------------ resolution budget
  // Cap the number of shaded pixels (retina at 2x is ~4x the work for little gain on
  // a moving image), then let `quality` shrink it further if frames start dropping.
  const touch = window.matchMedia('(pointer: coarse)').matches;
  const PIXEL_BUDGET = touch ? 1.1e6 : 2.1e6;
  const quality = { scale: 1, min: 0.5 };

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;
    const pr = Math.max(0.6, Math.min(dpr, 2, Math.sqrt(PIXEL_BUDGET / (w * h))) * quality.scale);
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    const bw = Math.round(w * pr);
    const bh = Math.round(h * pr);
    rtA.setSize(bw, bh);
    rtB.setSize(bw, bh);
    rtTmp.setSize(bw, bh);
    bloom.setSize(Math.round(bw * 0.7), Math.round(bh * 0.7)); // bloom is blurry anyway; render it smaller
    aspect = w / h;
    compMat.uniforms.uAspect.value = aspect;
    for (const s of scenes) s.resize(aspect);
  }
  let resizeQueued = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(resizeQueued);
    resizeQueued = requestAnimationFrame(resize);
  });
  resize();

  // Adaptive quality: watch real frame intervals; if we're consistently missing frames,
  // drop the render scale a notch (with a cooldown so we never thrash allocations).
  let ftAvg = 16.7;
  let ftVar = 0;
  let qCool = 2;
  let slowStreak = 0;
  function adapt(rawDt) {
    if (rawDt > 0.25) return; // tab was hidden / debugger pause — ignore
    const ms = rawDt * 1000;
    ftVar += ((ms - ftAvg) ** 2 - ftVar) * 0.08;
    ftAvg += (ms - ftAvg) * 0.08;
    qCool -= rawDt;
    if (qCool > 0) return;
    // a rock-steady 30 fps is a refresh cap (low-power mode), not lag — only react to real stutter
    const capped = ftAvg < 36 && Math.sqrt(ftVar) < 2.5;
    slowStreak = ftAvg > 21 && !capped ? slowStreak + 1 : 0;
    if (slowStreak > 20 && quality.scale > quality.min) {
      quality.scale = Math.max(quality.min, quality.scale * 0.82);
      resize();
      qCool = 1.2;
      slowStreak = 0;
      ftAvg = 16.7;
    }
  }

  function renderScene(i, rt, dt) {
    const s = scenes[i];
    s.update(dt, time, pointer);
    renderer.setRenderTarget(rt);
    renderer.render(s.scene, s.camera);
    let out = rt;
    if (s.post) out = s.post(renderer, rt, rtTmp);
    if (s.bloom) {
      bloom.strength = s.bloom.strength;
      bloom.radius = s.bloom.radius;
      bloom.threshold = s.bloom.threshold;
      bloom.render(renderer, null, out, dt, false);
    }
    return out.texture;
  }

  function frame() {
    const nowMs = performance.now();
    const rawDt = (nowMs - last) / 1000;
    const dt = Math.min(rawDt, 0.05);
    last = nowMs;
    adapt(rawDt);
    time += dt;
    pointer.idle += dt;

    const u = compMat.uniforms;
    u.tA.value = renderScene(comp.a, rtA, dt);
    if (comp.mode !== 0) u.tB.value = renderScene(comp.b, rtB, dt);
    if (comp.mode === 1) {
      // 0→1 opens through the eye's pupil, 1→2 through the TV head's mouth
      // 0→1 through the pupil, 1→2 through the mouth, 2→3 through a commuter's eye
      const p = comp.a === 0 ? eye.pupilScreen() : comp.a === 1 ? tv.mouthScreen() : train.eyeScreen();
      u.uCenter.value.set(p.x, p.y);
      u.uSquash.value = (p.squash || 1) * (1 - comp.boost) + comp.boost;
      u.uRadius.value = p.r * 0.95 * comp.grow + comp.boost * Math.hypot(aspect, 1) * 1.1;
    }
    u.uMode.value = comp.mode;
    u.uProg.value = comp.prog;
    u.uTime.value = time;
    const g0 = GRADE[Math.floor(comp.grade)];
    const g1 = GRADE[Math.ceil(comp.grade)];
    const gf = comp.grade % 1;
    u.uGrain.value = g0.grain + (g1.grain - g0.grain) * gf;
    u.uVig.value = g0.vig + (g1.vig - g0.vig) * gf;

    renderer.setRenderTarget(null);
    quad.render(renderer);
  }
  // ------------------------------------------------------------ warm-up
  // Compile every shader and upload every texture *before* the first frame, so
  // scrolling into a scene for the first time doesn't stall on the GPU driver.
  async function warmUp() {
    const textures = new Set();
    const grab = (v) => v && v.isTexture && textures.add(v);
    for (const s of scenes) {
      s.update(1 / 60, 0, pointer);
      s.scene.traverse((o) => {
        const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        for (const m of mats) {
          for (const k in m) grab(m[k]);
          if (m.uniforms) for (const k in m.uniforms) grab(m.uniforms[k].value);
        }
      });
      try {
        await renderer.compileAsync(s.scene, s.camera);
      } catch {
        renderer.compile(s.scene, s.camera);
      }
    }
    for (const t of textures) renderer.initTexture(t);
    // one real pass of every scene (+ its post chain) into an offscreen target, with
    // culling off so off-screen objects (the train starts off-frame) upload their buffers too
    for (let i = scenes.length - 1; i >= 0; i--) {
      const culled = [];
      scenes[i].scene.traverse((o) => o.frustumCulled && (culled.push(o), (o.frustumCulled = false)));
      renderScene(i, rtB, 1 / 60);
      culled.forEach((o) => (o.frustumCulled = true));
      if (scenes[i].warm) scenes[i].warm(renderer, rtB, rtTmp);
    }
    compMat.uniforms.tA.value = rtB.texture;
    compMat.uniforms.tB.value = rtB.texture;
    renderer.setRenderTarget(rtTmp);
    quad.render(renderer);
    renderer.setRenderTarget(null);
  }
  await warmUp();
  last = performance.now();
  renderer.setAnimationLoop(frame);

  // ------------------------------------------------------------ type + HUD
  const panels = [...document.querySelectorAll('.panel')];
  const dots = [...document.querySelectorAll('.dots button')];
  const countEl = document.querySelector('.count b');
  const hintEl = document.querySelector('.hint span');
  for (const line of document.querySelectorAll('.line')) {
    const text = line.textContent;
    line.textContent = '';
    line.setAttribute('aria-label', text);
    for (const ch of text) {
      const s = document.createElement('span');
      s.className = 'ch';
      s.setAttribute('aria-hidden', 'true');
      s.textContent = ch === ' ' ? ' ' : ch;
      line.appendChild(s);
    }
  }
  const chars = (i) => panels[i].querySelectorAll('.ch');
  const subs = (i) => panels[i].querySelectorAll('.sub');
  panels.forEach((_, i) => {
    gsap.set(chars(i), { yPercent: 118 });
    gsap.set(subs(i), { autoAlpha: 0 });
  });
  function showPanel(i) {
    panels[i].classList.add('on');
    gsap.fromTo(chars(i), { yPercent: 118, rotate: 5 }, { yPercent: 0, rotate: 0, duration: 1.1, ease: 'expo.out', stagger: 0.04, overwrite: true });
    gsap.fromTo(subs(i), { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 0.9, ease: 'power3.out', delay: 0.5, stagger: 0.1, overwrite: true });
  }
  function hidePanel(i) {
    panels[i].classList.remove('on');
    gsap.to(chars(i), { yPercent: -118, duration: 0.5, ease: 'power3.in', stagger: 0.012, overwrite: true });
    gsap.to(subs(i), { autoAlpha: 0, duration: 0.3, overwrite: true });
  }
  function setHUD(i) {
    document.body.dataset.scene = String(i);
    countEl.textContent = `0${i + 1}`;
    dots.forEach((d, j) => d.classList.toggle('on', j === i));
    gsap.to(hintEl, {
      yPercent: -110,
      duration: 0.3,
      ease: 'power2.in',
      onComplete: () => {
        hintEl.textContent = HINTS[i];
        gsap.fromTo(hintEl, { yPercent: 110 }, { yPercent: 0, duration: 0.5, ease: 'power3.out' });
      },
    });
  }

  train.onArrive = () => {
    if (current === 2 || (busy && comp.b === 2)) showPanel(2);
  };

  // ------------------------------------------------------------ transitions
  function finish(to) {
    comp.mode = 0;
    comp.a = to;
    comp.grade = to;
    comp.prog = comp.grow = comp.boost = 0;
    current = to;
    Object.assign(eye.state, { focus: 0, dilate: 0, push: 0 });
    Object.assign(tv.state, { intro: 1, chaos: 0, mouth: 0, push: 0 });
    if (to !== 2 && to !== 3) train.reset(); // keep the arrived train (and the dive) for the way back
    gsap.delayedCall(0.25, () => (busy = false)); // swallow trackpad inertia
  }

  /** Scene 1 → 2: the eye locks on, the pupil blows open and we fall through it. */
  function irisIn() {
    Object.assign(comp, { a: 0, b: 1, mode: 1, grow: 0, boost: 0 });
    tv.state.intro = 0;
    const s = eye.state;
    gsap
      .timeline({ onComplete: () => (finish(1), showPanel(1)) })
      .to(s, { focus: 1, duration: 0.8, ease: 'power2.inOut' }, 0)
      .to(s, { dilate: 1, duration: 1.0, ease: 'power2.inOut' }, 0.25)
      .to(s, { push: 1, duration: 2.3, ease: 'power2.inOut' }, 0.3)
      .to(comp, { grow: 1, duration: 0.9, ease: 'power2.out' }, 0.9)
      .to(tv.state, { intro: 1, duration: 1.9, ease: 'power2.out' }, 1.3)
      .to(comp, { grade: 1, duration: 1.2, ease: 'none' }, 1.3)
      .to(comp, { boost: 1, duration: 0.5, ease: 'power2.in' }, 2.2);
  }
  /** Scene 2 → 1: pull back out of the pupil. */
  function irisOut() {
    Object.assign(comp, { a: 0, b: 1, mode: 1, grow: 1, boost: 1 });
    const s = eye.state;
    Object.assign(s, { focus: 1, dilate: 1, push: 1 });
    gsap
      .timeline({ onComplete: () => (finish(0), showPanel(0)) })
      .to(comp, { boost: 0, duration: 0.45, ease: 'power2.out' }, 0)
      .to(tv.state, { intro: 0, duration: 1.3, ease: 'power2.in' }, 0)
      .to(s, { push: 0, duration: 2.3, ease: 'power2.inOut' }, 0.1)
      .to(comp, { grade: 0, duration: 1.2, ease: 'none' }, 0.3)
      .to(comp, { grow: 0, duration: 0.8, ease: 'power2.in' }, 0.9)
      .to(s, { dilate: 0, duration: 0.9, ease: 'power2.inOut' }, 1.4)
      .to(s, { focus: 0, duration: 0.9, ease: 'power2.inOut' }, 1.7);
  }
  /** Scene 2 → 3: the jaw drops, we dive into the mouth and land on the platform. */
  function mouthIn() {
    Object.assign(comp, { a: 1, b: 2, mode: 1, grow: 0, boost: 0 });
    train.reset();
    const s = tv.state;
    gsap
      .timeline({ onComplete: () => finish(2) })
      .to(s, { mouth: 1, duration: 0.45, ease: 'power2.out' }, 0)
      .to(s, { chaos: 0.45, duration: 0.5, ease: 'power2.out', yoyo: true, repeat: 1 }, 0)
      .to(s, { push: 1, duration: 2.2, ease: 'power3.inOut' }, 0.35)
      .call(() => train.play(), null, 0.6)
      .to(comp, { grow: 1, duration: 0.8, ease: 'power2.out' }, 0.95)
      .to(comp, { grade: 2, duration: 1.3, ease: 'none' }, 1.1)
      .to(comp, { boost: 1, duration: 0.55, ease: 'power2.in' }, 2.0);
  }
  /** Scene 3 → 2: climb back out of the mouth. */
  function mouthOut() {
    Object.assign(comp, { a: 1, b: 2, mode: 1, grow: 1, boost: 1 });
    const s = tv.state;
    Object.assign(s, { mouth: 1, push: 1 });
    gsap
      .timeline({ onComplete: () => (finish(1), showPanel(1)) })
      .to(comp, { boost: 0, duration: 0.5, ease: 'power2.out' }, 0)
      .to(s, { push: 0, duration: 2.1, ease: 'power3.inOut' }, 0.1)
      .to(comp, { grade: 1, duration: 1.2, ease: 'none' }, 0.2)
      .to(comp, { grow: 0, duration: 0.7, ease: 'power2.in' }, 0.75)
      .to(s, { mouth: 0, duration: 0.5, ease: 'power2.in' }, 1.7);
  }

  /** Scene 3 → 4: pick a face in the crowd and fall into its white eye. */
  function eyeDive() {
    Object.assign(comp, { a: 2, b: 3, mode: 1, grow: 0, boost: 0 });
    train.aimDive();
    gsap
      .timeline({ onComplete: () => (finish(3), showPanel(3)) })
      .to(train.state, { push: 1, duration: 2.5, ease: 'power1.inOut' }, 0)
      .to(comp, { grow: 0.8, duration: 0.6, ease: 'power2.out' }, 1.65) // let the white swell first
      .to(comp, { grade: 3, duration: 1.1, ease: 'none' }, 1.4)
      .to(comp, { boost: 1, duration: 0.5, ease: 'power2.in' }, 2.1);
  }
  /** Scene 4 → 3: back out of the eye, into the carriage. */
  function eyeOut() {
    Object.assign(comp, { a: 2, b: 3, mode: 1, grow: 1, boost: 1 });
    train.state.push = 1;
    gsap
      .timeline({ onComplete: () => (finish(2), showPanel(2)) })
      .to(comp, { boost: 0, duration: 0.5, ease: 'power2.out' }, 0)
      .to(comp, { grade: 2, duration: 1.1, ease: 'none' }, 0.1)
      .to(comp, { grow: 0, duration: 0.55, ease: 'power2.in' }, 0.4)
      .to(train.state, { push: 0, duration: 2.3, ease: 'power2.out' }, 0.05);
  }

  /** Any other jump (the side dots): the signal tears and re-tunes. */
  function glitch(from, to) {
    Object.assign(comp, { a: from, b: to, mode: 2, prog: 0 });
    if (to === 2) train.reset();
    const tl = gsap
      .timeline({ onComplete: () => (finish(to), to !== 2 && showPanel(to)) })
      .to(comp, { prog: 1, duration: 1.5, ease: 'power1.inOut' }, 0)
      .to(comp, { grade: to, duration: 1.5, ease: 'none' }, 0);
    if (from === 1) tl.to(tv.state, { chaos: 1, duration: 0.7, ease: 'power2.in' }, 0);
    if (to === 1) tl.fromTo(tv.state, { chaos: 1 }, { chaos: 0, duration: 1.1, ease: 'power2.out' }, 0.5);
    if (to === 2) tl.call(() => train.play(), null, 0.8);
  }

  function go(to) {
    if (busy || to === current || to < 0 || to >= scenes.length) return;
    busy = true;
    const from = current;
    hidePanel(from);
    setHUD(to);
    tv.release();
    if (from === 0 && to === 1) irisIn();
    else if (from === 1 && to === 0) irisOut();
    else if (from === 1 && to === 2) mouthIn();
    else if (from === 2 && to === 1) mouthOut();
    // the eye dive needs the train parked; if it's still pulling in, fall back to the glitch
    else if (from === 2 && to === 3 && train.state.x < 0.05) eyeDive();
    else if (from === 3 && to === 2 && train.state.arrived > 0.5) eyeOut();
    else glitch(from, to);
  }

  // ------------------------------------------------------------ input
  Observer.create({
    target: window,
    type: 'wheel,touch',
    wheelSpeed: -1,
    tolerance: 14,
    preventDefault: true,
    onUp: () => go(current + 1),
    onDown: () => go(current - 1),
  });
  window.addEventListener('keydown', (e) => {
    if (['ArrowDown', 'PageDown', ' ', 'Enter'].includes(e.key)) go(current + 1);
    if (['ArrowUp', 'PageUp'].includes(e.key)) go(current - 1);
  });
  dots.forEach((d, i) => d.addEventListener('click', () => go(i)));

  const cursor = document.querySelector('.cursor');
  const cx = gsap.quickTo(cursor, 'x', { duration: 0.18, ease: 'power3.out' });
  const cy = gsap.quickTo(cursor, 'y', { duration: 0.18, ease: 'power3.out' });
  const track = (e) => {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -((e.clientY / window.innerHeight) * 2 - 1);
    pointer.idle = 0;
    cx(e.clientX);
    cy(e.clientY);
    cursor.classList.add('live');
  };
  window.addEventListener('pointermove', track);
  window.addEventListener('pointerdown', (e) => {
    track(e);
    cursor.classList.add('down');
    if (e.target.closest?.('.dots')) return;
    if (current === 1 && !busy) {
      tapNDC.set(pointer.x, pointer.y);
      tv.tap(tapNDC);
    }
    if (current === 3 && !busy) chase.tap();
    if (current === 0 && !busy) eye.fire(pointer.x, pointer.y);
  });
  const up = () => {
    cursor.classList.remove('down');
    tv.release();
  };
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
  document.addEventListener('pointerleave', () => cursor.classList.remove('live'));

  // ------------------------------------------------------------ go
  setHUD(0);
  document.body.classList.add('ready');
  gsap.delayedCall(0.35, () => current === 0 && !busy && showPanel(0)); // skip if the visitor already scrolled on

  // handy for poking at things from the console
  window.__ailovesus = { go, scenes, comp, pointer };
}

boot();
