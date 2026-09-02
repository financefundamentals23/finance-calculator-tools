/* room-scene.js — the isometric 3D diorama on the sign-in page.
 *
 * A nod to Bruno Simon's Three.js Journey landing scene: a corner-cut room on a
 * floating plinth, flat "clay" materials, soft shadows, slow orbit, draggable.
 *
 * Everything here is built from primitives at runtime — there is no .glb to
 * load and no baked lightmap, so the whole scene ships as this one file. The
 * two screen graphics (monitor, wall logo) are drawn into 2D canvases and used
 * as textures.
 *
 * Colours come from the site's own brand tokens so the diorama sits correctly
 * against either theme; the canvas is transparent, so the panel gradient in
 * styles.css shows through behind it.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
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
  floor:     0xe9eff8,
  white:     0xf7fbff,
  wood:      0xdcc0a0,
  woodDark:  0xc2a181,
  orange:    0xf4a341,
  coral:     0xef6a5f,
  green:     0x4fd39a,
  yellow:    0xe7c948
};

const canvas = document.getElementById('roomCanvas');
if (canvas && canvas.parentElement) {
  try {
    init(canvas, canvas.parentElement);
  } catch (err) {
    // A WebGL failure must not take the sign-in form down with it — the CSS
    // panel gradient behind the canvas is a perfectly good fallback.
    console.warn('Room scene disabled:', err);
    canvas.style.display = 'none';
  }
}

function init(canvas, host) {
  const reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------------------------------------------------------- renderer */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearAlpha(0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  const scene = new THREE.Scene();

  /* Image-based lighting. RoomEnvironment is a procedural studio box that ships
     with three, so this costs no download — but it's what does the heavy
     lifting: every surface picks up soft directional fill and gentle corner
     falloff instead of the flat wash three point lights give you. Baked once
     into a PMREM cube, then the source is thrown away. */
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = envRT.texture;
  scene.environmentIntensity = 0.34;
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 140);
  camera.position.set(20.5, 15, 20.5);

  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 2.0, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.enablePan = false;
  controls.minDistance = 26;
  controls.maxDistance = 50;
  // The default view sits at polar ~1.15; this range lets it tilt a little
  // either way without ever reaching an overhead floor-plan or a flat
  // ground-level view.
  controls.minPolarAngle = 0.95;
  controls.maxPolarAngle = 1.25;
  // Keep the camera inside the room's open corner. Without this you can orbit
  // round behind the walls and end up staring at their blank backs.
  controls.minAzimuthAngle = 0.16;
  controls.maxAzimuthAngle = 1.41;

  // Idle drift is a pendulum rather than OrbitControls' autoRotate: autoRotate
  // would run straight into the azimuth clamp above and stick there. This
  // nudges the angle each frame and reverses at the ends, so it also picks up
  // seamlessly from wherever the visitor left the camera.
  const DRIFT_MIN = 0.30, DRIFT_MAX = 1.27, DRIFT_SPEED = 0.00004;
  const spherical = new THREE.Spherical();
  const offset = new THREE.Vector3();
  let drifting = !reduceMotion;
  let driftDir = 1;
  let resumeTimer = null;

  controls.addEventListener('start', () => {
    drifting = false;
    clearTimeout(resumeTimer);
  });
  controls.addEventListener('end', () => {
    if (reduceMotion) return;
    clearTimeout(resumeTimer);
    resumeTimer = setTimeout(() => { drifting = true; }, 2500);
  });

  function drift(dt) {
    if (!drifting) return;
    offset.copy(camera.position).sub(controls.target);
    spherical.setFromVector3(offset);
    if (spherical.theta >= DRIFT_MAX) driftDir = -1;
    else if (spherical.theta <= DRIFT_MIN) driftDir = 1;
    spherical.theta += driftDir * DRIFT_SPEED * dt;
    offset.setFromSpherical(spherical);
    camera.position.copy(controls.target).add(offset);
  }

  /* ------------------------------------------------------------------ lights */
  /* With IBL carrying the fill, the flat ambient drops right down — it was
     washing out exactly the shading gradients that make the render read as
     three-dimensional. */
  const ambient = new THREE.AmbientLight(0xffffff, 0.045);
  scene.add(ambient);

  const hemi = new THREE.HemisphereLight(0xffffff, C.navyMid, 0.14);
  scene.add(hemi);

  /* Raking rather than overhead: a lower, more side-on key separates the two
     walls into distinct values and throws object shadows across the floor,
     which is what grounds everything. */
  const key = new THREE.DirectionalLight(0xfff4e8, 3.6);
  key.position.set(10.5, 8.5, 8.5);
  key.castShadow = true;
  key.shadow.mapSize.set(3072, 3072);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 50;
  key.shadow.camera.left = -8.5;
  key.shadow.camera.right = 8.5;
  key.shadow.camera.top = 8.5;
  key.shadow.camera.bottom = -8.5;
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.018;
  scene.add(key);

  const fill = new THREE.DirectionalLight(C.skyPale, 0.42);
  fill.position.set(-10, 7, 6);
  scene.add(fill);

  /* Coloured bounce from below — the trick that gives reference renders their
     candy warmth, standing in for light kicking back off the floor. */
  const bounce = new THREE.DirectionalLight(C.coral, 0.30);
  bounce.position.set(-6, -4, -8);
  scene.add(bounce);

  /* ---------------------------------------------------- ambient occlusion pass
     Real-time lighting can't work out that a corner is enclosed, so corners stay
     as bright as open floor and the scene reads flat. GTAO samples the depth
     buffer to darken creases and contact points — the single biggest step toward
     the look of an offline render. The composer keeps an alpha buffer so the
     canvas stays transparent over the panel gradient. */
  let composer = null, gtao = null;
  function buildComposer() {
    const w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight);
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    gtao = new GTAOPass(scene, camera, w, h);
    gtao.output = GTAOPass.OUTPUT.Default;
    gtao.updateGtaoMaterial({
      radius: 0.32,
      distanceExponent: 1.4,
      thickness: 1.0,
      scale: 1.1,
      samples: 16,
      screenSpaceRadius: false
    });
    composer.addPass(gtao);
    composer.addPass(new OutputPass());
    composer.setSize(w, h);
  }

  /* ------------------------------------------------------------- build tools */
  const materials = [];
  function mat(color, opts) {
    const m = new THREE.MeshStandardMaterial(
      Object.assign({ color, roughness: 0.7, metalness: 0, envMapIntensity: 1.0 },
                    opts || {})
    );
    materials.push(m);
    return m;
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
  /* Every edge gets a small fillet. Hard 90-degree corners are what make
     primitive-built scenes read as programmer art — a bevel catches a highlight
     along each edge and the whole thing reads as moulded instead of assembled.
     The radius has to stay under half the thinnest side or the geometry
     inverts, and some pieces here are 0.02 deep, so it scales per box. */
  function box(w, h, d, color, x, y, z, parent) {
    const r = Math.min(0.055, Math.min(w, h, d) * 0.34);
    return add(new RoundedBoxGeometry(w, h, d, 3, r), mat(color), x, y, z, parent);
  }
  function cyl(rt, rb, h, color, x, y, z, seg, parent) {
    return add(new THREE.CylinderGeometry(rt, rb, h, seg || 40), mat(color), x, y, z, parent);
  }

  /* --------------------------------------------------------- room + plinth */
  // Plinth: the diorama reads as an object sitting in space, not a cropped room.
  const plinth = box(11.6, 0.7, 11.6, C.skyLight, 0, -0.85, 0);
  plinth.castShadow = false;

  const floor = box(10.4, 0.5, 10.4, C.floor, 0, -0.25, 0);
  floor.castShadow = false;

  box(10.4, 7, 0.4, C.sky, 0, 3.5, -5);       // back wall
  box(0.4, 7, 10.4, C.navyMid, -5, 3.5, 0);   // left wall

  // Window recess punched into the back wall, with mullions.
  box(4.4, 3.2, 0.14, C.navy, 0.6, 4.3, -4.88);
  box(4.7, 0.18, 0.3, C.white, 0.6, 5.98, -4.86);
  box(4.7, 0.18, 0.3, C.white, 0.6, 2.62, -4.86);
  box(0.16, 3.2, 0.3, C.white, 0.6, 4.3, -4.86);
  box(4.4, 0.14, 0.3, C.white, 0.6, 4.3, -4.86);

  // Skirting where the walls meet the floor.
  box(10.4, 0.34, 0.16, C.white, 0, 0.17, -4.72);
  box(0.16, 0.34, 10.4, C.white, -4.72, 0.17, 0);

  /* ---------------------------------------------------------------- the desk */
  const deskX = 1.5, deskZ = -3.5;
  box(3.8, 0.2, 1.8, C.wood, deskX, 1.5, deskZ);
  box(0.16, 1.4, 1.6, C.woodDark, deskX - 1.75, 0.7, deskZ);
  box(0.16, 1.4, 1.6, C.woodDark, deskX + 1.75, 0.7, deskZ);
  box(3.4, 0.12, 0.14, C.woodDark, deskX, 1.05, deskZ - 0.75);

  // Monitor, angled slightly toward the camera.
  box(0.8, 0.08, 0.55, C.navyLight, deskX, 1.64, deskZ - 0.3);
  cyl(0.08, 0.08, 0.75, C.navyLight, deskX, 2.02, deskZ - 0.3, 32);
  const monitor = box(2.2, 1.34, 0.11, C.navy, deskX, 2.78, deskZ - 0.3);
  monitor.rotation.x = -0.07;
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(2.02, 1.16),
    new THREE.MeshBasicMaterial({ map: makeScreenTexture(), toneMapped: false })
  );
  screen.position.set(0, 0, 0.058);
  monitor.add(screen);

  box(1.4, 0.08, 0.46, C.white, deskX, 1.64, deskZ + 0.42);   // keyboard
  box(0.3, 0.06, 0.42, C.white, deskX + 1.05, 1.63, deskZ + 0.42); // mouse

  // Mug
  cyl(0.17, 0.15, 0.34, C.coral, deskX - 1.3, 1.77, deskZ + 0.3, 18);
  const handle = add(
    new THREE.TorusGeometry(0.11, 0.032, 10, 20), mat(C.coral),
    deskX - 1.47, 1.77, deskZ + 0.3
  );
  handle.rotation.y = Math.PI / 2;

  // Small paper stack
  box(0.5, 0.05, 0.66, C.white, deskX + 1.25, 1.62, deskZ - 0.35);

  /* --------------------------------------------------------------- the chair */
  const chair = new THREE.Group();
  chair.position.set(deskX - 0.1, 0, -1.35);
  chair.rotation.y = -0.32;
  room.add(chair);

  box(1.05, 0.2, 1.0, C.orange, 0, 1.08, 0, chair);
  const backRest = box(1.05, 1.05, 0.18, C.orange, 0, 1.68, 0.46, chair);
  backRest.rotation.x = 0.13;
  cyl(0.1, 0.1, 0.92, C.navyLight, 0, 0.6, 0, 32, chair);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const leg = box(0.66, 0.1, 0.15, C.navyLight, Math.cos(a) * 0.33, 0.17, Math.sin(a) * 0.33, chair);
    leg.rotation.y = -a;
    add(new THREE.SphereGeometry(0.1, 12, 10), mat(C.navy),
      Math.cos(a) * 0.62, 0.1, Math.sin(a) * 0.62, chair);
  }

  /* ------------------------------------------------------- shelf (left wall) */
  const shelfX = -4.42, shelfZ = -1.5;
  box(0.95, 0.14, 4.2, C.wood, shelfX, 3.3, shelfZ);
  box(0.95, 0.14, 4.2, C.wood, shelfX, 4.75, shelfZ);
  box(0.16, 1.6, 0.16, C.woodDark, shelfX, 4.02, shelfZ - 1.95);
  box(0.16, 1.6, 0.16, C.woodDark, shelfX, 4.02, shelfZ + 1.95);

  // Books leaning on the lower shelf.
  const bookColors = [C.coral, C.green, C.yellow, C.skyLight, C.orange];
  bookColors.forEach((col, i) => {
    const b = box(0.62, 0.86, 0.19, col, shelfX, 3.8, shelfZ - 1.55 + i * 0.26);
    b.rotation.x = i === 4 ? 0.42 : 0;
    if (i === 4) b.position.y = 3.76;
  });

  // Row of spheres on the upper shelf — Bruno's colourful beads, restated in
  // the brand palette.
  [C.sky, C.green, C.yellow, C.orange, C.coral, C.skyLight].forEach((col, i) => {
    add(new THREE.SphereGeometry(0.21, 20, 16), mat(col),
      shelfX, 5.03, shelfZ - 1.4 + i * 0.46);
  });

  /* ------------------------------------------------------------- the vault */
  const vault = new THREE.Group();
  vault.position.set(-3.5, 0, -2.7);
  vault.rotation.y = 0.42;
  room.add(vault);
  box(1.7, 1.7, 1.5, C.coral, 0, 0.85, 0, vault);
  box(1.5, 1.5, 0.12, C.white, 0, 0.85, 0.76, vault);
  const dial = add(new THREE.TorusGeometry(0.26, 0.075, 12, 26), mat(C.yellow), 0, 0.85, 0.85, vault);
  dial.rotation.x = Math.PI / 2;
  dial.rotation.z = Math.PI / 2;
  cyl(0.09, 0.09, 0.2, C.yellow, 0, 0.85, 0.88, 28, vault).rotation.x = Math.PI / 2;

  /* -------------------------------------------------------------- the coins */
  const coinStack = new THREE.Group();
  coinStack.position.set(-2.3, 0, 2.9);
  room.add(coinStack);
  for (let i = 0; i < 6; i++) {
    const c = cyl(0.44, 0.44, 0.13, i % 2 ? C.orange : C.yellow, 0, 0.07 + i * 0.13, 0, 26, coinStack);
    c.rotation.y = i * 0.4;
  }
  cyl(0.44, 0.44, 0.13, C.yellow, 0.95, 0.07, 0.35, 26).rotation.z = Math.PI / 2;
  cyl(0.44, 0.44, 0.13, C.orange, -0.55, 0.07, 1.05, 26);

  /* -------------------------------------------------------------- the plant */
  const pot = cyl(0.44, 0.34, 0.62, C.coral, -3.9, 0.31, 3.5, 36);
  pot.castShadow = true;
  add(new THREE.CapsuleGeometry(0.32, 1.15, 6, 16), mat(C.green), -3.9, 1.35, 3.5);
  const armL = add(new THREE.CapsuleGeometry(0.17, 0.5, 5, 14), mat(C.green), -4.32, 1.6, 3.5);
  armL.rotation.z = 0.75;
  const armR = add(new THREE.CapsuleGeometry(0.17, 0.42, 5, 14), mat(C.green), -3.5, 1.85, 3.5);
  armR.rotation.z = -0.75;

  /* ---------------------------------------------------------------- the rug */
  const rug = box(4.8, 0.07, 3.3, C.green, 1.1, 0.035, 1.9);
  rug.castShadow = false;
  box(4.2, 0.02, 2.75, C.skyPale, 1.1, 0.078, 1.9).castShadow = false;

  /* --------------------------------------------------------------- the lamp */
  // Tucked into the back-right corner so it lights the desk without standing
  // in front of it. Cone's default orientation (apex up, base down) is already
  // a lampshade — no flip needed.
  const lamp = new THREE.Group();
  lamp.position.set(4.3, 0, -3.9);
  room.add(lamp);
  cyl(0.42, 0.5, 0.14, C.navyLight, 0, 0.07, 0, 40, lamp);
  cyl(0.07, 0.07, 2.9, C.navyLight, 0, 1.5, 0, 28, lamp);
  add(new THREE.ConeGeometry(0.6, 0.72, 24, 1, true),
    new THREE.MeshStandardMaterial({ color: C.orange, roughness: 0.8, side: THREE.DoubleSide }),
    0, 3.2, 0, lamp);
  const bulb = new THREE.PointLight(0xffe6bd, 10, 9, 2);
  bulb.position.set(0, 2.9, 0);
  lamp.add(bulb);
  add(new THREE.SphereGeometry(0.14, 14, 12),
    new THREE.MeshBasicMaterial({ color: 0xffeccb, toneMapped: false }), 0, 2.95, 0, lamp);

  /* ------------------------------------------------- brand mark on the wall */
  const logo = new THREE.Mesh(
    new THREE.PlaneGeometry(1.9, 1.9),
    new THREE.MeshBasicMaterial({ map: makeLogoTexture(), transparent: true, toneMapped: false })
  );
  logo.position.set(3.5, 4.7, -4.78);
  room.add(logo);

  /* ------------------------------------------- floating wireframe geometries */
  // The three.js signature: a wireframe cube and octahedron hanging in the air.
  const floaters = [];
  function floater(geo, color, x, y, z, scale) {
    const g = new THREE.Group();
    // WebGL ignores line thickness, so the wireframe alone reads too faint —
    // a translucent solid behind the edges gives it body.
    const solid = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      color, roughness: 0.9, transparent: true, opacity: 0.3
    }));
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geo),
      new THREE.LineBasicMaterial({ color })
    );
    g.add(solid, edges);
    g.position.set(x, y, z);
    g.scale.setScalar(scale);
    g.userData.baseY = y;
    room.add(g);
    floaters.push(g);
    return g;
  }
  floater(new THREE.BoxGeometry(1, 1, 1), C.coral, -2.4, 5.5, -2.4, 0.95);
  floater(new THREE.OctahedronGeometry(0.72), C.green, -1.0, 6.2, -1.2, 0.95);

  /* ----------------------------------------------------- canvas texture art */
  function makeScreenTexture() {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 294;
    const g = c.getContext('2d');

    g.fillStyle = '#0e1a2c'; g.fillRect(0, 0, 512, 294);

    g.strokeStyle = '#22385c'; g.lineWidth = 1;
    for (let i = 1; i < 5; i++) {
      g.beginPath(); g.moveTo(38, 34 + i * 44); g.lineTo(482, 34 + i * 44); g.stroke();
    }

    const pts = [[38, 232], [122, 205], [206, 168], [290, 128], [374, 82], [462, 46]];
    const grad = g.createLinearGradient(0, 46, 0, 250);
    grad.addColorStop(0, 'rgba(92,182,249,0.42)');
    grad.addColorStop(1, 'rgba(92,182,249,0)');
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
    pts.forEach(p => g.lineTo(p[0], p[1]));
    g.lineTo(462, 250); g.lineTo(38, 250); g.closePath();
    g.fillStyle = grad; g.fill();

    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
    pts.forEach(p => g.lineTo(p[0], p[1]));
    g.strokeStyle = '#5cb6f9'; g.lineWidth = 6;
    g.lineJoin = 'round'; g.lineCap = 'round'; g.stroke();

    pts.forEach(p => {
      g.beginPath(); g.arc(p[0], p[1], 7, 0, Math.PI * 2);
      g.fillStyle = '#0e1a2c'; g.fill();
      g.strokeStyle = '#8ccbfb'; g.lineWidth = 4; g.stroke();
    });

    g.fillStyle = '#4fd39a';
    g.font = '700 40px "League Spartan", system-ui, sans-serif';
    g.fillText('2.80', 38, 285);
    g.fillStyle = '#7d93b0';
    g.font = '600 19px "League Spartan", system-ui, sans-serif';
    g.fillText('AFFORDABILITY INDEX', 132, 283);

    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
  }

  function makeLogoTexture() {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    const g = c.getContext('2d');
    g.font = '800 160px "League Spartan", system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(19,33,53,0.55)';
    g.fillText('Ff', 134, 138);
    g.fillStyle = '#ffffff';
    g.fillText('Ff', 128, 132);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  /* ------------------------------------------------------------ theme sync */
  // The model keeps its brand colours in both themes; only the lighting shifts,
  // so the diorama sits correctly on a white panel or a navy one.
  function applyTheme() {
    const dark = document.documentElement.getAttribute('data-theme') !== 'light';
    ambient.intensity = dark ? 0.045 : 0.075;
    hemi.intensity = dark ? 0.14 : 0.20;
    scene.environmentIntensity = dark ? 0.34 : 0.42;
    renderer.toneMappingExposure = dark ? 1.15 : 1.24;
  }
  applyTheme();
  new MutationObserver(applyTheme).observe(document.documentElement, {
    attributes: true, attributeFilter: ['data-theme']
  });

  /* ------------------------------------------------------- size + run loop */
  buildComposer();

  function resize() {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return false;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    if (composer) composer.setSize(w, h);
    return true;
  }

  let running = false;
  let lastT = 0;
  function frame() {
    if (!running) return;
    const t = performance.now();
    // Clamp dt so a backgrounded tab doesn't resume with one huge jump.
    const dt = Math.min(t - lastT, 64);
    lastT = t;

    if (!reduceMotion) {
      floaters.forEach((f, i) => {
        f.rotation.x += 0.0022;
        f.rotation.y += 0.0031;
        f.position.y = f.userData.baseY + Math.sin(t * 0.0008 + i * 1.7) * 0.16;
      });
    }
    drift(dt);
    controls.update();
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

  // Don't burn frames when the panel is hidden (mobile breakpoint) or the tab
  // is in the background.
  new ResizeObserver(() => { resize() ? start() : stop(); }).observe(host);
  document.addEventListener('visibilitychange', () => document.hidden ? stop() : start());
  start();
}
