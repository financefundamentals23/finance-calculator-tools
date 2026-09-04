/* details-scene.js — the compact room diorama on "My details".
 *
 * Same treatment as the sign-in page (room-scene.js): a small corner-cut room
 * sitting on a floating plinth, seen from outside on a long lens so it reads
 * almost isometric. A different room, so the two pages are siblings rather than
 * a repeat — this one is the study, sign-in is the games corner.
 *
 * Two earlier attempts are worth knowing about, because both failed in ways
 * that aren't obvious from the code:
 *   - A close interior view of a desk read as "a table", not a room.
 *   - Putting the camera inside a full-length room did read as a room, but
 *     needed heavy fog for depth, and in light mode that fog repainted every
 *     surface near-white and washed the model out.
 * A compact diorama needs no fog at all, which is why this version has none.
 *
 * Everything is built from primitives at runtime; there is no model to load.
 * Shares room-scene.js's visual language: brand palette, clay materials,
 * bevelled edges, image-based lighting, ground-truth ambient occlusion.
 */

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const C = {
  navy:      0x132135,
  navyMid:   0x203352,
  navyLight: 0x2b4266,
  sky:       0x5cb6f9,
  skyLight:  0x8ccbfb,
  skyPale:   0xc4e3fd,
  cream:     0xf1e6d2,
  wood:      0xd9c3a1,
  coral:     0xef6a5f,
  green:     0x4fd39a,
  yellow:    0xe7c948,
  orange:    0xf4a341,
  white:     0xe9eff8
};

const ROOM = { size: 9.0, wall: 5.4 };   // floor is square; walls on two sides

const canvas = document.getElementById('detailsCanvas');
if (canvas) start(canvas, canvas.parentElement);

function start(canvas, host) {
  // Below the layout breakpoint the panel is display:none — don't build a
  // WebGL context a phone will never show.
  if (window.matchMedia && window.matchMedia('(max-width: 860px)').matches) return;
  try {
    init(canvas, host);
  } catch (err) {
    // A backdrop is never worth breaking the page over.
    console.error('Details scene failed to start:', err);
    canvas.style.display = 'none';
  }
}

function init(canvas, host) {
  const reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------------------------------------------------------- renderer */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  /* Full device pixel ratio. Capping this lower to buy frame rate shows up
     immediately as a soft render; trim the AO sample count instead. */
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearAlpha(0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;

  const scene = new THREE.Scene();
  /* Deliberately no fog. A floating diorama has nothing to recede into, and in
     light mode a pale fog colour bleeds over the whole model. */

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = envRT.texture;
  scene.environmentIntensity = 0.4;
  pmrem.dispose();

  /* A long lens seen from outside — this is what gives the sign-in diorama its
     flat, almost isometric look, and it keeps the room reading as one small
     object rather than a space you're standing in. Distance is solved per
     resize because the panel is extremely portrait. */
  const camera = new THREE.PerspectiveCamera(28, 1, 0.5, 400);
  const lookAt = new THREE.Vector3(0, 1.9, 0);
  const camDir = new THREE.Vector3(1, 0.82, 1).normalize();
  /* The diorama's eight bounding-box corners, measured once the room is built.
     Fitting against the projected corners is exact — a bounding sphere is far
     too generous for a wide flat room and leaves it looking shrunken, while
     fitting width alone (the earlier approach) let the model overflow and run
     over the hint text on a wide screen. */
  const corners = [];
  const UP = new THREE.Vector3(0, 1, 0);
  const SPIN_LIMIT = 0.30;   // drift amplitude; the fit is solved across it
  let camDist = 40, fitDepth = 8;

  // Distance at which every corner sits inside the frustum, for one orbit angle.
  function distanceFor(spin, vFov, hFov) {
    const d = camDir.clone().applyAxisAngle(UP, spin);
    const right = new THREE.Vector3().crossVectors(UP, d).normalize();
    const up = new THREE.Vector3().crossVectors(d, right).normalize();
    let halfW = 0, halfH = 0, depth = 0;
    for (const c of corners) {
      const v = c.clone().sub(lookAt);
      halfW = Math.max(halfW, Math.abs(v.dot(right)));
      halfH = Math.max(halfH, Math.abs(v.dot(up)));
      depth = Math.max(depth, Math.abs(v.dot(d)));
    }
    fitDepth = depth;
    /* Push back a fraction of the model's half-depth, because the near face sits
       closer than the centre and projects larger. Only a fraction: this is a 28
       degree lens, so the perspective spread is mild, and compensating for the
       full depth leaves the diorama looking shrunken in its panel. */
    return Math.max(halfW / Math.tan(hFov / 2), halfH / Math.tan(vFov / 2)) * 1.02
           + depth * 0.38;
  }

  function frameCamera() {
    const vFov = camera.fov * Math.PI / 180;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
    // The room orbits, so fit the worst case across the drift's full range.
    const need = Math.max(
      distanceFor(-SPIN_LIMIT, vFov, hFov),
      distanceFor(0, vFov, hFov),
      distanceFor(SPIN_LIMIT, vFov, hFov)
    );
    camDist = Math.min(220, Math.max(14, need));
    /* Clip planes follow the solved distance. A long lens puts the camera tens
       of units out, and a fixed 0.5/400 range gives a near:far ratio around 800
       — far too little depth precision for the AO pass to read, which tanks
       both quality and frame rate. */
    camera.near = Math.max(0.5, camDist - fitDepth * 2.2);
    camera.far = camDist + fitDepth * 2.2;
    camera.updateProjectionMatrix();
  }
  function placeCamera(spin) {
    const d = camDir.clone();
    if (spin) d.applyAxisAngle(new THREE.Vector3(0, 1, 0), spin);
    camera.position.copy(d).multiplyScalar(camDist).add(lookAt);
    camera.lookAt(lookAt);
  }

  /* ------------------------------------------------------------------ lights */
  const ambient = new THREE.AmbientLight(0xffffff, 0.06);
  scene.add(ambient);

  const hemi = new THREE.HemisphereLight(0xffffff, C.navyMid, 0.22);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xfff4e8, 3.1);
  key.position.set(9, 11, 8);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 46;
  key.shadow.camera.left = -8;
  key.shadow.camera.right = 8;
  key.shadow.camera.top = 8;
  key.shadow.camera.bottom = -8;
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.018;
  scene.add(key);

  const fill = new THREE.DirectionalLight(C.skyPale, 0.4);
  fill.position.set(-9, 6, 5);
  scene.add(fill);

  /* --------------------------------------------------------------- materials */
  function mat(color, opts) {
    return new THREE.MeshStandardMaterial(
      Object.assign({ color, roughness: 0.72, metalness: 0, envMapIntensity: 1.0 },
                    opts || {}));
  }
  const room = new THREE.Group();
  scene.add(room);

  function add(geo, material, x, y, z, parent) {
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    (parent || room).add(mesh);
    return mesh;
  }
  function box(w, h, d, color, x, y, z, parent) {
    const r = Math.min(0.05, Math.min(w, h, d) * 0.34);
    return add(new RoundedBoxGeometry(w, h, d, 3, r), mat(color), x, y, z, parent);
  }
  function cyl(rt, rb, h, color, x, y, z, seg, parent) {
    return add(new THREE.CylinderGeometry(rt, rb, h, seg || 36), mat(color), x, y, z, parent);
  }

  /* ---------------------------------------------------------- plinth + shell */
  const S = ROOM.size, half = S / 2;

  const plinth = box(S + 1.6, 0.7, S + 1.6, C.skyLight, 0, -0.85, 0);
  plinth.castShadow = false;

  const floor = box(S, 0.4, S, C.navyMid, 0, -0.2, 0);
  floor.castShadow = false;

  // Two walls only, so the room stays open to the camera — same cutaway the
  // sign-in diorama uses.
  const backWall = box(S, ROOM.wall, 0.34, C.navyLight, 0, ROOM.wall / 2, -half + 0.17);
  backWall.castShadow = false;
  const leftWall = box(0.34, ROOM.wall, S, C.navy, -half + 0.17, ROOM.wall / 2, 0);
  leftWall.castShadow = false;

  // Skirting where each wall meets the floor.
  box(S, 0.26, 0.14, C.navyMid, 0, 0.13, -half + 0.4).castShadow = false;
  box(0.14, 0.26, S, C.navyMid, -half + 0.4, 0.13, 0).castShadow = false;

  /* ------------------------------------------------------------------- rug */
  box(4.6, 0.06, 4.2, C.navyLight, 0.7, 0.03, 1.0).castShadow = false;
  box(3.7, 0.03, 3.3, C.navy, 0.7, 0.07, 1.0).castShadow = false;

  /* ------------------------------------------------ desk against back wall */
  const deskY = 1.5, deskZ = -half + 1.3;
  box(3.9, 0.2, 1.8, C.wood, 1.25, deskY, deskZ);
  [[-1.7, -0.7], [-1.7, 0.7], [1.7, -0.7], [1.7, 0.7]].forEach(([dx, dz]) => {
    box(0.18, deskY, 0.18, C.cream, 1.25 + dx, deskY / 2, deskZ + dz);
  });

  const dTop = deskY + 0.1;
  // Monitor.
  box(1.7, 1.0, 0.1, C.navy, 1.15, dTop + 0.66, deskZ - 0.5);
  add(new THREE.PlaneGeometry(1.5, 0.84),
      new THREE.MeshBasicMaterial({ color: 0x1d3450, toneMapped: false }),
      1.15, dTop + 0.66, deskZ - 0.44);
  cyl(0.28, 0.32, 0.06, C.navy, 1.15, dTop + 0.03, deskZ - 0.5, 28);
  // Keyboard, mug, notebook. The coin stacks that used to sit here moved to the
  // cupboard, so the money reads as one idea in one place.
  box(1.1, 0.06, 0.42, C.skyPale, 1.15, dTop + 0.03, deskZ + 0.25);
  cyl(0.17, 0.15, 0.34, C.coral, 2.35, dTop + 0.17, deskZ + 0.3, 28);
  box(0.8, 0.1, 0.6, C.white, 0.1, dTop + 0.05, deskZ + 0.2).rotation.y = 0.14;

  // Chair.
  const chair = new THREE.Group();
  chair.position.set(1.25, 0, deskZ + 1.7);
  room.add(chair);
  box(0.86, 0.16, 0.84, C.orange, 0, 0.92, 0, chair);
  box(0.82, 0.9, 0.14, C.orange, 0, 1.42, 0.38, chair);
  cyl(0.08, 0.08, 0.86, C.navy, 0, 0.5, 0, 22, chair);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    box(0.5, 0.08, 0.12, C.navy, Math.cos(a) * 0.26, 0.12, Math.sin(a) * 0.26, chair)
      .rotation.y = -a;
  }

  /* --------------------------------------------- bookshelf on the left wall */
  const shelfX = -half + 0.55;
  box(0.16, 3.3, 2.4, C.cream, shelfX - 0.16, 1.65, 1.6);
  const shelfYs = [0.5, 1.5, 2.5];
  shelfYs.forEach(y => box(0.95, 0.12, 2.3, C.cream, shelfX, y, 1.6));
  const bookCols = [C.coral, C.green, C.yellow, C.skyLight, C.orange, C.sky];
  shelfYs.forEach((y, row) => {
    for (let i = 0; i < 6; i++) {
      const h = 0.46 + ((i + row) % 3) * 0.12;
      box(0.56, h, 0.16, bookCols[(i + row) % bookCols.length],
          shelfX, y + 0.06 + h / 2, 0.65 + i * 0.28);
    }
  });

  // Framed art on the back wall.
  box(1.3, 1.0, 0.09, C.navyMid, 2.6, 3.4, -half + 0.34);
  box(1.06, 0.78, 0.05, C.skyLight, 2.6, 3.4, -half + 0.4);

  /* ---------------------------------------------------------- floor lamp */
  const lamp = new THREE.Group();
  lamp.position.set(3.1, 0, 2.4);
  room.add(lamp);
  cyl(0.4, 0.46, 0.1, C.navy, 0, 0.05, 0, 30, lamp);
  cyl(0.05, 0.05, 2.9, C.navy, 0, 1.5, 0, 20, lamp);
  add(new THREE.ConeGeometry(0.6, 0.66, 30, 1, true),
      mat(C.orange, { side: THREE.DoubleSide }), 0, 3.1, 0, lamp);
  add(new THREE.SphereGeometry(0.13, 18, 14),
      new THREE.MeshBasicMaterial({ color: 0xffeccb, toneMapped: false }),
      0, 2.9, 0, lamp);
  const bulb = new THREE.PointLight(0xffdfae, 8, 9, 2);
  bulb.position.set(3.1, 2.86, 2.4);
  room.add(bulb);

  /* An invisible cylinder round the lamp, purely as a click target. The pole is
     0.05 units across and the shade isn't much bigger — without this the lamp is
     nearly impossible to hit with a mouse. Renders nothing (opacity 0, no depth
     write) but still raycasts. */
  const lampHit = new THREE.Mesh(
    new THREE.CylinderGeometry(0.72, 0.72, 3.4, 12),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  lampHit.position.set(0, 1.7, 0);
  lampHit.castShadow = false;
  lampHit.receiveShadow = false;
  lamp.add(lampHit);

  /* ------------------------------------------------- the cupboard money grows in
     The one narrative object in the room: a cupboard with a money tree on top —
     a plant whose leaves are coins — flanked by stacks that climb left to right.
     It sits against the back wall beside the desk, in the corner the standalone
     plant used to occupy. */
  const CAB_X = -2.95, CAB_Z = -half + 0.79, CAB_H = 2.05;

  // Its own group, sitting on the floor, so the hover scale grows it upward
  // from the base instead of from the world origin.
  const cupboard = new THREE.Group();
  cupboard.position.set(CAB_X, 0, CAB_Z);
  room.add(cupboard);

  box(1.9, CAB_H, 0.9, C.cream, 0, CAB_H / 2, 0, cupboard);          // carcass
  [-0.47, 0.47].forEach(dx => {
    box(0.86, CAB_H - 0.18, 0.06, C.wood, dx, CAB_H / 2, 0.46, cupboard);
    cyl(0.045, 0.045, 0.2, C.navy, dx + (dx > 0 ? -0.3 : 0.3),
        CAB_H / 2, 0.52, 14, cupboard).rotation.x = Math.PI / 2;     // handle
  });
  box(2.02, 0.1, 1.0, C.cream, 0, CAB_H + 0.05, 0, cupboard);        // top lip

  const top = CAB_H + 0.1;

  // Money tree: coins for leaves. Part of the cupboard group, so the whole
  // unit responds as one thing.
  const tree = new THREE.Group();
  tree.position.set(-0.5, top, -0.02);
  cupboard.add(tree);
  cyl(0.28, 0.22, 0.42, C.coral, 0, 0.21, 0, 28, tree);
  cyl(0.045, 0.045, 0.85, C.green, 0, 0.82, 0, 14, tree);
  [[0, 1.34, 0, 0], [0.25, 1.12, 0.05, 0.55], [-0.23, 1.02, -0.07, -0.6],
   [0.09, 1.44, -0.18, 0.22], [-0.11, 1.26, 0.2, -0.28]]
    .forEach(([dx, y, dz, tilt]) => {
      const leaf = cyl(0.17, 0.17, 0.045, C.yellow, dx, y, dz, 26, tree);
      leaf.rotation.z = tilt;
      leaf.rotation.x = 0.34;
    });

  // Stacks climbing left to right — growth, without pretending to be a chart.
  [[0.2, 3], [0.48, 5], [0.76, 8]].forEach(([dx, n]) => {
    for (let i = 0; i < n; i++) {
      cyl(0.19, 0.19, 0.075, C.yellow, dx, top + 0.04 + i * 0.078, 0.04, 26, cupboard);
    }
  });

  /* ------------------------------------------------------------ interaction
     Two objects respond to a click. Both are strictly *shortcuts* — the theme
     toggle lives in the nav and the savings field is right there on the page —
     so the panel can stay aria-hidden without hiding any unique function, and
     nothing here is the only way to do anything. That also keeps it honest
     below 860px, where the panel isn't rendered at all. */
  const targets = [
    {
      root: lamp,
      run() { if (typeof window.toggleTheme === 'function') window.toggleTheme(); }
    },
    {
      root: cupboard,
      run() {
        const input = document.getElementById('pS');
        const field = document.getElementById('field-pS');
        if (!input) return;
        input.focus({ preventScroll: true });
        input.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (field) {
          field.classList.add('field-flash');
          setTimeout(() => field.classList.remove('field-flash'), 1300);
        }
      }
    }
  ];

  // Cache each target's meshes and their base emissive, so hover can tint them
  // back and forth without re-walking the tree every pointer move.
  targets.forEach(t => {
    t.meshes = [];
    t.root.traverse(o => {
      // MeshBasicMaterial has no emissive channel, which conveniently excludes
      // the invisible hit proxies from the hover tint.
      if (o.isMesh && o.material && o.material.emissive) t.meshes.push(o);
    });
    t.baseScale = t.root.scale.x;
  });

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let hovered = null;
  let lastCast = 0;

  function pick(ev) {
    const r = canvas.getBoundingClientRect();
    ndc.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    for (const t of targets) {
      if (raycaster.intersectObject(t.root, true).length) return t;
    }
    return null;
  }

  function setHover(t) {
    if (hovered === t) return;
    if (hovered) hovered.meshes.forEach(m => m.material.emissive.setHex(0x000000));
    hovered = t;
    if (hovered) hovered.meshes.forEach(m => m.material.emissive.setHex(0x1d3350));
    canvas.style.cursor = hovered ? 'pointer' : '';
  }

  canvas.addEventListener('pointermove', ev => {
    // Raycasting every move is wasted work; ~15/s is plenty for a cursor.
    const now = performance.now();
    if (now - lastCast < 66) return;
    lastCast = now;
    setHover(pick(ev));
  }, { passive: true });

  canvas.addEventListener('pointerleave', () => setHover(null), { passive: true });

  canvas.addEventListener('click', ev => {
    const t = pick(ev);
    if (t) t.run();
  });

  /* Now that every prop is in place, measure what the camera has to frame. */
  {
    const bounds = new THREE.Box3().setFromObject(room);
    // Aim at the model's real centre rather than a hand-guessed height.
    bounds.getCenter(lookAt);
    for (const x of [bounds.min.x, bounds.max.x])
      for (const y of [bounds.min.y, bounds.max.y])
        for (const z of [bounds.min.z, bounds.max.z])
          corners.push(new THREE.Vector3(x, y, z));
  }

  /* -------------------------------------------------- ambient occlusion pass */
  let composer = null;
  function buildComposer(w, h) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const gtao = new GTAOPass(scene, camera, w, h);
    gtao.output = GTAOPass.OUTPUT.Default;
    gtao.updateGtaoMaterial({
      radius: 0.32, distanceExponent: 1.4, thickness: 1.0,
      scale: 1.0, samples: 8, screenSpaceRadius: false
    });
    composer.addPass(gtao);
    composer.addPass(new OutputPass());
    composer.setSize(w, h);
  }

  /* ------------------------------------------------------------- theme sync */
  // The model keeps its brand colours in both themes; only the lighting moves,
  // so it sits correctly on a white panel or a navy one.
  function applyTheme() {
    const dark = document.documentElement.getAttribute('data-theme') !== 'light';
    ambient.intensity = dark ? 0.06 : 0.1;
    hemi.intensity = dark ? 0.22 : 0.3;
    scene.environmentIntensity = dark ? 0.4 : 0.5;
    renderer.toneMappingExposure = dark ? 1.12 : 1.2;
    bulb.intensity = dark ? 8 : 4;
  }
  applyTheme();
  new MutationObserver(applyTheme).observe(document.documentElement, {
    attributes: true, attributeFilter: ['data-theme']
  });

  /* ------------------------------------------------------- size + run loop */
  function resize() {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return false;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    frameCamera();
    placeCamera(spin);
    renderer.setSize(w, h, false);
    if (!composer) buildComposer(w, h); else composer.setSize(w, h);
    return true;
  }

  let spin = 0;
  let phase = 0;
  let running = false;
  let lastT = 0;
  function frame() {
    if (!running) return;
    const t = performance.now();
    const dt = Math.min(t - lastT, 64);
    lastT = t;
    if (!reduceMotion) {
      /* A bounded drift, not a full orbit — the room is open on two sides, so
         rotating all the way round swings the solid walls to the front and
         hides everything inside. The sign-in diorama oscillates between limits
         for the same reason. */
      phase += dt * 0.00009;
      spin = Math.sin(phase) * SPIN_LIMIT;
      placeCamera(spin);
    }
    if (composer) composer.render(); else renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  function start() {
    if (running || document.hidden) return;
    if (!resize()) return;
    running = true;
    lastT = performance.now();
    frame();
  }
  function stop() { running = false; }

  /* This module runs while the page is still auth-pending, so the panel
     measures 0x0 and resize() refuses to size the canvas. Without an observer
     the canvas keeps its 300x150 HTML default and gets stretched across the
     panel, which reads as a badly blurred render rather than a sizing bug. */
  new ResizeObserver(() => { resize() ? start() : stop(); }).observe(host);
  document.addEventListener('visibilitychange', () => document.hidden ? stop() : start());
  start();
}
