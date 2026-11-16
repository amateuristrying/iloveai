// Every sound on the site is synthesised live with the Web Audio API: no files to
// download, and each one can follow its animation exactly (the train's motor whine
// falls as it brakes, the teeth clack on each real bounce of the jaw, and so on).
//
// Browsers only allow audio after a user gesture, so nothing plays until the first
// tap / key press. Transitions are silent; only the scenes themselves make sound.

const ON_KEY = 'ailovesus:sound';

export function createAudio() {
  let ctx = null;
  let master;
  let verbIn;
  let noiseBuf;
  let brownBuf;
  let shaper;
  let enabled = true;
  try {
    enabled = localStorage.getItem(ON_KEY) !== 'off';
  } catch {
    /* storage blocked: default on */
  }

  // ------------------------------------------------------------------ plumbing
  function init() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC({ latencyHint: 'interactive' });
    master = ctx.createGain();
    master.gain.value = enabled ? 0.9 : 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.knee.value = 8;
    comp.ratio.value = 5;
    comp.attack.value = 0.003;
    comp.release.value = 0.22;
    master.connect(comp).connect(ctx.destination);

    noiseBuf = makeNoise(2.5, false);
    brownBuf = makeNoise(4, true);

    const verb = ctx.createConvolver();
    verb.buffer = makeIR(2.6, 2.6);
    verbIn = ctx.createGain();
    verbIn.gain.value = 0.38;
    verbIn.connect(verb).connect(master);

    shaper = ctx.createWaveShaper();
    shaper.curve = makeCurve(18);
    shaper.oversample = '2x';
  }
  function makeNoise(seconds, brown) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        if (brown) {
          last = (last + 0.02 * w) / 1.02;
          d[i] = last * 3.5;
        } else d[i] = w;
      }
    }
    return buf;
  }
  function makeIR(seconds, decay) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }
  function makeCurve(k) {
    const n = 1024;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
    }
    return curve;
  }

  const live = () => ctx && ctx.state === 'running' && enabled;
  const now = () => ctx.currentTime;
  /** Route a node to the master (and optionally the reverb), with gain + stereo pan. */
  function out(node, { gain = 1, verb = 0, pan = 0 } = {}) {
    const g = ctx.createGain();
    g.gain.value = gain;
    let tail = node.connect(g);
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      tail = tail.connect(p);
    }
    tail.connect(master);
    if (verb) {
      const s = ctx.createGain();
      s.gain.value = verb;
      tail.connect(s).connect(verbIn);
    }
    return g;
  }
  /** Percussive envelope on an AudioParam: silence → peak → silence. */
  function env(param, t, attack, peak, decay) {
    param.cancelScheduledValues(t);
    param.setValueAtTime(0.0001, t);
    param.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
    param.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }
  function osc(type, f0, t, f1, glide) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== undefined) o.frequency.exponentialRampToValueAtTime(f1, t + glide);
    return o;
  }
  function noise(t, dur, buf = noiseBuf) {
    const s = ctx.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    s.start(t, Math.random() * (buf.duration - 0.1));
    s.stop(t + dur);
    return s;
  }
  function filter(type, f, q = 0.7) {
    const f_ = ctx.createBiquadFilter();
    f_.type = type;
    f_.frequency.value = f;
    f_.Q.value = q;
    return f_;
  }
  /** A short noise "tick" through a band-pass: debris, gravel, clicks. */
  function tick(t, freq, gain, pan = 0, dur = 0.018) {
    const n = noise(t, dur + 0.02);
    const bp = filter('bandpass', freq, 2.5);
    const g = ctx.createGain();
    env(g.gain, t, 0.001, gain, dur);
    n.connect(bp).connect(g);
    out(g, { pan, verb: 0.25 });
  }

  // ------------------------------------------------------------------ scene 1: the laser
  /** Rising, trembling energy whine while the pupil charges (matches the 0.26s charge). */
  function laserCharge() {
    if (!live()) return;
    const t = now();
    const d = 0.28;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.2, t + d);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.06);
    const bp = filter('bandpass', 500, 5);
    bp.frequency.setValueAtTime(500, t);
    bp.frequency.exponentialRampToValueAtTime(5200, t + d);
    const trem = ctx.createGain();
    trem.gain.value = 0.6;
    const lfo = osc('sine', 22, t, 70, d);
    const lfoAmt = ctx.createGain();
    lfoAmt.gain.value = 0.4;
    lfo.connect(lfoAmt).connect(trem.gain);
    for (const [type, f0, f1] of [['sawtooth', 150, 1700], ['square', 152, 1730], ['sine', 75, 860]]) {
      const o = osc(type, f0, t, f1, d);
      o.connect(bp);
      o.start(t);
      o.stop(t + d + 0.08);
    }
    lfo.start(t);
    lfo.stop(t + d + 0.08);
    bp.connect(trem).connect(g);
    out(g, { verb: 0.2 });
    // a glassy shimmer on top
    const sh = noise(t, d + 0.05);
    const hp = filter('highpass', 6500, 0.8);
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0.0001, t);
    sg.gain.exponentialRampToValueAtTime(0.06, t + d);
    sg.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.05);
    sh.connect(hp).connect(sg);
    out(sg);
  }
  /** The beam itself: a falling FM zap. */
  function laserBeam() {
    if (!live()) return;
    const t = now();
    const car = osc('sawtooth', 2800, t, 160, 0.42);
    const mod = osc('sine', 85, t);
    const modAmt = ctx.createGain();
    modAmt.gain.value = 520;
    mod.connect(modAmt).connect(car.frequency);
    const lp = filter('lowpass', 7000, 1.2);
    lp.frequency.setValueAtTime(7000, t);
    lp.frequency.exponentialRampToValueAtTime(800, t + 0.45);
    const g = ctx.createGain();
    env(g.gain, t, 0.004, 0.26, 0.45);
    car.connect(lp).connect(g);
    out(g, { verb: 0.35 });
    const sub = osc('sine', 950, t, 70, 0.3);
    const sg = ctx.createGain();
    env(sg.gain, t, 0.003, 0.22, 0.32);
    sub.connect(sg);
    out(sg);
    for (const o of [car, mod, sub]) {
      o.start(t);
      o.stop(t + 0.6);
    }
  }
  /** Ground impact: sub boom, distorted roar, a sharp crack, then raining debris. */
  function blast() {
    if (!live()) return;
    const t = now();
    const boom = osc('sine', 95, t, 30, 0.7);
    const bg = ctx.createGain();
    env(bg.gain, t, 0.004, 1.0, 1.3);
    boom.connect(bg);
    out(bg, { verb: 0.2 });
    boom.start(t);
    boom.stop(t + 1.5);

    const roar = noise(t, 1.8);
    const lp = filter('lowpass', 5200, 0.9);
    lp.frequency.setValueAtTime(5200, t);
    lp.frequency.exponentialRampToValueAtTime(160, t + 1.3);
    const rg = ctx.createGain();
    env(rg.gain, t, 0.006, 0.75, 1.5);
    const sh = ctx.createWaveShaper();
    sh.curve = shaper.curve;
    roar.connect(lp).connect(sh).connect(rg);
    out(rg, { verb: 0.55 });

    const crack = noise(t, 0.2);
    const hp = filter('highpass', 1800, 0.9);
    const cg = ctx.createGain();
    env(cg.gain, t, 0.001, 0.55, 0.13);
    crack.connect(hp).connect(cg);
    out(cg, { verb: 0.3 });

    for (let i = 0; i < 16; i++) {
      tick(t + 0.18 + Math.random() * 1.2, 900 + Math.random() * 3500, 0.05 + Math.random() * 0.12, Math.random() * 1.6 - 0.8);
    }
  }

  // ------------------------------------------------------------------ scene 2: teeth
  /** Enamel on enamel: a tiny click with bright resonances and a bony "tock" under it. */
  let lastClack = 0;
  function clack(strength = 1) {
    if (!live()) return;
    const t = now();
    if (t - lastClack < 0.035) return;
    lastClack = t;
    const s = Math.min(1, Math.max(0.15, strength));
    const n = noise(t, 0.03);
    const bp = filter('bandpass', 3600 + Math.random() * 600, 1.8);
    const ng = ctx.createGain();
    env(ng.gain, t, 0.0005, 0.95 * s, 0.014);
    n.connect(bp).connect(ng);
    out(ng, { verb: 0.12 });
    for (const f of [2150, 3380, 4870]) {
      const o = osc('sine', f * (0.97 + Math.random() * 0.06), t);
      const g = ctx.createGain();
      env(g.gain, t, 0.0008, 0.15 * s, 0.035 + Math.random() * 0.03);
      o.connect(g);
      out(g, { verb: 0.1 });
      o.start(t);
      o.stop(t + 0.1);
    }
    const thock = osc('sine', 420, t, 210, 0.05);
    const tg = ctx.createGain();
    env(tg.gain, t, 0.001, 0.32 * s, 0.055);
    thock.connect(tg);
    out(tg);
    thock.start(t);
    thock.stop(t + 0.1);
  }

  // ------------------------------------------------------------------ scene 3: the train
  let train = null;
  function buildTrain() {
    const bus = ctx.createGain();
    bus.gain.value = 0;
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
    bus.connect(pan).connect(master);
    const send = ctx.createGain();
    send.gain.value = 0.25;
    pan.connect(send).connect(verbIn);

    const loop = (buf) => {
      const s = ctx.createBufferSource();
      s.buffer = buf;
      s.loop = true;
      s.start();
      return s;
    };
    const voice = (src, f, g0 = 0) => {
      const g = ctx.createGain();
      g.gain.value = g0;
      src.connect(f).connect(g).connect(bus);
      return g;
    };
    // tunnel rumble, steel-on-steel roar, traction-motor whine, brake squeal
    const rumble = voice(loop(brownBuf), filter('lowpass', 240, 0.6));
    const roar = voice(loop(noiseBuf), filter('bandpass', 750, 0.7));
    const motor = ctx.createOscillator();
    motor.type = 'sawtooth';
    motor.frequency.value = 80;
    motor.start();
    const motorG = voice(motor, filter('lowpass', 1400, 1.5));
    const squealG = ctx.createGain();
    squealG.gain.value = 0;
    squealG.connect(bus);
    const vib = ctx.createOscillator();
    vib.frequency.value = 6.5;
    const vibAmt = ctx.createGain();
    vibAmt.gain.value = 35;
    vib.connect(vibAmt);
    vib.start();
    for (const f of [2870, 3190]) {
      const o = ctx.createOscillator();
      o.frequency.value = f;
      vibAmt.connect(o.frequency);
      const g = ctx.createGain();
      g.gain.value = 0.5;
      o.connect(g).connect(squealG);
      o.start();
    }
    // the station itself: fluorescent buzz (only audible once the lights are up)
    const hum = ctx.createOscillator();
    hum.type = 'square';
    hum.frequency.value = 100;
    hum.start();
    const humG = ctx.createGain();
    humG.gain.value = 0;
    hum.connect(filter('lowpass', 500, 0.7)).connect(humG).connect(master);

    // the crowd behind the glass: formant "voices" gated by random syllables, then muffled
    const murmurBus = ctx.createGain();
    murmurBus.gain.value = 0;
    const glass = filter('lowpass', 1500, 0.5);
    murmurBus.connect(glass).connect(master);
    const ms = ctx.createGain();
    ms.gain.value = 0.3;
    glass.connect(ms).connect(verbIn);
    const voices = Array.from({ length: 8 }, (_, i) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      const base = 95 + Math.random() * 130;
      o.frequency.value = base;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 3 + Math.random() * 3;
      const la = ctx.createGain();
      la.gain.value = base * 0.06;
      lfo.connect(la).connect(o.frequency);
      const f1 = filter('bandpass', 600, 6);
      const f2 = filter('bandpass', 1300, 8);
      const g = ctx.createGain();
      g.gain.value = 0;
      o.connect(f1).connect(g);
      o.connect(f2).connect(g);
      const breath = ctx.createBufferSource();
      breath.buffer = noiseBuf;
      breath.loop = true;
      const bf = filter('bandpass', 900 + i * 90, 1.2);
      const bg = ctx.createGain();
      bg.gain.value = 0.15;
      breath.connect(bf).connect(bg).connect(g);
      g.connect(murmurBus);
      for (const n of [o, lfo, breath]) n.start();
      return { o, f1, f2, g, base, next: 0, pan: i % 2 ? 0.4 : -0.4 };
    });

    return { bus, pan, rumble, roar, motor, motorG, squealG, humG, murmurBus, voices, prevX: null, dist: 0, stopped: false, playT: -1 };
  }

  /** One wheel set over a rail joint: "ka-chunk". */
  function clatter(gain, pan) {
    const t = now();
    for (const [dt, f] of [[0, 1400], [0.075, 1100]]) {
      const n = noise(t + dt, 0.05);
      const lp = filter('lowpass', f, 0.9);
      const g = ctx.createGain();
      env(g.gain, t + dt, 0.002, gain, 0.05);
      n.connect(lp).connect(g);
      out(g, { pan, verb: 0.3 });
      const th = osc('sine', 170, t + dt, 80, 0.06);
      const tg = ctx.createGain();
      env(tg.gain, t + dt, 0.002, gain * 0.8, 0.06);
      th.connect(tg);
      out(tg, { pan });
      th.start(t + dt);
      th.stop(t + dt + 0.1);
    }
  }
  /** Brakes release air when the train stops, with a heavy final clunk. */
  function hiss() {
    const t = now();
    const n = noise(t, 1.4);
    const hp = filter('highpass', 2800, 0.6);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
    n.connect(hp).connect(g);
    out(g, { verb: 0.3 });
    const k = osc('sine', 110, t, 45, 0.25);
    const kg = ctx.createGain();
    env(kg.gain, t, 0.003, 0.45, 0.3);
    k.connect(kg);
    out(kg);
    k.start(t);
    k.stop(t + 0.4);
  }
  /** Two-note station chime when the doors line up. */
  function chime() {
    if (!live()) return;
    const t = now() + 0.1;
    [659.25, 523.25].forEach((f, i) => {
      const tt = t + i * 0.42;
      for (const [m, a] of [[1, 0.12], [2.01, 0.03], [3.02, 0.015]]) {
        const o = osc('sine', f * m, tt);
        const g = ctx.createGain();
        env(g.gain, tt, 0.006, a, 1.4);
        o.connect(g);
        out(g, { verb: 0.6 });
        o.start(tt);
        o.stop(tt + 1.6);
      }
    });
  }

  let scene = 0;
  let murmurOn = false;
  /**
   * Called every frame. `tr` is the train scene's state; `murmur` says whether the
   * carriage crowd should be audible (train parked, scene settled).
   */
  function frame(dt, tr, murmur) {
    if (!ctx || ctx.state !== 'running') return;
    if (!train) train = buildTrain();
    const T = train;
    const t = now();
    const x = tr.x;
    if (T.prevX === null) T.prevX = x;
    const speed = Math.abs(x - T.prevX) / Math.max(dt, 1e-3);
    T.prevX = x;
    const inTrain = scene === 2;
    T.bus.gain.setTargetAtTime(inTrain ? 1 : 0, t, inTrain ? 0.05 : 0.25);

    const k = Math.min(1, speed / 15);
    const preroll = x > 50 ? tr.light * 0.55 : 0; // rumble from the tunnel before it appears
    T.rumble.gain.setTargetAtTime(Math.max(preroll, 0.15 + 0.85 * k) * (speed > 0.05 || preroll > 0 ? 0.9 : 0), t, 0.08);
    T.roar.gain.setTargetAtTime(0.32 * Math.pow(k, 1.4), t, 0.06);
    T.motor.frequency.setTargetAtTime(55 + speed * 24, t, 0.05);
    T.motorG.gain.setTargetAtTime(speed > 0.2 ? 0.06 + 0.07 * k : 0, t, 0.08);
    const braking = speed > 0.25 && speed < 6.5 && x < 30;
    T.squealG.gain.setTargetAtTime(braking ? 0.012 + 0.022 * (1 - speed / 6.5) : 0, t, 0.12);
    if (T.pan.pan) T.pan.pan.setTargetAtTime(Math.max(-0.2, Math.min(0.85, x / 30)), t, 0.1);
    T.humG.gain.setTargetAtTime(inTrain ? 0.012 * tr.light : 0, t, 0.3);

    // rail joints: a clack every few metres travelled
    if (inTrain && speed > 0.6) {
      T.dist += speed * dt;
      if (T.dist > 4.6) {
        T.dist = 0;
        clatter(0.12 + 0.3 * k, Math.max(-0.2, Math.min(0.8, x / 30)));
      }
    }
    if (inTrain && !T.stopped && x < 0.03 && speed < 0.1 && T.wasMoving) {
      T.stopped = true;
      hiss();
    }
    if (speed > 1) {
      T.wasMoving = true;
      T.stopped = false;
    }
    if (x > 50) T.wasMoving = false;

    // the murmur: re-roll each voice's syllable every ~110ms
    murmurOn = murmur && inTrain;
    T.murmurBus.gain.setTargetAtTime(murmurOn ? 0.45 : 0, t, murmurOn ? 0.6 : 0.2);
    if (murmurOn) {
      for (const v of T.voices) {
        if (t < v.next) continue;
        v.next = t + 0.07 + Math.random() * 0.16;
        const speak = Math.random() < 0.55;
        v.g.gain.setTargetAtTime(speak ? 0.05 + Math.random() * 0.08 : 0, t, 0.03);
        v.f1.frequency.setTargetAtTime(380 + Math.random() * 500, t, 0.04);
        v.f2.frequency.setTargetAtTime(950 + Math.random() * 1100, t, 0.04);
        v.o.frequency.setTargetAtTime(v.base * (0.9 + Math.random() * 0.25), t, 0.06);
      }
    }
  }

  // ------------------------------------------------------------------ scene 4: the hand
  /** Servo spin-up + hydraulic hiss as the hand winds up. */
  function windup() {
    if (!live()) return;
    const t = now();
    const s = osc('sawtooth', 110, t, 560, 0.26);
    const sq = osc('square', 55, t, 280, 0.26);
    const lp = filter('lowpass', 800, 3);
    lp.frequency.setValueAtTime(800, t);
    lp.frequency.exponentialRampToValueAtTime(2600, t + 0.26);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.1, t + 0.18);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    s.connect(lp);
    sq.connect(lp);
    lp.connect(g);
    out(g, { verb: 0.15 });
    for (const o of [s, sq]) {
      o.start(t);
      o.stop(t + 0.35);
    }
    const n = noise(t, 0.25);
    const hp = filter('highpass', 3500, 0.7);
    const ng = ctx.createGain();
    env(ng.gain, t, 0.01, 0.06, 0.2);
    n.connect(hp).connect(ng);
    out(ng);
  }
  /** Air ripping past the falling hand. */
  function whoosh() {
    if (!live()) return;
    const t = now();
    const n = noise(t, 0.3);
    const bp = filter('bandpass', 350, 1.4);
    bp.frequency.setValueAtTime(350, t);
    bp.frequency.exponentialRampToValueAtTime(2600, t + 0.15);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.32, t + 0.14);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    n.connect(bp).connect(g);
    out(g, { verb: 0.2 });
  }
  /** Metal fist into concrete: sub thump, crunch, a ringing metallic clang, rubble. */
  function stomp() {
    if (!live()) return;
    const t = now();
    const thump = osc('sine', 80, t, 27, 0.5);
    const tg = ctx.createGain();
    env(tg.gain, t, 0.003, 1.0, 0.95);
    thump.connect(tg);
    out(tg, { verb: 0.2 });
    thump.start(t);
    thump.stop(t + 1.1);

    const crunch = noise(t, 0.9);
    const lp = filter('lowpass', 3000, 0.8);
    lp.frequency.setValueAtTime(3000, t);
    lp.frequency.exponentialRampToValueAtTime(140, t + 0.6);
    const cg = ctx.createGain();
    env(cg.gain, t, 0.002, 0.7, 0.7);
    const sh = ctx.createWaveShaper();
    sh.curve = makeCurve(30);
    crunch.connect(lp).connect(sh).connect(cg);
    out(cg, { verb: 0.45 });

    for (const [f, a, d] of [[196, 0.07, 1.1], [311, 0.06, 0.9], [467, 0.05, 0.8], [622, 0.04, 0.7], [935, 0.03, 0.5], [1410, 0.02, 0.35]]) {
      const o = osc('sine', f * (0.98 + Math.random() * 0.04), t);
      const g = ctx.createGain();
      env(g.gain, t, 0.002, a, d);
      o.connect(g);
      out(g, { verb: 0.5 });
      o.start(t);
      o.stop(t + d + 0.1);
    }
    for (let i = 0; i < 12; i++) tick(t + 0.08 + Math.random() * 0.8, 600 + Math.random() * 2500, 0.05 + Math.random() * 0.1, Math.random() * 1.4 - 0.7);
  }
  /** The runner touches down. */
  function land() {
    if (!live()) return;
    const t = now();
    const o = osc('sine', 150, t, 65, 0.12);
    const g = ctx.createGain();
    env(g.gain, t, 0.002, 0.22, 0.13);
    o.connect(g);
    out(g);
    o.start(t);
    o.stop(t + 0.2);
    tick(t, 700, 0.12, 0.3, 0.05);
  }

  // ------------------------------------------------------------------ public
  return {
    /** Call from a user gesture (tap / key). Creates or resumes the audio context. */
    unlock() {
      if (!ctx) init();
      if (ctx && ctx.state === 'suspended') ctx.resume();
    },
    get enabled() {
      return enabled;
    },
    setEnabled(on) {
      enabled = on;
      try {
        localStorage.setItem(ON_KEY, on ? 'on' : 'off');
      } catch {
        /* ignore */
      }
      if (ctx) master.gain.setTargetAtTime(on ? 0.9 : 0, ctx.currentTime, 0.05);
    },
    setScene(i) {
      scene = i;
    },
    frame,
    laserCharge,
    laserBeam,
    blast,
    clack,
    chime,
    windup,
    whoosh,
    stomp,
    land,
  };
}
