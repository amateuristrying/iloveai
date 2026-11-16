# AI Loves Us

A satire in four scenes. Three.js + GSAP, one WebGL canvas, scroll to move between scenes.

1. **AI LOVES US.** A colossal eyeball watches a devoted crowd. It follows your cursor, but only inside a fixed cone; push past it and the eye rests on the rim of its range. Tap the plaza and it fires a laser: the blast vaporises whoever stood there and throws everyone nearby, who eventually get up and walk back.
2. **WE LOVE AI AS WELL.** A head made of CRT televisions with very human teeth. Tap the screens: the jaw drops and a glitch ripples outward from your finger, re-tinting every tube.
3. **AI LOVES US.** An empty station. A packed metro slides in from the right and brakes with its doors in front of you.
4. **WE CAN'T ESCAPE AI.** Ink on a white page: a giant robotic hand chases a running figure, forever. Tap and it slams the ground; the runner always leaps clear.

Transitions: an iris wipe through the eye's pupil (1 → 2), a dive into the TV head's open mouth (2 → 3), and a fall into a commuter's white eye (3 → 4). The side dots jump with a signal-loss glitch.

## Sound

All sound effects are synthesised live with the Web Audio API (`src/audio.js`), so there are no audio files. Browsers only allow audio after a gesture, so sound starts on the first tap or key press. The **Sound** button in the top bar (or the M key) mutes it, and the choice is remembered. Scrolling between scenes is silent.

## Develop

```bash
npm install
npm run dev
```

Requires Node 20.19+ (see `.nvmrc`).

## Deploy to Cloudflare

**Workers (static assets):** `npm run deploy` builds and runs `wrangler deploy` with `wrangler.jsonc`.
To deploy from git instead, connect the repo in the Cloudflare dashboard (Workers & Pages → Create → Import a repository). Use build command `npm run build` and deploy command `npx wrangler deploy`.

**Pages:** connect the repo with build command `npm run build` and output directory `dist`.

`public/_headers` gives the hashed bundles a one-year immutable cache.

## Performance notes

- All shaders are compiled and all textures uploaded before the first frame, so moving into a scene for the first time doesn't stall.
- Rendering is capped at a pixel budget instead of full retina resolution, and the scale drops automatically if frames start missing.
- Only the visible scene renders; both render only during a transition.
